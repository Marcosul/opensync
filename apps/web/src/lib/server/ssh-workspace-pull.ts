import { constants as fsConstants } from "fs";

import { Client } from "ssh2";
import type { FileEntry, SFTPWrapper } from "ssh2";

import { normalizeSshPrivateKeyPem } from "./ssh-private-key-pem";

/** Lista longa POSIX do SFTP: primeiro char d/l/- indica tipo; fallback em `mode`. */
function sftpEntryKind(ent: FileEntry): "dir" | "file" | "link" {
  const c = ent.longname.trim().charAt(0).toLowerCase();
  if (c === "d") return "dir";
  if (c === "l") return "link";
  if (c === "-") return "file";
  const mode = ent.attrs.mode;
  if (typeof mode === "number") {
    const t = mode & fsConstants.S_IFMT;
    if (t === fsConstants.S_IFDIR) return "dir";
    if (t === fsConstants.S_IFLNK) return "link";
  }
  return "file";
}

/** ~/.openclaw pode ser profundo (agents, sessions, workspace, sandboxes, ...). */
const MAX_DEPTH = 28;
const MAX_FILES = 5000;
const MAX_FILE_BYTES = 1024 * 1024;
const SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".cache",
  "dist",
  "build",
  ".next",
  /** Sandboxes e dados de browser costumam ser grandes e raramente são notas. */
  "sandboxes",
  "browser-profile",
  "playwright-profile",
]);

export type SshPullAuth = {
  host: string;
  port: number;
  username: string;
  privateKey?: string;
  password?: string;
  remotePathRaw: string;
};

/** Progresso da ligacao/importacao (UI stream ou consola). */
export type SshPullProgress = (message: string) => void;

export type SshPullOptions = {
  /** Logs detalhados do handshake ssh2 (verboso). */
  verboseWire?: boolean;
};

function execStdout(client: Client, cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let out = "";
      let errBuf = "";
      stream.on("data", (d: Buffer) => {
        out += d.toString("utf8");
      });
      stream.stderr.on("data", (d: Buffer) => {
        errBuf += d.toString("utf8");
      });
      stream.on("close", (code: number) => {
        if (code !== 0) {
          reject(new Error(errBuf.trim() || `Comando remoto falhou (codigo ${code})`));
          return;
        }
        resolve(out.trim());
      });
    });
  });
}

function resolvePathWithHome(home: string, raw: string): string {
  const t = raw.trim();
  if (!t) return home;
  if (t === "~" || t === "~/") return home;
  if (t.startsWith("~/")) return `${home}/${t.slice(2)}`.replace(/\/+/g, "/");
  return t;
}

function connectClient(
  auth: SshPullAuth,
  log?: SshPullProgress,
  verboseWire?: boolean,
): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    log?.(`📡 A ligar ${auth.username}@${auth.host}:${auth.port} (timeout 28s)...`);
    client.once("ready", () => {
      log?.("✅ SSH autenticado, sessao pronta");
      resolve(client);
    });
    client.once("error", (err) => {
      log?.(`❌ Erro SSH: ${err instanceof Error ? err.message : String(err)}`);
      reject(err);
    });
    const pem =
      auth.privateKey?.trim() != null && auth.privateKey.trim() !== ""
        ? normalizeSshPrivateKeyPem(auth.privateKey.trim())
        : undefined;
    client.connect({
      host: auth.host,
      port: auth.port,
      username: auth.username,
      privateKey: pem ? Buffer.from(pem, "utf8") : undefined,
      password: auth.password?.length ? auth.password : undefined,
      readyTimeout: 28_000,
      debug: verboseWire && log ? (msg) => log(`🛰 ${msg}`) : undefined,
    });
  });
}

function openSftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err || !sftp) reject(err ?? new Error("SFTP indisponivel"));
      else resolve(sftp);
    });
  });
}

function sftpReaddir(sftp: SFTPWrapper, path: string): Promise<FileEntry[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(path, (err, list) => {
      if (err) reject(err);
      else resolve(list ?? []);
    });
  });
}

