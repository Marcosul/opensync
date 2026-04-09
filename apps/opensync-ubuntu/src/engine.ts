import chokidar from "chokidar";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AgentConfig } from "./config";
import * as api from "./api";
import * as db from "./db";
import type Database from "better-sqlite3";

const LOG = "[opensync-ubuntu]";
const DEBOUNCE_MS = 3000;

function shouldIgnore(cfg: AgentConfig, rel: string): boolean {
  const parts = rel.split("/");
  for (const p of parts) {
    if (cfg.ignore.includes(p)) return true;
    if (p.endsWith(".tmp") || p.endsWith(".swp")) return true;
  }
  return false;
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

/** Varre o diretório local e faz upload de arquivos ainda não sincronizados.
 *  Executado no início de cada run para garantir que arquivos pré-existentes
 *  sejam enviados ao vault (FULL_RECONCILE do PRD sec. 5.1). */
async function fullReconcile(
  database: Database.Database,
  cfg: AgentConfig,
  token: string,
): Promise<void> {
  console.log(LOG, "full reconcile iniciado em", cfg.syncDir);
  let uploaded = 0;
  let skipped = 0;

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
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
        await syncLocalPath(database, cfg, token, rel);
        uploaded++;
      }
    }
  }

  await walk(cfg.syncDir);
  console.log(LOG, `full reconcile concluido: ${uploaded} enviados, ${skipped} ignorados`);
}

export async function runAgent(cfg: AgentConfig, token: string): Promise<void> {
  const database = db.openDb(cfg);
  db.ensureDeviceId(database);
  const syncRoot = cfg.syncDir;

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
          await syncLocalPath(database, cfg, token, rel);
        }
      }
    } finally {
      processing = false;
    }
  }

  const debouncers = new Map<string, ReturnType<typeof setTimeout>>();

  function schedule(rel: string): void {
    if (shouldIgnore(cfg, rel)) return;
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

  async function pollRemote(): Promise<void> {
    let cursor = db.getRemoteCursor(database);
    try {
      for (;;) {
        const { changes, next_cursor } = await api.fetchChanges(cfg, token, cursor);
        for (const ch of changes) {
          await applyRemoteChange(database, cfg, token, ch);
        }
        if (changes.length === 0) break;
        cursor = next_cursor;
        db.setMeta(database, "remote_cursor", cursor);
        if (changes.length < 500) break;
      }
    } catch (e: unknown) {
      const err = e as { status?: number };
      if (err?.status === 401 || err?.status === 403) {
        console.error(LOG, "ERRO DE AUTENTICACAO — token invalido ou revogado. Corrija com: opensync-ubuntu init");
        process.exit(1);
      }
      console.error(LOG, "poll error", e);
    }
  }

  await fs.mkdir(syncRoot, { recursive: true });

  // 1. Baixar mudanças remotas primeiro
  await pollRemote();

  // 2. FULL_RECONCILE: enviar arquivos locais existentes ainda não sincronizados
  await fullReconcile(database, cfg, token);

  const watcher = chokidar.watch(syncRoot, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  });

  watcher.on("all", (_evt, absPath) => {
    const rel = path.relative(syncRoot, absPath).split(path.sep).join("/");
    if (!rel || rel.startsWith("..")) return;
    schedule(rel);
  });

  setInterval(() => {
    void pollRemote();
  }, cfg.pollIntervalSeconds * 1000);

  console.log(LOG, "running syncDir=", syncRoot);
  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await watcher.close();
  database.close();
}

async function applyRemoteChange(
  database: Database.Database,
  cfg: AgentConfig,
  token: string,
  ch: api.ChangeRow,
): Promise<void> {
  const abs = path.join(cfg.syncDir, ch.path);
  const st = db.fileState(database, ch.path);

  if (ch.deleted) {
    try {
      await fs.unlink(abs);
    } catch {
      /* ok */
    }
    db.markRemoteDeleted(database, ch.path, ch.version);
    return;
  }

  const content = ch.content ?? "";
  const h = db.hashContent(content);

  try {
    const local = await readLocalFile(abs, cfg.maxFileSizeBytes);
    if (local !== null) {
      const localH = db.hashContent(local);
      const last = st?.last_synced_hash ?? null;
      if (last !== null && localH !== last) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const conflictName = `${ch.path} (conflict remote ${stamp})`;
        const conflictAbs = path.join(cfg.syncDir, conflictName);
        await fs.mkdir(path.dirname(conflictAbs), { recursive: true });
        await fs.writeFile(conflictAbs, local, "utf8");
        console.warn(LOG, "conflito:", ch.path, "-> copia local em", conflictName);
      }
    }
  } catch {
    /* ignore */
  }

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  db.upsertFileState(database, ch.path, ch.version, h);
}

async function syncLocalPath(
  database: Database.Database,
  cfg: AgentConfig,
  token: string,
  rel: string,
): Promise<void> {
  const abs = path.join(cfg.syncDir, rel);
  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return;
  } catch {
    await handleLocalDelete(database, cfg, token, rel);
    return;
  }

  const text = await readLocalFile(abs, cfg.maxFileSizeBytes);
  if (text === null) return;

  const h = db.hashContent(text);
  const row = db.fileState(database, rel);
  if (row?.last_synced_hash === h) return;

  try {
    const baseVer = row?.remote_version ?? null;
    const res = await api.upsertFile(cfg, token, rel, text, baseVer && baseVer !== "" ? baseVer : null);
    db.upsertFileState(database, rel, res.version, h);
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err?.status === 401 || err?.status === 403) {
      console.error(LOG, "ERRO DE AUTENTICACAO — token invalido ou revogado. Corrija com: opensync-ubuntu init");
      process.exit(1);
    }
    if (err?.status === 409) {
      try {
        const remote = await api.getFileContent(cfg, token, rel);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const conflictName = `${rel} (conflict local ${stamp})`;
        const conflictAbs = path.join(cfg.syncDir, conflictName);
        await fs.mkdir(path.dirname(conflictAbs), { recursive: true });
        await fs.copyFile(abs, conflictAbs);
        await fs.writeFile(abs, remote.content, "utf8");
        db.upsertFileState(database, rel, remote.version, db.hashContent(remote.content));
        console.warn(LOG, "409:", rel, "remoto aplicado; copia local em", conflictName);
      } catch (e2) {
        console.error(LOG, "falha ao resolver conflito", rel, e2);
      }
      return;
    }
    console.error(LOG, "upsert", rel, e);
  }
}

async function handleLocalDelete(
  database: Database.Database,
  cfg: AgentConfig,
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
      console.error(LOG, "ERRO DE AUTENTICACAO — token invalido ou revogado. Corrija com: opensync-ubuntu init");
      process.exit(1);
    }
    console.error(LOG, "delete", rel, e);
  }
}
