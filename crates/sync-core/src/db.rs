use crate::config::SyncConfig;
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};

pub type Db = Arc<Mutex<Connection>>;

pub fn open(cfg: &SyncConfig) -> Result<Db> {
    let path = crate::config::sqlite_path(&cfg.vault_id);
    let conn =
        Connection::open(&path).with_context(|| format!("falha ao abrir SQLite em {path:?}"))?;
    init_schema(&conn)?;
    Ok(Arc::new(Mutex::new(conn)))
}

fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS files_state (
            path            TEXT PRIMARY KEY,
            content_hash    TEXT,
            remote_version  TEXT,
            last_synced_hash TEXT,
            last_synced_at  TEXT,
            is_deleted      INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sync_meta (
            key   TEXT PRIMARY KEY,
            value TEXT
        );",
    )
    .context("criar tabelas base")?;

    let version: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap_or(0);
    if version < 1 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS change_journal (
                seq         INTEGER PRIMARY KEY AUTOINCREMENT,
                path        TEXT NOT NULL,
                event_type  TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                processed   INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_cj_proc_seq
                ON change_journal(processed, seq);
            CREATE INDEX IF NOT EXISTS idx_cj_path_proc
                ON change_journal(path, processed);
            PRAGMA user_version = 1;",
        )
        .context("migração v1: change_journal")?;
    }

    Ok(())
}

// ── sync_meta ────────────────────────────────────────────────────────────────

pub fn get_meta(db: &Db, key: &str) -> Option<String> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT value FROM sync_meta WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .ok()
}

pub fn set_meta(db: &Db, key: &str, value: &str) {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT INTO sync_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .ok();
}

pub fn ensure_device_id(db: &Db) -> String {
    if let Some(id) = get_meta(db, "device_id") {
        return id;
    }
    let id = uuid::Uuid::new_v4().to_string();
    set_meta(db, "device_id", &id);
    id
}

pub fn get_remote_cursor(db: &Db) -> String {
    get_meta(db, "remote_cursor").unwrap_or_else(|| "0".to_string())
}

// ── files_state ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct FileState {
    pub remote_version: Option<String>,
    pub last_synced_hash: Option<String>,
    pub is_deleted: bool,
}

pub fn file_state(db: &Db, path: &str) -> Option<FileState> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT remote_version, last_synced_hash, is_deleted
         FROM files_state WHERE path = ?1",
        params![path],
        |r| {
            Ok(FileState {
                remote_version: r.get(0)?,
                last_synced_hash: r.get(1)?,
                is_deleted: r.get::<_, i64>(2)? != 0,
            })
        },
    )
    .ok()
}

pub fn upsert_file_state(db: &Db, path: &str, remote_version: &str, last_synced_hash: &str) {
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT INTO files_state
             (path, content_hash, remote_version, last_synced_hash, last_synced_at, is_deleted)
         VALUES (?1, ?2, ?3, ?4, ?5, 0)
         ON CONFLICT(path) DO UPDATE SET
             content_hash     = excluded.content_hash,
             remote_version   = excluded.remote_version,
             last_synced_hash = excluded.last_synced_hash,
             last_synced_at   = excluded.last_synced_at,
             is_deleted       = 0",
        params![
            path,
            last_synced_hash,
            remote_version,
            last_synced_hash,
            now
        ],
    )
    .ok();
}

pub fn rename_file_state(
    db: &Db,
    from_path: &str,
    to_path: &str,
    remote_version: &str,
    last_synced_hash: &str,
) {
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.lock().unwrap();
    conn.execute("DELETE FROM files_state WHERE path = ?1", params![to_path])
        .ok();
    let changed = conn
        .execute(
            "UPDATE files_state SET path = ?1 WHERE path = ?2",
            params![to_path, from_path],
        )
        .unwrap_or(0);
    if changed == 0 {
        conn.execute(
            "INSERT INTO files_state
                 (path, content_hash, remote_version, last_synced_hash, last_synced_at, is_deleted)
             VALUES (?1, ?2, ?3, ?4, ?5, 0)",
            params![
                to_path,
                last_synced_hash,
                remote_version,
                last_synced_hash,
                now
            ],
        )
        .ok();
    } else {
        conn.execute(
            "UPDATE files_state
             SET remote_version = ?1, last_synced_hash = ?2, last_synced_at = ?3, is_deleted = 0
             WHERE path = ?4",
            params![remote_version, last_synced_hash, now, to_path],
        )
        .ok();
    }
}

