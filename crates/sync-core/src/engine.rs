use crate::{
    api::{self, ChangeRow},
    config::SyncConfig,
    db::{self, Db},
    hash::hash_content,
    ignore::should_ignore,
    merge::merge_text_preserve_both,
    suppressed::SuppressedWrites,
};
use anyhow::Result;
use reqwest::Client;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::Notify;
use tracing::{error, info, warn};

const DEBOUNCE: Duration = Duration::from_millis(3000);
const REMOTE_WRITE_GUARD: Duration = Duration::from_millis(4000);
const SSE_FALLBACK_POLL: Duration = Duration::from_secs(60);
const SSE_RECONNECT_BASE: Duration = Duration::from_secs(1);
const SSE_RECONNECT_MAX: Duration = Duration::from_secs(30);
const MERGE_MAX_ATTEMPTS: usize = 4;
const MERGE_DELAYS: [Duration; 3] = [
    Duration::from_millis(250),
    Duration::from_millis(600),
    Duration::from_millis(1200),
];

// ── Estado de escrita remota com expiração automática ────────────────────────

#[derive(Default)]
struct RemoteWriting {
    entries: HashMap<String, Instant>,
}

impl RemoteWriting {
    fn add(&mut self, path: &str) {
        self.entries.insert(path.to_string(), Instant::now());
    }

    fn contains(&mut self, path: &str) -> bool {
        self.prune();
        self.entries.contains_key(path)
    }

    fn prune(&mut self) {
        let now = Instant::now();
        self.entries
            .retain(|_, added| now.duration_since(*added) < REMOTE_WRITE_GUARD);
    }
}

// ── Engine ────────────────────────────────────────────────────────────────────

pub struct SyncEngine {
    cfg: SyncConfig,
    token: String,
    db: Db,
    client: Client,
    device_id: String,
    remote_writing: Arc<Mutex<RemoteWriting>>,
    suppressed: Arc<Mutex<SuppressedWrites>>,
}

impl SyncEngine {
    pub fn new(cfg: SyncConfig, token: String) -> Result<Self> {
        let db = db::open(&cfg)?;
        let device_id = db::ensure_device_id(&db);
        let client = Client::builder().timeout(Duration::from_secs(30)).build()?;
        Ok(Self {
            cfg,
            token,
            db,
            client,
            device_id,
            remote_writing: Arc::new(Mutex::new(RemoteWriting::default())),
            suppressed: Arc::new(Mutex::new(SuppressedWrites::new(8000))),
        })
    }

