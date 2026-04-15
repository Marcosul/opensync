import chokidar from "chokidar";
import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SyncConfig } from "./config";
import * as api from "./api";
import * as db from "./db";
import type Database from "better-sqlite3";
import { mergeTextPreserveBoth, shouldIgnore as syncShouldIgnore, type VaultSseEvent } from "@opensync/sync";

const LOG = "[opensync]";
const DEBOUNCE_MS = 3000;
/** Após upload local, manter o path em `pendingLocalUpload` mais este tempo para o poll não reaplicar revisão antiga do servidor por cima do ficheiro no disco. */
const POST_UPLOAD_POLL_GUARD_MS = 6000;
/** Quando SSE está ativo, o fallback poll de segurança usa este intervalo mais longo. */
const SSE_FALLBACK_POLL_MS = 60_000;
const SSE_RECONNECT_DELAY_BASE_MS = 1_000;
const SSE_RECONNECT_DELAY_MAX_MS = 30_000;

function versionRank(v: string | null | undefined): bigint {
  if (v == null) return -1n;
  const s = String(v).trim();
  if (s === "") return -1n;
  try {
    return BigInt(s);
  } catch {
    return -1n;
  }
}

/** ANSI — visível em journalctl e terminal */
const C = {
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
};

const HEARTBEAT_MS = 60_000;

function shouldIgnore(cfg: SyncConfig, rel: string): boolean {
  return syncShouldIgnore(cfg.ignore, rel);
}