pub fn mark_remote_deleted(db: &Db, path: &str, remote_version: &str) {
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.lock().unwrap();
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM files_state WHERE path = ?1",
            params![path],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if exists {
        conn.execute(
            "UPDATE files_state SET is_deleted = 1, remote_version = ?1,
             last_synced_hash = '', last_synced_at = ?2 WHERE path = ?3",
            params![remote_version, now, path],
        )
        .ok();
    } else {
        conn.execute(
            "INSERT INTO files_state
                 (path, remote_version, last_synced_hash, last_synced_at, is_deleted, content_hash)
             VALUES (?1, ?2, '', ?3, 1, '')",
            params![path, remote_version, now],
        )
        .ok();
    }
}

pub fn set_deleted_with_remote_version(db: &Db, path: &str, remote_version: &str) {
    mark_remote_deleted(db, path, remote_version);
}

pub fn list_deleted_paths(db: &Db) -> Vec<String> {
    let conn = db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT path FROM files_state WHERE is_deleted = 1")
        .unwrap();
    stmt.query_map([], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

// ── change_journal ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct JournalRow {
    pub seq: i64,
    pub path: String,
    pub event_type: String,
}

pub fn append_change_journal(db: &Db, path: &str, event_type: &str) {
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT INTO change_journal (path, event_type, created_at, processed)
         VALUES (?1, ?2, ?3, 0)",
        params![path, event_type, now],
    )
    .ok();
}