function sftpReadFile(sftp: SFTPWrapper, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    sftp.readFile(path, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
}

function isProbablyBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/** Várias leituras SFTP em paralelo (mesmo canal); reduz latência com muitos ficheiros pequenos. */
const SFTP_READ_CONCURRENCY = 14;

async function runPool(limit: number, tasks: Array<() => Promise<void>>): Promise<void> {
  if (tasks.length === 0) return;
  const n = Math.min(limit, tasks.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      await tasks[i]!();
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
}

async function walkRemoteDir(
  sftp: SFTPWrapper,
  absDir: string,
  relPrefix: string,
  depth: number,
  out: Record<string, string>,
  log?: SshPullProgress,
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  if (Object.keys(out).length >= MAX_FILES) {
    throw new Error(
      `Limite de ${MAX_FILES} arquivos atingido. Reduza a pasta ou ignore diretorios grandes.`,
    );
  }

  let entries: FileEntry[];
  try {
    entries = await sftpReaddir(sftp, absDir);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Nao foi possivel listar "${absDir}": ${msg}`);
  }

  type Subdir = { absPath: string; relPath: string };
  const subdirs: Subdir[] = [];
  const fileReads: Array<() => Promise<void>> = [];

  for (const ent of entries) {
    if (ent.filename === "." || ent.filename === "..") continue;
    if (SKIP_DIR_NAMES.has(ent.filename)) continue;

    const absPath = `${absDir.replace(/\/$/, "")}/${ent.filename}`;
    const relPath = relPrefix ? `${relPrefix}/${ent.filename}` : ent.filename;

    const kind = sftpEntryKind(ent);
    if (kind === "link") continue;
    if (kind === "dir") {
      subdirs.push({ absPath, relPath });
      continue;
    }
    if (kind !== "file") continue;

    const size = ent.attrs.size;
    if (typeof size === "number" && size > MAX_FILE_BYTES) continue;

    fileReads.push(async () => {
      if (Object.keys(out).length >= MAX_FILES) return;
      let buf: Buffer;
      try {
        buf = await sftpReadFile(sftp, absPath);
      } catch {
        return;
      }
      if (buf.length > MAX_FILE_BYTES) return;
      if (isProbablyBinary(buf)) return;
      out[relPath] = buf.toString("utf8");
    });
  }

  await runPool(SFTP_READ_CONCURRENCY, fileReads);

  const afterFiles = Object.keys(out).length;
  if (log && fileReads.length > 0 && (afterFiles === 1 || afterFiles % 400 === 0)) {
    log(`📄 ${afterFiles} ficheiros de texto importados (a varrer SFTP)...`);
  }

  for (const d of subdirs) {
    await walkRemoteDir(sftp, d.absPath, d.relPath, depth + 1, out, log);
  }
}

/**
 * Lista e le ficheiros de texto sob um diretorio remoto via SSH/SFTP.
 */
export async function pullTextFilesFromSshServer(
  auth: SshPullAuth,
  log?: SshPullProgress,
  options?: SshPullOptions,
): Promise<{ files: Record<string, string>; resolvedPath: string }> {
  const verboseWire = options?.verboseWire === true;
  const client = await connectClient(auth, log, verboseWire);
  try {
    log?.('🏠 A resolver $HOME no servidor...');
    const home = await execStdout(client, 'printf %s "$HOME"');
    if (!home) {
      throw new Error("Nao foi possivel resolver o HOME no servidor.");
    }
    const resolvedPath = resolvePathWithHome(home, auth.remotePathRaw);
    log?.(`📂 Caminho remoto resolvido: ${resolvedPath}`);
    log?.("🗂 A abrir canal SFTP...");
    const sftp = await openSftp(client);
    try {
      const files: Record<string, string> = {};
      log?.("🔍 A listar e ler ficheiros (pode demorar em pastas grandes)...");
      await walkRemoteDir(sftp, resolvedPath, "", 0, files, log);
      const total = Object.keys(files).length;
      log?.(`✅ Importacao SFTP concluida: ${total} ficheiros de texto.`);
      return { files, resolvedPath };
    } finally {
      sftp.end();
    }
  } finally {
    client.end();
  }
}

/** Valida SSH + SFTP e se o diretorio remoto existe (onboarding sem importar ficheiros). */
export async function verifySshRemotePath(auth: SshPullAuth): Promise<void> {
  const client = await connectClient(auth);
  try {
    const home = await execStdout(client, 'printf %s "$HOME"');
    if (!home) {
      throw new Error("Nao foi possivel resolver o HOME no servidor.");
    }
    const resolvedPath = resolvePathWithHome(home, auth.remotePathRaw);
    const sftp = await openSftp(client);
    try {
      await sftpReaddir(sftp, resolvedPath);
    } finally {
      sftp.end();
    }
  } finally {
    client.end();
  }
}
