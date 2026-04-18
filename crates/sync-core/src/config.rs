use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub api_url: String,
    pub vault_id: String,
    pub sync_dir: String,
    pub poll_interval_seconds: u64,
    pub ignore: Vec<String>,
    pub max_file_size_bytes: u64,
}

pub const DEFAULT_POLL_INTERVAL_SECONDS: u64 = 30;
pub const DEFAULT_MAX_FILE_SIZE_BYTES: u64 = 1_048_576;

pub fn default_ignore() -> Vec<String> {
    vec![
        ".git".into(),
        "node_modules".into(),
        ".cache".into(),
        ".DS_Store".into(),
    ]
}

pub fn config_dir() -> PathBuf {
    dirs::home_dir()
        .expect("home dir não encontrado")
        .join(".config")
        .join("opensync")
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn token_path() -> PathBuf {
    config_dir().join("vault.token")
}

pub fn sqlite_path(vault_id: &str) -> PathBuf {
    let sanitized: String = vault_id
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let dir = dirs::home_dir()
        .expect("home dir não encontrado")
        .join(".local")
        .join("share")
        .join("opensync");
    fs::create_dir_all(&dir).ok();
    dir.join(format!("{sanitized}.sqlite"))
}

pub fn resolve_user_path(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed == "~" {
        return dirs::home_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        return dirs::home_dir()
            .map(|p| p.join(rest).to_string_lossy().into_owned())
            .unwrap_or_else(|| trimmed.to_string());
    }
    trimmed.to_string()
}

pub fn api_base(cfg: &SyncConfig) -> String {
    let raw = cfg.api_url.trim_end_matches('/');
    if raw.ends_with("/api") {
        raw.to_string()
    } else {
        format!("{raw}/api")
    }
}

pub fn load_config() -> Result<SyncConfig> {
    let p = config_path();
    let raw = fs::read_to_string(&p)
        .with_context(|| format!("Config não encontrada. Execute: opensync init ({p:?})"))?;

    #[derive(Deserialize)]
    struct RawConfig {
        api_url: Option<String>,
        vault_id: Option<String>,
        sync_dir: Option<String>,
        poll_interval_seconds: Option<u64>,
        ignore: Option<Vec<String>>,
        max_file_size_bytes: Option<u64>,
    }

    let raw: RawConfig = serde_json::from_str(&raw).context("config.json inválido")?;

    let api_url = raw
        .api_url
        .filter(|s| !s.trim().is_empty())
        .context("config.json precisa de api_url")?;
    let vault_id = raw
        .vault_id
        .filter(|s| !s.trim().is_empty())
        .context("config.json precisa de vault_id")?;
    let sync_dir_raw = raw
        .sync_dir
        .filter(|s| !s.trim().is_empty())
        .context("config.json precisa de sync_dir")?;

    Ok(SyncConfig {
        api_url: api_url.trim_end_matches('/').to_string(),
        vault_id: vault_id.trim().to_string(),
        sync_dir: resolve_user_path(&sync_dir_raw),
        poll_interval_seconds: raw
            .poll_interval_seconds
            .map(|v| v.max(5))
            .unwrap_or(DEFAULT_POLL_INTERVAL_SECONDS),
        ignore: raw.ignore.unwrap_or_else(default_ignore),
        max_file_size_bytes: raw
            .max_file_size_bytes
            .unwrap_or(DEFAULT_MAX_FILE_SIZE_BYTES),
    })
}

pub fn save_config(cfg: &SyncConfig) -> Result<()> {
    let dir = config_dir();
    fs::create_dir_all(&dir).context("falha ao criar config dir")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).ok();
    }
    let p = config_path();
    fs::write(&p, serde_json::to_string_pretty(cfg)?).context("falha ao salvar config")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&p, fs::Permissions::from_mode(0o600)).ok();
    }
    Ok(())
}

pub fn load_token() -> Result<String> {
    if let Ok(env) = std::env::var("OPENSYNC_SYNC_TOKEN") {
        let t = env.trim().to_string();
        if !t.is_empty() {
            return Ok(t);
        }
    }
    // compat: variável antiga usada pelo opensync-ubuntu
    if let Ok(env) = std::env::var("OPENSYNC_AGENT_API_KEY") {
        let t = env.trim().to_string();
        if !t.is_empty() {
            return Ok(t);
        }
    }
    let p = token_path();
    let token = fs::read_to_string(&p)
        .with_context(|| format!("Token ausente. Defina OPENSYNC_SYNC_TOKEN ou crie {p:?}"))?;
    Ok(token.trim().to_string())
}

pub fn save_token(token: &str) -> Result<()> {
    let dir = config_dir();
    fs::create_dir_all(&dir)?;
    let p = token_path();
    fs::write(&p, token.trim())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&p, fs::Permissions::from_mode(0o600)).ok();
    }
    Ok(())
}