pub fn list_unprocessed_journal(db: &Db, limit: i64) -> Vec<JournalRow> {
    let conn = db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT seq, path, event_type FROM change_journal
             WHERE processed = 0 ORDER BY seq ASC LIMIT ?1",
        )
        .unwrap();
    stmt.query_map(params![limit], |r| {
        Ok(JournalRow {
            seq: r.get(0)?,
            path: r.get(1)?,
            event_type: r.get(2)?,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

pub fn mark_journal_processed_for_path(db: &Db, path: &str) {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE change_journal SET processed = 1 WHERE path = ?1 AND processed = 0",
        params![path],
    )
    .ok();
}

// ── pending merge pushes ──────────────────────────────────────────────────────

const PENDING_MERGE_KEY: &str = "opensync_pending_merge_paths";

pub fn list_pending_merge_paths(db: &Db) -> Vec<String> {
    let raw = get_meta(db, PENDING_MERGE_KEY).unwrap_or_default();
    if raw.is_empty() {
        return vec![];
    }
    serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default()
}

pub fn add_pending_merge_push(db: &Db, path: &str) {
    let mut paths = list_pending_merge_paths(db);
    if paths.iter().any(|p| p == path) {
        return;
    }
    paths.push(path.to_string());
    set_meta(
        db,
        PENDING_MERGE_KEY,
        &serde_json::to_string(&paths).unwrap(),
    );
}

pub fn remove_pending_merge_push(db: &Db, path: &str) {
    let paths: Vec<String> = list_pending_merge_paths(db)
        .into_iter()
        .filter(|p| p != path)
        .collect();
    if paths.is_empty() {
        let conn = db.lock().unwrap();
        conn.execute(
            "DELETE FROM sync_meta WHERE key = ?1",
            params![PENDING_MERGE_KEY],
        )
        .ok();
    } else {
        set_meta(
            db,
            PENDING_MERGE_KEY,
            &serde_json::to_string(&paths).unwrap(),
        );
    }
}

pub use crate::hash::hash_content;

#[cfg(test)]
pub fn open_in_memory() -> Db {
    let conn = Connection::open_in_memory().expect("in-memory sqlite");
    init_schema(&conn).expect("init schema");
    Arc::new(Mutex::new(conn))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Db {
        open_in_memory()
    }

    // ── sync_meta ─────────────────────────────────────────────────────────────

    #[test]
    fn meta_get_set() {
        let db = db();
        assert!(get_meta(&db, "chave").is_none());
        set_meta(&db, "chave", "valor");
        assert_eq!(get_meta(&db, "chave").unwrap(), "valor");
    }

    #[test]
    fn meta_overwrite() {
        let db = db();
        set_meta(&db, "k", "v1");
        set_meta(&db, "k", "v2");
        assert_eq!(get_meta(&db, "k").unwrap(), "v2");
    }

    #[test]
    fn device_id_generated_once() {
        let db = db();
        let id1 = ensure_device_id(&db);
        let id2 = ensure_device_id(&db);
        assert_eq!(id1, id2);
        assert!(!id1.is_empty());
    }

    #[test]
    fn remote_cursor_default_is_zero() {
        let db = db();
        assert_eq!(get_remote_cursor(&db), "0");
    }

    // ── files_state ───────────────────────────────────────────────────────────

    #[test]
    fn file_state_absent_returns_none() {
        let db = db();
        assert!(file_state(&db, "inexistente.md").is_none());
    }

    #[test]
    fn upsert_and_read_file_state() {
        let db = db();
        upsert_file_state(&db, "notes/test.md", "v1", "abc123");
        let st = file_state(&db, "notes/test.md").unwrap();
        assert_eq!(st.remote_version.unwrap(), "v1");
        assert_eq!(st.last_synced_hash.unwrap(), "abc123");
        assert!(!st.is_deleted);
    }

    #[test]
    fn upsert_twice_updates_record() {
        let db = db();
        upsert_file_state(&db, "f.md", "v1", "h1");
        upsert_file_state(&db, "f.md", "v2", "h2");
        let st = file_state(&db, "f.md").unwrap();
        assert_eq!(st.remote_version.unwrap(), "v2");
        assert_eq!(st.last_synced_hash.unwrap(), "h2");
    }

    #[test]
    fn mark_remote_deleted_sets_flag() {
        let db = db();
        upsert_file_state(&db, "del.md", "v1", "h1");
        mark_remote_deleted(&db, "del.md", "v2");
        let st = file_state(&db, "del.md").unwrap();
        assert!(st.is_deleted);
        assert_eq!(st.remote_version.unwrap(), "v2");
    }

    #[test]
    fn upsert_clears_deleted_flag() {
        let db = db();
        mark_remote_deleted(&db, "f.md", "v1");
        upsert_file_state(&db, "f.md", "v2", "h2");
        let st = file_state(&db, "f.md").unwrap();
        assert!(!st.is_deleted);
    }

    #[test]
    fn list_deleted_paths_returns_only_deleted() {
        let db = db();
        upsert_file_state(&db, "a.md", "v1", "h1");
        mark_remote_deleted(&db, "b.md", "v1");
        let deleted = list_deleted_paths(&db);
        assert!(deleted.contains(&"b.md".to_string()));
        assert!(!deleted.contains(&"a.md".to_string()));
    }

    #[test]
    fn rename_file_state_moves_row() {
        let db = db();
        upsert_file_state(&db, "old.md", "v1", "h1");
        rename_file_state(&db, "old.md", "new.md", "v2", "h2");
        assert!(file_state(&db, "old.md").is_none());
        let st = file_state(&db, "new.md").unwrap();
        assert_eq!(st.remote_version.unwrap(), "v2");
    }

    // ── change_journal ────────────────────────────────────────────────────────

    #[test]
    fn journal_append_and_list() {
        let db = db();
        append_change_journal(&db, "notes/a.md", "change");
        append_change_journal(&db, "notes/b.md", "add");
        let rows = list_unprocessed_journal(&db, 100);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].path, "notes/a.md");
        assert_eq!(rows[1].path, "notes/b.md");
    }

    #[test]
    fn journal_mark_processed() {
        let db = db();
        append_change_journal(&db, "f.md", "change");
        assert_eq!(list_unprocessed_journal(&db, 100).len(), 1);
        mark_journal_processed_for_path(&db, "f.md");
        assert_eq!(list_unprocessed_journal(&db, 100).len(), 0);
    }

    #[test]
    fn journal_respects_limit() {
        let db = db();
        for i in 0..10 {
            append_change_journal(&db, &format!("f{i}.md"), "change");
        }
        assert_eq!(list_unprocessed_journal(&db, 3).len(), 3);
    }

    // ── pending merge paths ───────────────────────────────────────────────────

    #[test]
    fn pending_merge_empty_initially() {
        let db = db();
        assert!(list_pending_merge_paths(&db).is_empty());
    }

    #[test]
    fn add_and_remove_pending_merge() {
        let db = db();
        add_pending_merge_push(&db, "notes/conflict.md");
        assert!(list_pending_merge_paths(&db).contains(&"notes/conflict.md".to_string()));
        remove_pending_merge_push(&db, "notes/conflict.md");
        assert!(list_pending_merge_paths(&db).is_empty());
    }

    #[test]
    fn add_pending_merge_no_duplicates() {
        let db = db();
        add_pending_merge_push(&db, "f.md");
        add_pending_merge_push(&db, "f.md");
        assert_eq!(list_pending_merge_paths(&db).len(), 1);
    }
}