async function readLocalFile(abs: string, maxBytes: number): Promise<string | null> {
  try {
    const st = await fs.stat(abs);
    if (!st.isFile() || st.size > maxBytes) return null;
    const buf = await fs.readFile(abs);
    if (buf.includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

const MERGE_UPSERT_MAX_ATTEMPTS = 4;
const MERGE_UPSERT_DELAYS_MS = [250, 600, 1200];

function isTransientMergeUpsertStatus(st: number | undefined): boolean {
  if (st === undefined) return true;
  if (st === 408 || st === 429) return true;
  return st >= 500 && st <= 599;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Upsert do texto fusionado com backoff e re-merge em 409 (tip do servidor mudou).
 */
async function upsertMergedBodyWithRetry(
  cfg: SyncConfig,
  token: string,
  filePath: string,
  initialBody: string,
  initialBaseVersion: string,
  maxFileSizeBytes: number,
): Promise<{ ok: true; version: string; body: string } | { ok: false; body: string; baseVersion: string }> {
  let body = initialBody;
  let baseVersion = initialBaseVersion;
  const abs = path.join(cfg.syncDir, filePath);
  for (let attempt = 0; attempt < MERGE_UPSERT_MAX_ATTEMPTS; attempt++) {
    try {
      const up = await api.upsertFile(cfg, token, filePath, body, baseVersion);
      if (attempt > 0) {
        console.warn(
          `${C.cyan}${LOG}${C.reset} ${C.green}✅ merge upsert após retry${C.reset} ${C.dim}${filePath} · tentativa ${attempt + 1}/${MERGE_UPSERT_MAX_ATTEMPTS} · v${up.version}${C.reset}`,
        );
      }
      return { ok: true, version: up.version, body };
    } catch (e: unknown) {
      const err = e as { status?: number };
      const st = err.status;
      if (st === 401 || st === 403) throw err;
      if (st === 409) {
        try {
          const r = await api.getFileContent(cfg, token, filePath);
          const local = await readLocalFile(abs, maxFileSizeBytes);
          body = local !== null ? mergeTextPreserveBoth(local, r.content) : r.content;
          baseVersion = r.version;
          if (attempt < MERGE_UPSERT_MAX_ATTEMPTS - 1) {
            console.warn(
              `${C.yellow}${LOG}${C.reset} 🔁 merge upsert 409 — recalcular merge e retry: ${filePath} (${attempt + 1}/${MERGE_UPSERT_MAX_ATTEMPTS})`,
            );
          }
        } catch {
          /* mantém body/baseVersion */
        }
      } else if (!isTransientMergeUpsertStatus(st)) {
        return { ok: false, body, baseVersion };
      }
      if (attempt < MERGE_UPSERT_MAX_ATTEMPTS - 1) {
        await sleepMs(MERGE_UPSERT_DELAYS_MS[Math.min(attempt, MERGE_UPSERT_DELAYS_MS.length - 1)]);
      }
    }
  }
  return { ok: false, body, baseVersion };
}

async function reconcileDeletedLocalFiles(
  database: Database.Database,
  cfg: SyncConfig,
  remoteWriting: Set<string>,
): Promise<void> {
  const deletedPaths = db.listDeletedPaths(database);
  if (deletedPaths.length === 0) return;
  for (const rel of deletedPaths) {
    const abs = path.join(cfg.syncDir, rel);
    remoteWriting.add(rel);
    try {
      await fs.rm(abs, { force: true });
    } catch {
      /* ignora erro de permissão momentânea; próximo ciclo tenta de novo */
    } finally {
      setTimeout(() => remoteWriting.delete(rel), DEBOUNCE_MS + 1000);
    }
  }
}

/** Varre o diretório local e faz upload de arquivos ainda não sincronizados.
 *  Executado no início de cada run para garantir que arquivos pré-existentes
 *  sejam enviados ao vault (FULL_RECONCILE do PRD sec. 5.1). */
async function fullReconcile(
  database: Database.Database,
  cfg: SyncConfig,
  token: string,
  remoteWriting: Set<string>,
): Promise<void> {
  console.log(LOG, "full reconcile iniciado em", cfg.syncDir);
  let uploaded = 0;
  let skipped = 0;

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(cfg.syncDir, abs).split(path.sep).join("/");
      if (shouldIgnore(cfg, rel)) continue;
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        const text = await readLocalFile(abs, cfg.maxFileSizeBytes);
        if (text === null) { skipped++; continue; }
        const h = db.hashContent(text);
        const row = db.fileState(database, rel);
        if (row?.last_synced_hash === h) continue; // já sincronizado
        await syncLocalPath(database, cfg, token, rel, remoteWriting);
        uploaded++;
      }
    }
  }

  await walk(cfg.syncDir);
  console.log(LOG, `full reconcile concluido: ${uploaded} enviados, ${skipped} ignorados`);
}

/**
 * Conecta ao endpoint SSE do servidor e chama `onEvent` a cada notificação de mudança.
 * Chama `onDisconnect` sempre que a ligação cai (antes de reconectar).
 * Faz reconexão automática com exponential backoff.
 * Retorna função de cleanup para encerrar a conexão.
 */
function connectSse(
  cfg: SyncConfig,
  token: string,
  onEvent: () => Promise<void>,
  onDisconnect?: () => void,
): () => void {
  let stopped = false;
  let delay = SSE_RECONNECT_DELAY_BASE_MS;

  void (async () => {
    while (!stopped) {
      try {
        const base = cfg.apiUrl.replace(/\/+$/, "").endsWith("/api")
          ? cfg.apiUrl.replace(/\/+$/, "")
          : `${cfg.apiUrl.replace(/\/+$/, "")}/api`;
        const url = `${base}/agent/vaults/${encodeURIComponent(cfg.vaultId)}/events`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || !res.body) {
          const err = new Error(`SSE ${res.status}`) as Error & { status: number };
          err.status = res.status;
          throw err;
        }
        delay = SSE_RECONNECT_DELAY_BASE_MS; // reset backoff após conexão bem-sucedida
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as VaultSseEvent;
              if (event.type === "change") {
                void onEvent();
              }
            } catch {
              /* linha malformada: ignorar */
            }
          }
        }
      } catch (e: unknown) {
        if (stopped) break;
        onDisconnect?.();
        const err = e as { status?: number };
        if (err?.status === 401 || err?.status === 403) {
          console.error(LOG, "ERRO DE AUTENTICACAO no SSE — token invalido ou revogado");
          process.exit(1);
        }
        if (process.env.OPENSYNC_VERBOSE === "1") {
          console.warn(`${C.yellow}${LOG}${C.reset} SSE desconectado, retry em ${delay}ms`);
        }
        await sleepMs(delay);
        delay = Math.min(delay * 2, SSE_RECONNECT_DELAY_MAX_MS);
      }
    }
  })();

  return () => {
    stopped = true;
  };
}