    pub async fn run(self) -> Result<()> {
        let engine = Arc::new(self);
        let sync_root = PathBuf::from(&engine.cfg.sync_dir);
        tokio::fs::create_dir_all(&sync_root).await?;

        // ── Sync inicial ──────────────────────────────────────────────────────
        engine.poll_remote().await;
        engine.pull_missing_from_manifest().await;

        // Processar journal offline
        for row in db::list_unprocessed_journal(&engine.db, 5000) {
            if !should_ignore(&engine.cfg.ignore, &row.path) {
                engine.sync_local_path(&row.path).await;
            }
        }

        engine.full_reconcile().await;

        // ── File watcher ──────────────────────────────────────────────────────
        let (watch_tx, mut watch_rx) = tokio::sync::mpsc::channel::<String>(512);
        let root_for_watcher = sync_root.clone();
        let watch_tx_clone = watch_tx.clone();

        let mut watcher = {
            notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
                if let Ok(event) = res {
                    for path in event.paths {
                        if let Ok(rel) = path.strip_prefix(&root_for_watcher) {
                            let rel_str = rel.to_string_lossy().replace('\\', "/");
                            let _ = watch_tx_clone.blocking_send(rel_str.to_string());
                        }
                    }
                }
            })?
        };
        {
            use notify::Watcher;
            watcher.watch(&sync_root, notify::RecursiveMode::Recursive)?;
        }

        // ── SSE task ──────────────────────────────────────────────────────────
        let poll_notify = Arc::new(Notify::new());
        let sse_connected = Arc::new(std::sync::atomic::AtomicBool::new(false));
        {
            let eng = engine.clone();
            let notify = poll_notify.clone();
            let connected = sse_connected.clone();
            tokio::spawn(async move { eng.sse_loop(notify, connected).await });
        }

        // ── Loop principal ────────────────────────────────────────────────────
        let mut pending: HashMap<String, Instant> = HashMap::new();
        let mut pending_upload: HashSet<String> = HashSet::new();
        let mut debounce_tick = tokio::time::interval(Duration::from_millis(500));
        debounce_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        let mut fallback_tick =
            tokio::time::interval(Duration::from_secs(engine.cfg.poll_interval_seconds));
        fallback_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        let mut last_heartbeat = Instant::now();

        info!(
            "[opensync] 🚀 a correr syncDir={} · SSE + poll fallback a cada {}s",
            engine.cfg.sync_dir, engine.cfg.poll_interval_seconds
        );

        loop {
            tokio::select! {
                // Eventos do watcher
                Some(rel) = watch_rx.recv() => {
                    if should_ignore(&engine.cfg.ignore, &rel) { continue; }
                    db::append_change_journal(&engine.db, &rel, "change");
                    pending_upload.insert(rel.clone());
                    pending.insert(rel, Instant::now());
                }

                // SSE notificou mudança remota → poll imediato
                _ = poll_notify.notified() => {
                    engine.poll_remote().await;
                    // resetar fallback depois do poll via SSE
                    fallback_tick.reset();
                }

                // Fallback poll (quando SSE está off ou silencioso)
                _ = fallback_tick.tick() => {
                    if !sse_connected.load(std::sync::atomic::Ordering::Relaxed) {
                        engine.poll_remote().await;
                    } else if last_heartbeat.elapsed() >= SSE_FALLBACK_POLL {
                        engine.poll_remote().await;
                        last_heartbeat = Instant::now();
                    }
                }

                // Verificar debounce
                _ = debounce_tick.tick() => {
                    let now = Instant::now();
                    let ready: Vec<String> = pending
                        .iter()
                        .filter(|(rel, t)| {
                            now.duration_since(**t) >= DEBOUNCE
                            && !engine.remote_writing.lock().unwrap().contains(rel)
                        })
                        .map(|(p, _)| p.clone())
                        .collect();

                    for rel in ready {
                        pending.remove(&rel);
                        pending_upload.remove(&rel);
                        engine.sync_local_path(&rel).await;
                    }

                    // Paths bloqueados por remote_writing: postergar 400ms
                    let blocked: Vec<String> = pending
                        .iter()
                        .filter(|(rel, t)| {
                            now.duration_since(**t) >= DEBOUNCE
                            && engine.remote_writing.lock().unwrap().contains(rel)
                        })
                        .map(|(p, _)| p.clone())
                        .collect();
                    for rel in blocked {
                        pending.insert(
                            rel,
                            now.checked_sub(DEBOUNCE).unwrap_or(now)
                                + Duration::from_millis(400),
                        );
                    }
                }

                // Sinal de shutdown
                _ = shutdown_signal() => {
                    info!("[opensync] encerrando...");
                    break;
                }
            }
        }

        Ok(())
    }

    // ── Poll remoto ───────────────────────────────────────────────────────────

    async fn poll_remote(&self) {
        self.flush_pending_merges().await;

        let mut cursor = db::get_remote_cursor(&self.db);
        let mut total = 0usize;

        loop {
            match api::fetch_changes(&self.client, &self.cfg, &self.token, &cursor).await {
                Err(e) if api::is_auth_error(&e) => {
                    error!("[opensync] ERRO DE AUTENTICAÇÃO — token inválido. Use: opensync init");
                    std::process::exit(1);
                }
                Err(e) => {
                    warn!("[opensync] ⚠️ poll error: {e}");
                    return;
                }
                Ok(resp) => {
                    let count = resp.changes.len();
                    for ch in resp.changes {
                        self.apply_remote_change(ch).await;
                        total += 1;
                    }
                    if count == 0 {
                        break;
                    }
                    cursor = resp.next_cursor;
                    db::set_meta(&self.db, "remote_cursor", &cursor);
                    if count < 500 {
                        break;
                    }
                }
            }
        }

        self.reconcile_deleted_local_files().await;
        info!("[opensync] 💓 poll remoto OK · cursor={cursor} · aplicadas={total}");
    }

    // ── Aplicar mudança remota ─────────────────────────────────────────────────

    async fn apply_remote_change(&self, ch: ChangeRow) {
        // Rename
        if let Some(from_rel) = &ch.rename_from {
            let from_abs = Path::new(&self.cfg.sync_dir).join(from_rel);
            let to_abs = Path::new(&self.cfg.sync_dir).join(&ch.path);
            let st = db::file_state(&self.db, from_rel);
            if let Some(ref s) = st {
                if version_rank(s.remote_version.as_deref()) > version_rank(Some(&ch.version)) {
                    return; // mudança atrasada
                }
                if s.remote_version.as_deref() == Some(&ch.version) && !s.is_deleted {
                    return;
                }
            }
            self.remote_writing.lock().unwrap().add(from_rel);
            self.remote_writing.lock().unwrap().add(&ch.path);
            tokio::fs::create_dir_all(to_abs.parent().unwrap_or(&to_abs))
                .await
                .ok();
            tokio::fs::rename(&from_abs, &to_abs).await.ok();
            let hash = read_local_file(&to_abs, self.cfg.max_file_size_bytes)
                .await
                .map(|c| hash_content(&c))
                .unwrap_or_default();
            db::rename_file_state(&self.db, from_rel, &ch.path, &ch.version, &hash);
            db::mark_journal_processed_for_path(&self.db, from_rel);
            db::mark_journal_processed_for_path(&self.db, &ch.path);
            info!(
                "[opensync] remoto rename {from_rel} → {} v{}",
                ch.path, ch.version
            );
            return;
        }

        let abs = Path::new(&self.cfg.sync_dir).join(&ch.path);
        let st = db::file_state(&self.db, &ch.path);

        // Delete
        if ch.deleted.unwrap_or(false) {
            if let Some(ref s) = st {
                if version_rank(s.remote_version.as_deref()) > version_rank(Some(&ch.version)) {
                    return;
                }
                if s.is_deleted && s.remote_version.as_deref() == Some(&ch.version) {
                    return;
                }
            }
            self.remote_writing.lock().unwrap().add(&ch.path);
            tokio::fs::remove_file(&abs).await.ok();
            db::mark_remote_deleted(&self.db, &ch.path, &ch.version);
            return;
        }

        // Verificar versão
        if let Some(ref s) = st {
            if version_rank(s.remote_version.as_deref()) > version_rank(Some(&ch.version)) {
                return;
            }
            if s.remote_version.as_deref() == Some(&ch.version) && !s.is_deleted {
                return;
            }
        }

        let content = ch.content.as_deref().unwrap_or("");
        let h = hash_content(content);

        self.remote_writing.lock().unwrap().add(&ch.path);

        let mut body = content.to_string();
        let mut version_out = ch.version.clone();
        let mut hash_out = h.clone();

        if let Ok(local) = read_local_file(&abs, self.cfg.max_file_size_bytes).await {
            let local_h = hash_content(&local);
            let last = st.as_ref().and_then(|s| s.last_synced_hash.clone());
            let unsynced = match &last {
                Some(l) => local_h != *l && local_h != h,
                None => local_h != h,
            };
            if unsynced {
                let merged = merge_text_preserve_both(&local, content);
                match self
                    .upsert_merged_with_retry(&ch.path, &merged, &ch.version)
                    .await
                {
                    Ok(r) => {
                        hash_out = hash_content(&r.body);
                        version_out = r.version;
                        body = r.body;
                        db::remove_pending_merge_push(&self.db, &ch.path);
                        warn!(
                            "[opensync] conflito remoto+local: {} merge enviado v{}",
                            ch.path, version_out
                        );
                    }
                    Err(f) => {
                        let conflict_rel = conflict_path(&ch.path, &self.device_id);
                        let conflict_abs = Path::new(&self.cfg.sync_dir).join(&conflict_rel);
                        self.suppressed
                            .lock()
                            .unwrap()
                            .register(&conflict_rel, &local);
                        self.suppressed.lock().unwrap().register(&ch.path, content);
                        write_file(&conflict_abs, &local).await;
                        body = content.to_string();
                        version_out = ch.version.clone();
                        hash_out = h.clone();
                        db::remove_pending_merge_push(&self.db, &ch.path);
                        warn!("[opensync] 📋 merge esgotado — cópia local: {conflict_rel} · remoto em {}", ch.path);
                        let _ = f;
                    }
                }
            }
        }

        self.suppressed.lock().unwrap().register(&ch.path, &body);
        write_file(&abs, &body).await;
        db::upsert_file_state(&self.db, &ch.path, &version_out, &hash_out);
        info!("[opensync] remoto aplicado: {} v{version_out}", ch.path);
    }

    // ── Sync de arquivo local ─────────────────────────────────────────────────

    pub async fn sync_local_path(&self, rel: &str) {
        let abs = Path::new(&self.cfg.sync_dir).join(rel);

        let meta = tokio::fs::metadata(&abs).await;
        if meta.is_err() || !meta.unwrap().is_file() {
            self.handle_local_delete(rel).await;
            return;
        }

        let text = match read_local_file(&abs, self.cfg.max_file_size_bytes).await {
            Ok(t) => t,
            Err(_) => return,
        };

        let h = hash_content(&text);

        if self.suppressed.lock().unwrap().consume_if_match(rel, &text) {
            db::mark_journal_processed_for_path(&self.db, rel);
            return;
        }

        let row = db::file_state(&self.db, rel);
        if row.as_ref().and_then(|r| r.last_synced_hash.as_deref()) == Some(&h) {
            db::mark_journal_processed_for_path(&self.db, rel);
            return;
        }

        let base_ver = row
            .as_ref()
            .and_then(|r| r.remote_version.as_deref())
            .filter(|v| !v.is_empty())
            .map(|v| v.to_string());

        match api::upsert_file(
            &self.client,
            &self.cfg,
            &self.token,
            rel,
            &text,
            base_ver.as_deref(),
        )
        .await
        {
            Ok(res) => {
                db::upsert_file_state(&self.db, rel, &res.version, &h);
                db::mark_journal_processed_for_path(&self.db, rel);
                info!("[opensync] local enviado: {rel} v{}", res.version);
            }
            Err(e) if api::is_auth_error(&e) => {
                error!("[opensync] ERRO DE AUTENTICAÇÃO — token inválido");
                std::process::exit(1);
            }
            Err(e) if api::is_conflict(&e) => {
                if let Ok(remote) =
                    api::get_file_content(&self.client, &self.cfg, &self.token, rel).await
                {
                    let merged = merge_text_preserve_both(&text, &remote.content);
                    match self
                        .upsert_merged_with_retry(rel, &merged, &remote.version)
                        .await
                    {
                        Ok(r) => {
                            let merged_h = hash_content(&r.body);
                            db::remove_pending_merge_push(&self.db, rel);
                            self.remote_writing.lock().unwrap().add(rel);
                            self.suppressed.lock().unwrap().register(rel, &r.body);
                            write_file(&abs, &r.body).await;
                            db::upsert_file_state(&self.db, rel, &r.version, &merged_h);
                            warn!("[opensync] 409 {rel}: merge enviado v{}", r.version);
                        }
                        Err(_) => {
                            let conflict_rel = conflict_path(rel, &self.device_id);
                            let conflict_abs = Path::new(&self.cfg.sync_dir).join(&conflict_rel);
                            self.suppressed
                                .lock()
                                .unwrap()
                                .register(&conflict_rel, &text);
                            self.suppressed
                                .lock()
                                .unwrap()
                                .register(rel, &remote.content);
                            write_file(&conflict_abs, &text).await;
                            self.remote_writing.lock().unwrap().add(rel);
                            self.suppressed
                                .lock()
                                .unwrap()
                                .register(rel, &remote.content);
                            write_file(&abs, &remote.content).await;
                            db::upsert_file_state(
                                &self.db,
                                rel,
                                &remote.version,
                                &hash_content(&remote.content),
                            );
                            db::remove_pending_merge_push(&self.db, rel);
                            warn!("[opensync] 📋 409 merge esgotado — cópia local: {conflict_rel}");
                        }
                    }
                    db::mark_journal_processed_for_path(&self.db, rel);
                }
            }
            Err(e) => {
                warn!("[opensync] upsert {rel}: {e}");
            }
        }
    }

    async fn handle_local_delete(&self, rel: &str) {
        let row = db::file_state(&self.db, rel);
        let Some(st) = row else { return };
        if st.is_deleted {
            return;
        }
        let rv = st.remote_version.as_deref().unwrap_or("").trim();
        if rv.is_empty() {
            return;
        }
        match api::delete_file(&self.client, &self.cfg, &self.token, rel, rv).await {
            Ok(r) => db::set_deleted_with_remote_version(&self.db, rel, &r.version),
            Err(e) if api::is_auth_error(&e) => {
                error!("[opensync] ERRO DE AUTENTICAÇÃO");
                std::process::exit(1);
            }
            Err(e) => warn!("[opensync] delete {rel}: {e}"),
        }
    }

    // ── Full reconcile ────────────────────────────────────────────────────────

    async fn full_reconcile(&self) {
        info!(
            "[opensync] full reconcile iniciado em {}",
            self.cfg.sync_dir
        );
        let root = PathBuf::from(&self.cfg.sync_dir);
        let (uploaded, skipped) = self.walk_reconcile(&root, &root).await;
        info!("[opensync] full reconcile concluído: {uploaded} enviados, {skipped} ignorados");
    }

    async fn walk_reconcile(&self, root: &Path, dir: &Path) -> (usize, usize) {
        let mut uploaded = 0;
        let mut skipped = 0;
        let mut rd = match tokio::fs::read_dir(dir).await {
            Ok(r) => r,
            Err(_) => return (0, 0),
        };
        while let Ok(Some(entry)) = rd.next_entry().await {
            let path = entry.path();
            let rel = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            if rel.is_empty() || should_ignore(&self.cfg.ignore, &rel) {
                continue;
            }
            if path.is_dir() {
                let (u, s) = Box::pin(self.walk_reconcile(root, &path)).await;
                uploaded += u;
                skipped += s;
            } else {
                match read_local_file(&path, self.cfg.max_file_size_bytes).await {
                    Err(_) => {
                        skipped += 1;
                    }
                    Ok(text) => {
                        let h = hash_content(&text);
                        let row = db::file_state(&self.db, &rel);
                        if row.as_ref().and_then(|r| r.last_synced_hash.as_deref()) == Some(&h) {
                            continue;
                        }
                        self.sync_local_path(&rel).await;
                        uploaded += 1;
                    }
                }
            }
        }
        (uploaded, skipped)
    }

    // ── Pull manifest ─────────────────────────────────────────────────────────

    async fn pull_missing_from_manifest(&self) {
        let manifest = match api::fetch_vault_manifest(&self.client, &self.cfg, &self.token).await {
            Err(e) if api::is_auth_error(&e) => {
                error!("[opensync] ERRO DE AUTENTICAÇÃO");
                std::process::exit(1);
            }
            Err(e) => {
                warn!("[opensync] ⚠️ manifest pull: {e}");
                return;
            }
            Ok(m) => m,
        };

        let mut pulled = 0usize;
        for ent in &manifest.entries {
            let st = db::file_state(&self.db, &ent.path);
            if let Some(ref s) = st {
                if s.remote_version.as_deref() == Some(&ent.version) && !s.is_deleted {
                    continue;
                }
            }

            self.remote_writing.lock().unwrap().add(&ent.path);
            let abs = Path::new(&self.cfg.sync_dir).join(&ent.path);

            let remote = match api::get_file_content(
                &self.client,
                &self.cfg,
                &self.token,
                &ent.path,
            )
            .await
            {
                Ok(r) => r,
                Err(e) => {
                    warn!("[opensync] manifest entrada falhou {}: {e}", ent.path);
                    continue;
                }
            };

            let mut body = remote.content.clone();
            let mut version_out = remote.version.clone();
            let mut hash_out = hash_content(&remote.content);

            if let Ok(local) = read_local_file(&abs, self.cfg.max_file_size_bytes).await {
                let lh = hash_content(&local);
                let rh = hash_content(&remote.content);
                if lh != rh {
                    let merged = merge_text_preserve_both(&local, &remote.content);
                    match self
                        .upsert_merged_with_retry(&ent.path, &merged, &remote.version)
                        .await
                    {
                        Ok(r) => {
                            body = r.body.clone();
                            version_out = r.version.clone();
                            hash_out = hash_content(&r.body);
                            db::remove_pending_merge_push(&self.db, &ent.path);
                            warn!("[opensync] manifest {}: local≠remoto — merge enviado v{version_out}", ent.path);
                        }
                        Err(_) => {
                            let conflict_rel = conflict_path(&ent.path, &self.device_id);
                            let conflict_abs = Path::new(&self.cfg.sync_dir).join(&conflict_rel);
                            self.suppressed
                                .lock()
                                .unwrap()
                                .register(&conflict_rel, &local);
                            self.suppressed
                                .lock()
                                .unwrap()
                                .register(&ent.path, &remote.content);
                            write_file(&conflict_abs, &local).await;
                            db::remove_pending_merge_push(&self.db, &ent.path);
                            warn!("[opensync] 📋 manifest merge esgotado — cópia: {conflict_rel}");
                        }
                    }
                }
            }

            self.suppressed.lock().unwrap().register(&ent.path, &body);
            write_file(&abs, &body).await;
            db::upsert_file_state(&self.db, &ent.path, &version_out, &hash_out);
            pulled += 1;
        }

        // Avançar cursor para o commit do manifesto
        let man_tail: u64 = manifest.commit_hash.trim().parse().unwrap_or(0);
        let cur: u64 = db::get_remote_cursor(&self.db).trim().parse().unwrap_or(0);
        db::set_meta(&self.db, "remote_cursor", &man_tail.max(cur).to_string());

        if pulled > 0 {
            info!("[opensync] manifest: {pulled} arquivo(s) atualizado(s)");
        }
    }

    // ── Flush merges pendentes ────────────────────────────────────────────────

    async fn flush_pending_merges(&self) {
        let rels = db::list_pending_merge_paths(&self.db);
        for rel in rels {
            let abs = Path::new(&self.cfg.sync_dir).join(&rel);
            let remote =
                match api::get_file_content(&self.client, &self.cfg, &self.token, &rel).await {
                    Ok(r) => r,
                    Err(_) => continue,
                };
            let local = match read_local_file(&abs, self.cfg.max_file_size_bytes).await {
                Ok(l) => l,
                Err(_) => {
                    db::remove_pending_merge_push(&self.db, &rel);
                    continue;
                }
            };
            let merged = merge_text_preserve_both(&local, &remote.content);
            match self
                .upsert_merged_with_retry(&rel, &merged, &remote.version)
                .await
            {
                Ok(r) => {
                    db::remove_pending_merge_push(&self.db, &rel);
                    self.remote_writing.lock().unwrap().add(&rel);
                    self.suppressed.lock().unwrap().register(&rel, &r.body);
                    write_file(&abs, &r.body).await;
                    db::upsert_file_state(&self.db, &rel, &r.version, &hash_content(&r.body));
                    info!(
                        "[opensync] ✅ pending merge concluído: {rel} v{}",
                        r.version
                    );
                }
                Err(_) => {
                    let conflict_rel = conflict_path(&rel, &self.device_id);
                    let conflict_abs = Path::new(&self.cfg.sync_dir).join(&conflict_rel);
                    self.remote_writing.lock().unwrap().add(&rel);
                    self.suppressed
                        .lock()
                        .unwrap()
                        .register(&conflict_rel, &local);
                    self.suppressed
                        .lock()
                        .unwrap()
                        .register(&rel, &remote.content);
                    write_file(&conflict_abs, &local).await;
                    write_file(&abs, &remote.content).await;
                    db::upsert_file_state(
                        &self.db,
                        &rel,
                        &remote.version,
                        &hash_content(&remote.content),
                    );
                    db::remove_pending_merge_push(&self.db, &rel);
                    warn!("[opensync] 📋 pending merge — cópia: {conflict_rel}");
                }
            }
        }
    }

    // ── Reconciliar arquivos deletados remotamente ─────────────────────────────

    async fn reconcile_deleted_local_files(&self) {
        for rel in db::list_deleted_paths(&self.db) {
            let abs = Path::new(&self.cfg.sync_dir).join(&rel);
            self.remote_writing.lock().unwrap().add(&rel);
            tokio::fs::remove_file(&abs).await.ok();
        }
    }

    // ── Upsert com retry de merge ─────────────────────────────────────────────

    async fn upsert_merged_with_retry(
        &self,
        path: &str,
        initial_body: &str,
        initial_base_version: &str,
    ) -> Result<MergeUpsertOk, MergeUpsertFail> {
        let abs = Path::new(&self.cfg.sync_dir).join(path);
        let mut body = initial_body.to_string();
        let mut base_version = initial_base_version.to_string();

        for attempt in 0..MERGE_MAX_ATTEMPTS {
            match api::upsert_file(
                &self.client,
                &self.cfg,
                &self.token,
                path,
                &body,
                Some(&base_version),
            )
            .await
            {
                Ok(r) => {
                    return Ok(MergeUpsertOk {
                        version: r.version,
                        body,
                    });
                }
                Err(e) if api::is_auth_error(&e) => {
                    error!("[opensync] ERRO DE AUTENTICAÇÃO");
                    std::process::exit(1);
                }
                Err(e) if api::is_conflict(&e) => {
                    if let Ok(remote) =
                        api::get_file_content(&self.client, &self.cfg, &self.token, path).await
                    {
                        let local = read_local_file(&abs, self.cfg.max_file_size_bytes)
                            .await
                            .unwrap_or_else(|_| body.clone());
                        body = merge_text_preserve_both(&local, &remote.content);
                        base_version = remote.version;
                    }
                }
                Err(e) if !api::is_transient(&e) => {
                    return Err(MergeUpsertFail);
                }
                Err(_) => {}
            }
            if attempt < MERGE_MAX_ATTEMPTS - 1 {
                tokio::time::sleep(MERGE_DELAYS[attempt.min(MERGE_DELAYS.len() - 1)]).await;
            }
        }
        Err(MergeUpsertFail)
    }

    // ── SSE loop (task separada) ──────────────────────────────────────────────

    async fn sse_loop(
        &self,
        poll_notify: Arc<Notify>,
        connected: Arc<std::sync::atomic::AtomicBool>,
    ) {
        use futures_util::StreamExt;

        let url = api::sse_url(&self.cfg);
        let mut backoff = SSE_RECONNECT_BASE;

        loop {
            connected.store(false, std::sync::atomic::Ordering::Relaxed);

            let res = self
                .client
                .get(&url)
                .bearer_auth(&self.token)
                .timeout(Duration::from_secs(120))
                .send()
                .await;

            match res {
                Err(e) => {
                    warn!("[opensync] SSE erro de conexão: {e}");
                }
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    if status == 401 || status == 403 {
                        error!("[opensync] ERRO DE AUTENTICAÇÃO no SSE");
                        std::process::exit(1);
                    }
                    if !resp.status().is_success() {
                        warn!("[opensync] SSE HTTP {status}");
                    } else {
                        connected.store(true, std::sync::atomic::Ordering::Relaxed);
                        backoff = SSE_RECONNECT_BASE; // reset em conexão bem-sucedida

                        let mut stream = resp.bytes_stream();
                        let mut buf = String::new();

                        while let Some(chunk) = stream.next().await {
                            match chunk {
                                Err(e) => {
                                    warn!("[opensync] SSE stream error: {e}");
                                    break;
                                }
                                Ok(bytes) => {
                                    buf.push_str(&String::from_utf8_lossy(&bytes));
                                    let lines: Vec<&str> = buf.split('\n').collect();
                                    let tail = lines.last().copied().unwrap_or("").to_string();
                                    for line in &lines[..lines.len().saturating_sub(1)] {
                                        if let Some(data) = line.strip_prefix("data: ") {
                                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(
                                                data.trim(),
                                            ) {
                                                if v.get("type").and_then(|t| t.as_str())
                                                    == Some("change")
                                                {
                                                    poll_notify.notify_one();
                                                }
                                            }
                                        }
                                    }
                                    buf = tail;
                                }
                            }
                        }
                    }
                }
            }

            connected.store(false, std::sync::atomic::Ordering::Relaxed);
            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(SSE_RECONNECT_MAX);
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

struct MergeUpsertOk {
    version: String,
    body: String,
}

struct MergeUpsertFail;

fn version_rank(v: Option<&str>) -> u64 {
    v.and_then(|s| s.trim().parse().ok()).unwrap_or(0)
}

fn conflict_path(path: &str, device_id: &str) -> String {
    let norm = path.replace('\\', "/");
    let safe_dev: String = device_id
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .take(32)
        .collect();
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let (dir, base) = match norm.rfind('/') {
        Some(i) => (&norm[..i], &norm[i + 1..]),
        None => ("", norm.as_str()),
    };
    let (name, ext) = match base.rfind('.') {
        Some(i) => (&base[..i], &base[i..]),
        None => (base, ""),
    };
    let filename = format!("{name}.conflict-{safe_dev}-{stamp}{ext}");
    if dir.is_empty() {
        filename
    } else {
        format!("{dir}/{filename}")
    }
}

async fn read_local_file(abs: &Path, max_bytes: u64) -> Result<String> {
    let meta = tokio::fs::metadata(abs).await?;
    if !meta.is_file() || meta.len() > max_bytes {
        return Err(anyhow::anyhow!("arquivo ignorado: {abs:?}"));
    }
    let bytes = tokio::fs::read(abs).await?;
    if bytes.contains(&0u8) {
        return Err(anyhow::anyhow!("arquivo binário ignorado"));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

async fn write_file(abs: &Path, content: &str) {
    if let Some(parent) = abs.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    tokio::fs::write(abs, content).await.ok();
}

async fn shutdown_signal() {
    use tokio::signal;
    let ctrl_c = async { signal::ctrl_c().await.ok() };
    #[cfg(unix)]
    {
        let mut sigterm = signal::unix::signal(signal::unix::SignalKind::terminate()).unwrap();
        tokio::select! {
            _ = ctrl_c => {}
            _ = sigterm.recv() => {}
        }
    }
    #[cfg(not(unix))]
    ctrl_c.await;
}
