import Database from "better-sqlite3";
import type { SyncConfig } from "./config";
import { sqlitePath } from "./config";
import { hashContent } from "@opensync/sync";

export { hashContent };

export function openDb(cfg: SyncConfig): Database.Database {
  const db = new Database(sqlitePath(cfg.vaultId));
  db.exec(`
    CREATE TABLE IF NOT EXISTS files_state (
      path TEXT PRIMARY KEY,
      content_hash TEXT,
      remote_version TEXT,
      last_synced_hash TEXT,
      last_synced_at TEXT,
      is_deleted INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  migrateJournal(db);
  return db;
}

/** Journal persistente (sync-engine v2): sobrevive a crash antes do debounce. */
function migrateJournal(db: Database.Database): void {
  const v = Number(db.pragma("user_version", { simple: true }) ?? 0);
  if (v >= 1) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_journal (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_change_journal_processed_seq ON change_journal(processed, seq);
    CREATE INDEX IF NOT EXISTS idx_change_journal_path_processed ON change_journal(path, processed);
  `);
  db.pragma("user_version = 1");
}

export function appendChangeJournal(db: Database.Database, filePath: string, eventType: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO change_journal (path, event_type, created_at, processed) VALUES (?, ?, ?, 0)",
  ).run(filePath, eventType, now);
}

export function listUnprocessedJournal(
  db: Database.Database,
  limit: number,
): Array<{ seq: number; path: string; event_type: string }> {
  return db
    .prepare(
      "SELECT seq, path, event_type FROM change_journal WHERE processed = 0 ORDER BY seq ASC LIMIT ?",
    )
    .all(limit) as Array<{ seq: number; path: string; event_type: string }>;
}

/** Após upload local bem-sucedido, marcar eventos pendentes desse path como processados. */
export function markJournalProcessedForPath(db: Database.Database, filePath: string): void {
  db.prepare("UPDATE change_journal SET processed = 1 WHERE path = ? AND processed = 0").run(filePath);
}

export function getMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM sync_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}

export function ensureDeviceId(db: Database.Database): string {
  let id = getMeta(db, "device_id");
  if (!id) {
    id = crypto.randomUUID();
    setMeta(db, "device_id", id);
  }
  return id;
}

export function getRemoteCursor(db: Database.Database): string {
  return getMeta(db, "remote_cursor") ?? "0";
}

export function fileState(
  db: Database.Database,
  path: string,
): { remote_version: string | null; last_synced_hash: string | null; is_deleted: number } | undefined {
  return db
    .prepare(
      "SELECT remote_version, last_synced_hash, is_deleted FROM files_state WHERE path = ?",
    )
    .get(path) as
    | { remote_version: string | null; last_synced_hash: string | null; is_deleted: number }
    | undefined;
}

/** Após rename remoto: move a linha `files_state` de `fromPath` para `toPath`. */
export function renameFileStatePath(
  db: Database.Database,
  fromPath: string,
  toPath: string,
  remoteVersion: string,
  lastSyncedHash: string,
): void {
  const now = new Date().toISOString();
  db.prepare("DELETE FROM files_state WHERE path = ?").run(toPath);
  const info = db.prepare("UPDATE files_state SET path = ? WHERE path = ?").run(toPath, fromPath);
  if (info.changes === 0) {
    upsertFileState(db, toPath, remoteVersion, lastSyncedHash);
    return;
  }
  db.prepare(
    `UPDATE files_state SET remote_version = ?, last_synced_hash = ?, last_synced_at = ?, is_deleted = 0 WHERE path = ?`,
  ).run(remoteVersion, lastSyncedHash, now, toPath);
}

export function upsertFileState(
  db: Database.Database,
  path: string,
  remoteVersion: string,
  lastSyncedHash: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO files_state (path, content_hash, remote_version, last_synced_hash, last_synced_at, is_deleted)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(path) DO UPDATE SET
       remote_version = excluded.remote_version,
       last_synced_hash = excluded.last_synced_hash,
       last_synced_at = excluded.last_synced_at,
       is_deleted = 0,
       content_hash = excluded.content_hash`,
  ).run(path, lastSyncedHash, remoteVersion, lastSyncedHash, now);
}

/** Após o servidor anunciar delete no feed de mudanças (guarda remote_version = versão pós-delete). */
export function markRemoteDeleted(
  db: Database.Database,
  filePath: string,
  remoteVersion: string,
): void {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT 1 FROM files_state WHERE path = ?").get(filePath);
  if (existing) {
    db.prepare(
      `UPDATE files_state SET is_deleted = 1, remote_version = ?, last_synced_hash = '', last_synced_at = ? WHERE path = ?`,
    ).run(remoteVersion, now, filePath);
  } else {
    db.prepare(
      `INSERT INTO files_state (path, remote_version, last_synced_hash, last_synced_at, is_deleted, content_hash)
       VALUES (?, ?, '', ?, 1, '')`,
    ).run(filePath, remoteVersion, now);
  }
}

export function setDeletedWithRemoteVersion(
  db: Database.Database,
  filePath: string,
  remoteVersion: string,
): void {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT 1 FROM files_state WHERE path = ?").get(filePath);
  if (existing) {
    db.prepare(
      `UPDATE files_state SET remote_version = ?, is_deleted = 1, last_synced_hash = '', last_synced_at = ? WHERE path = ?`,
    ).run(remoteVersion, now, filePath);
  } else {
    db.prepare(
      `INSERT INTO files_state (path, remote_version, last_synced_hash, last_synced_at, is_deleted, content_hash)
       VALUES (?, ?, '', ?, 1, '')`,
    ).run(filePath, remoteVersion, now);
  }
}

export function listDeletedPaths(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT path FROM files_state WHERE is_deleted = 1")
    .all() as Array<{ path: string }>;
  return rows.map((row) => row.path);
}

const PENDING_MERGE_PATHS_KEY = "opensync_pending_merge_paths";

/** Caminhos com merge gravado em disco mas upsert ao servidor ainda por concluir (retry no próximo poll). */
export function listPendingMergePaths(db: Database.Database): string[] {
  const raw = getMeta(db, PENDING_MERGE_PATHS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? (parsed as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function addPendingMergePush(db: Database.Database, filePath: string): void {
  const paths = listPendingMergePaths(db);
  if (paths.includes(filePath)) return;
  paths.push(filePath);
  setMeta(db, PENDING_MERGE_PATHS_KEY, JSON.stringify(paths));
}

export function removePendingMergePush(db: Database.Database, filePath: string): void {
  const paths = listPendingMergePaths(db).filter((p) => p !== filePath);
  if (paths.length === 0) {
    db.prepare("DELETE FROM sync_meta WHERE key = ?").run(PENDING_MERGE_PATHS_KEY);
  } else {
    setMeta(db, PENDING_MERGE_PATHS_KEY, JSON.stringify(paths));
  }
}