export async function runSync(cfg: SyncConfig, token: string): Promise<void> {
  const database = db.openDb(cfg);
  db.ensureDeviceId(database);
  const syncRoot = cfg.syncDir;

  // Arquivos que estamos escrevendo via download remoto — o watcher ignora esses.
  const remoteWriting = new Set<string>();
  /** Ficheiro com alteração local ainda não enviada ao servidor — o poll remoto não sobrescreve até concluir o upload. */
  const pendingLocalUpload = new Set<string>();

  async function flushPendingMergePushes(): Promise<void> {
    const rels = db.listPendingMergePaths(database);
    if (rels.length === 0) return;
    for (const rel of rels) {
      if (pendingLocalUpload.has(rel) || remoteWriting.has(rel)) continue;
      const abs = path.join(cfg.syncDir, rel);
      let remote: { content: string; version: string };
      try {
        remote = await api.getFileContent(cfg, token, rel);
      } catch {
        continue;
      }
      const local = await readLocalFile(abs, cfg.maxFileSizeBytes);
      if (local === null) {
        db.removePendingMergePush(database, rel);
        continue;
      }
      const merged = mergeTextPreserveBoth(local, remote.content);
      const mr = await upsertMergedBodyWithRetry(
        cfg,
        token,
        rel,
        merged,
        remote.version,
        cfg.maxFileSizeBytes,
      );
      if (mr.ok) {
        db.removePendingMergePush(database, rel);
        remoteWriting.add(rel);
        try {
          await fs.mkdir(path.dirname(abs), { recursive: true });
          await fs.writeFile(abs, mr.body, "utf8");
          db.upsertFileState(database, rel, mr.version, db.hashContent(mr.body));
        } finally {
          setTimeout(() => remoteWriting.delete(rel), DEBOUNCE_MS + 1000);
        }
        console.log(
          `${C.cyan}${LOG}${C.reset} ${C.green}✅ pending merge push concluído${C.reset} ${C.dim}${rel} · v${mr.version}${C.reset}`,
        );
      }
    }
  }

  const queue = new Set<string>();
  let processing = false;

  async function processQueue(): Promise<void> {
    if (processing) return;
    processing = true;
    try {
      while (queue.size > 0) {
        const paths = [...queue];
        queue.clear();
        for (const rel of paths) {
          let outcome: "uploaded" | "noop" | "failed" = "failed";
          try {
            outcome = await syncLocalPath(database, cfg, token, rel, remoteWriting);
          } finally {
            if (outcome === "uploaded") {
              setTimeout(() => pendingLocalUpload.delete(rel), POST_UPLOAD_POLL_GUARD_MS);
            } else {
              pendingLocalUpload.delete(rel);
            }
          }
        }
      }
    } finally {
      processing = false;
    }
  }

  const debouncers = new Map<string, ReturnType<typeof setTimeout>>();

  function schedule(rel: string): void {
    if (shouldIgnore(cfg, rel)) return;
    if (remoteWriting.has(rel)) return; // escrita remota em andamento — ignorar
    pendingLocalUpload.add(rel);
    const prev = debouncers.get(rel);
    if (prev) clearTimeout(prev);
    debouncers.set(
      rel,
      setTimeout(() => {
        debouncers.delete(rel);
        queue.add(rel);
        void processQueue();
      }, DEBOUNCE_MS),
    );
  }

  let lastHeartbeatAt = 0;

  /**
   * Garante ficheiros locais alinhados com o estado actual no servidor (vault_files + backfill Gitea).
   * Complementa o feed /changes: cobre casos em que o cursor ainda nao recebeu upserts ou o Postgres
   * foi hidratado via Gitea sem o utilizador ter aberto o vault na web.
   */
  async function pullMissingFromRemoteManifest(): Promise<void> {
    let manifest: { commitHash: string; entries: api.ManifestEntry[] };
    try {
      manifest = await api.fetchVaultManifest(cfg, token);
    } catch (e: unknown) {
      const err = e as { status?: number };
      if (err?.status === 401 || err?.status === 403) {
        console.error(LOG, "ERRO DE AUTENTICACAO — token invalido ou revogado. Corrija com: opensync init");
        process.exit(1);
      }
      console.error(`${C.yellow}${LOG}${C.reset} ⚠️ manifest pull`, e);
      return;
    }
    let pulled = 0;
    for (const ent of manifest.entries) {
      if (pendingLocalUpload.has(ent.path)) continue;
      const st = db.fileState(database, ent.path);
      if (st && st.remote_version === ent.version && !st.is_deleted) continue;
      remoteWriting.add(ent.path);
      try {
        const remote = await api.getFileContent(cfg, token, ent.path);
        const abs = path.join(cfg.syncDir, ent.path);
        const localExisting = await readLocalFile(abs, cfg.maxFileSizeBytes);
        let body = remote.content;
        let versionOut = remote.version;
        let hashOut = db.hashContent(remote.content);
        if (localExisting !== null) {
          const lh = db.hashContent(localExisting);
          const rh = db.hashContent(remote.content);
          if (lh !== rh) {
            body = mergeTextPreserveBoth(localExisting, remote.content);
            hashOut = db.hashContent(body);
            const mr = await upsertMergedBodyWithRetry(
              cfg,
              token,
              ent.path,
              body,
              remote.version,
              cfg.maxFileSizeBytes,
            );
            if (mr.ok) {
              body = mr.body;
              versionOut = mr.version;
              hashOut = db.hashContent(mr.body);
              db.removePendingMergePush(database, ent.path);
              console.warn(LOG, "manifest:", ent.path, "local≠remoto — merge preservado", `v${versionOut}`);
            } else {
              db.addPendingMergePush(database, ent.path);
              console.error(
                `${C.yellow}${LOG}${C.reset} ⚠️ manifest merge upsert esgotado (fila pending): ${ent.path}`,
              );
            }
          }
        }
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, body, "utf8");
        db.upsertFileState(database, ent.path, versionOut, hashOut);
        pulled++;
        console.log(LOG, "manifest aplicado:", ent.path, `v${versionOut}`);
      } catch (e: unknown) {
        console.error(LOG, "manifest entrada falhou:", ent.path, e);
      } finally {
        setTimeout(() => remoteWriting.delete(ent.path), DEBOUNCE_MS + 1000);
      }
    }
    const manTail = BigInt((manifest.commitHash || "0").trim() || "0");
    const cur = BigInt((db.getRemoteCursor(database) || "0").trim() || "0");
    const next = cur > manTail ? cur : manTail;
    db.setMeta(database, "remote_cursor", String(next));
    if (pulled > 0 && process.env.OPENSYNC_VERBOSE === "1") {
      console.log(`${C.cyan}${LOG}${C.reset} manifest: ${pulled} ficheiro(s) actualizado(s)${C.reset}`);
    }
  }

  async function pollRemote(): Promise<void> {
    await flushPendingMergePushes();
    let cursor = db.getRemoteCursor(database);
    let totalApplied = 0;
    try {
      for (;;) {
        const { changes, next_cursor } = await api.fetchChanges(cfg, token, cursor);
        for (const ch of changes) {
          await applyRemoteChange(database, cfg, token, ch, remoteWriting, pendingLocalUpload);
          totalApplied++;
        }
        if (changes.length === 0) break;
        cursor = next_cursor;
        db.setMeta(database, "remote_cursor", cursor);
        if (changes.length < 500) break;
      }
      await reconcileDeletedLocalFiles(database, cfg, remoteWriting);
      const now = Date.now();
      if (now - lastHeartbeatAt >= HEARTBEAT_MS || process.env.OPENSYNC_VERBOSE === "1") {
        const tail = db.getRemoteCursor(database);
        console.log(
          `${C.cyan}${LOG}${C.reset} ${C.green}💓 poll remoto OK${C.reset} ${C.dim}· cursor=${tail} · aplicadas neste ciclo=${totalApplied}${C.reset}`,
        );
        lastHeartbeatAt = now;
      }
    } catch (e: unknown) {
      const err = e as { status?: number };
      if (err?.status === 401 || err?.status === 403) {
        console.error(LOG, "ERRO DE AUTENTICACAO — token invalido ou revogado. Corrija com: opensync init");
        process.exit(1);
      }
      console.error(`${C.yellow}${LOG}${C.reset} ⚠️ poll error`, e);
    }
  }

  await fs.mkdir(syncRoot, { recursive: true });

  // 1. Baixar mudanças remotas primeiro
  await pollRemote();

  // 1b. Alinhar com manifesto servidor (backfill Gitea→Postgres + ficheiros activos)
  await pullMissingFromRemoteManifest();

  // 2. FULL_RECONCILE: enviar arquivos locais existentes ainda não sincronizados
  await fullReconcile(database, cfg, token, remoteWriting);

  const watcher = chokidar.watch(syncRoot, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  });

  watcher.on("all", (_evt, absPath) => {
    const rel = path.relative(syncRoot, absPath).split(path.sep).join("/");
    if (!rel || rel.startsWith("..")) return;
    schedule(rel);
  });

  // SSE + fallback poll híbrido
  let sseConnected = false;
  let fallbackPollTimeout: ReturnType<typeof setTimeout> | undefined;
  let loopStopped = false;

  /** Poll de segurança: quando SSE está ativo usa 60s, senão o intervalo configurado */
  function scheduleFallbackPoll(): void {
    const intervalMs = sseConnected ? SSE_FALLBACK_POLL_MS : cfg.pollIntervalSeconds * 1000;
    fallbackPollTimeout = setTimeout(() => {
      void (async () => {
        await pollRemote();
        if (!loopStopped) scheduleFallbackPoll();
      })();
    }, intervalMs);
  }

  const stopSse = connectSse(
    cfg,
    token,
    async () => {
      sseConnected = true;
      // Cancelar o próximo fallback poll pendente e fazer poll imediato
      if (fallbackPollTimeout) clearTimeout(fallbackPollTimeout);
      await pollRemote();
      if (!loopStopped) scheduleFallbackPoll();
    },
    () => {
      sseConnected = false; // fallback poll volta ao intervalo configurado enquanto reconecta
    },
  );

  scheduleFallbackPoll();

  console.log(
    `${C.cyan}${LOG}${C.reset} ${C.green}🚀 a correr${C.reset} ${C.dim}syncDir=${syncRoot} · SSE em tempo real + poll fallback a cada ${cfg.pollIntervalSeconds}s${C.reset}`,
  );
  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  loopStopped = true;
  stopSse();
  if (fallbackPollTimeout) clearTimeout(fallbackPollTimeout);
  await watcher.close();
  database.close();
}

async function applyRemoteChange(
  database: Database.Database,
  cfg: SyncConfig,
  token: string,
  ch: api.ChangeRow,
  remoteWriting: Set<string>,
  pendingLocalUpload: Set<string>,
): Promise<void> {
  if (pendingLocalUpload.has(ch.path)) return;
  const abs = path.join(cfg.syncDir, ch.path);
  const st = db.fileState(database, ch.path);

  if (ch.deleted) {
    const stRankDel = versionRank(st?.remote_version);
    const chRankDel = versionRank(ch.version);
    if (stRankDel > chRankDel) {
      console.log(LOG, "ignorar delete atrasado no feed:", ch.path, `v${ch.version}`);
      return;
    }
    // Se já está marcado como deletado com a mesma versão, nada a fazer.
    if (st?.is_deleted && st.remote_version === ch.version) return;
    remoteWriting.add(ch.path);
    try {
      await fs.rm(abs, { force: true });
    } catch {
      /* ok */
    } finally {
      // Mantém bloqueio por um ciclo para o watcher ignorar "unlink" gerado pelo pull remoto.
      setTimeout(() => remoteWriting.delete(ch.path), DEBOUNCE_MS + 1000);
    }
    db.markRemoteDeleted(database, ch.path, ch.version);
    return;
  }

  const stRank = versionRank(st?.remote_version);
  const chRank = versionRank(ch.version);
  if (stRank > chRank) {
    console.log(
      LOG,
      "ignorar mudanca remota antiga:",
      ch.path,
      `feed v${ch.version} < estado v${st?.remote_version ?? "?"}`,
    );
    return;
  }

  // Já temos esta versão aplicada — ignorar (evita reprocessar nossos próprios uploads).
  if (st && st.remote_version === ch.version && !st.is_deleted) return;

  const content = ch.content ?? "";
  const h = db.hashContent(content);

  let bodyToWrite = content;
  let versionToStore = ch.version;
  let hashToStore = h;

  try {
    const local = await readLocalFile(abs, cfg.maxFileSizeBytes);
    if (local !== null) {
      const localH = db.hashContent(local);
      const last = st?.last_synced_hash ?? null;
      const hasUnsyncedLocalEdit =
        (last !== null && localH !== last && localH !== h) ||
        (last === null && localH !== h);
      if (hasUnsyncedLocalEdit) {
        bodyToWrite = mergeTextPreserveBoth(local, content);
        hashToStore = db.hashContent(bodyToWrite);
        const mr = await upsertMergedBodyWithRetry(
          cfg,
          token,
          ch.path,
          bodyToWrite,
          ch.version,
          cfg.maxFileSizeBytes,
        );
        if (mr.ok) {
          bodyToWrite = mr.body;
          versionToStore = mr.version;
          hashToStore = db.hashContent(mr.body);
          db.removePendingMergePush(database, ch.path);
          console.warn(LOG, "conflito remoto+local:", ch.path, "merge enviado", `v${versionToStore}`);
        } else {
          db.addPendingMergePush(database, ch.path);
          console.error(
            `${C.yellow}${LOG}${C.reset} ⚠️ merge upsert esgotado (fila pending, gravado em disco): ${ch.path}`,
          );
        }
      }
    }
  } catch {
    /* ignore */
  }

  remoteWriting.add(ch.path);
  try {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, bodyToWrite, "utf8");
    db.upsertFileState(database, ch.path, versionToStore, hashToStore);
  } finally {
    setTimeout(() => remoteWriting.delete(ch.path), DEBOUNCE_MS + 1000);
  }

  console.log(LOG, "remoto aplicado:", ch.path, `v${versionToStore}`);
}

async function syncLocalPath(
  database: Database.Database,
  cfg: SyncConfig,
  token: string,
  rel: string,
  remoteWriting: Set<string>,
): Promise<"uploaded" | "noop" | "failed"> {
  const abs = path.join(cfg.syncDir, rel);
  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return "failed";
  } catch {
    await handleLocalDelete(database, cfg, token, rel);
    return "failed";
  }

  const text = await readLocalFile(abs, cfg.maxFileSizeBytes);
  if (text === null) return "failed";

  const h = db.hashContent(text);
  const row = db.fileState(database, rel);
  if (row?.last_synced_hash === h) return "noop";

  try {
    const baseVer = row?.remote_version ?? null;
    const res = await api.upsertFile(cfg, token, rel, text, baseVer && baseVer !== "" ? baseVer : null);
    db.upsertFileState(database, rel, res.version, h);
    console.log(LOG, "local enviado:", rel, `v${res.version}`);
    return "uploaded";
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err?.status === 401 || err?.status === 403) {
      console.error(LOG, "ERRO DE AUTENTICACAO — token invalido ou revogado. Corrija com: opensync init");
      process.exit(1);
    }
    if (err?.status === 409) {
      try {
        const remote = await api.getFileContent(cfg, token, rel);
        const merged = mergeTextPreserveBoth(text, remote.content);
        const mr = await upsertMergedBodyWithRetry(
          cfg,
          token,
          rel,
          merged,
          remote.version,
          cfg.maxFileSizeBytes,
        );
        const mergedH = db.hashContent(mr.body);
        const verOut = mr.ok ? mr.version : mr.baseVersion;
        if (mr.ok) {
          db.removePendingMergePush(database, rel);
          console.warn(LOG, "409:", rel, "merge local+remoto enviado", `v${verOut}`);
        } else {
          db.addPendingMergePush(database, rel);
          console.error(
            `${C.yellow}${LOG}${C.reset} ⚠️ 409 merge upsert esgotado (fila pending, merge em disco): ${rel}`,
          );
        }
        remoteWriting.add(rel);
        try {
          await fs.mkdir(path.dirname(abs), { recursive: true });
          await fs.writeFile(abs, mr.body, "utf8");
          db.upsertFileState(database, rel, verOut, mergedH);
        } finally {
          setTimeout(() => remoteWriting.delete(rel), DEBOUNCE_MS + 1000);
        }
        return "uploaded";
      } catch (e2) {
        console.error(LOG, "falha ao resolver conflito", rel, e2);
      }
      return "failed";
    }
    console.error(LOG, "upsert", rel, e);
    return "failed";
  }
}

async function handleLocalDelete(
  database: Database.Database,
  cfg: SyncConfig,
  token: string,
  rel: string,
): Promise<void> {
  const row = db.fileState(database, rel);
  if (!row || row.is_deleted) return;
  const rv = row.remote_version?.trim();
  if (!rv) return;
  try {
    const { version } = await api.deleteFile(cfg, token, rel, rv);
    db.setDeletedWithRemoteVersion(database, rel, version);
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err?.status === 401 || err?.status === 403) {
      console.error(LOG, "ERRO DE AUTENTICACAO — token invalido ou revogado. Corrija com: opensync init");
      process.exit(1);
    }
    console.error(LOG, "delete", rel, e);
  }
}
