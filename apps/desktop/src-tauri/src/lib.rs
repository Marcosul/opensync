//! OpenSync Desktop — biblioteca Tauri 2.
//!
//! Expõe comandos IPC ao frontend Vite/React:
//! - `auth_login`: valida `usk_*` token contra `/user/me`.
//! - `auth_logout`: limpa credenciais em memória.
//! - `auth_current`: devolve o utilizador autenticado (ou `null`).
//! - `vaults_list`: chama `/user/vaults`.
//! - `vaults_create`: cria vault novo.
//! - `desktop_info`: metadados (versão, plataforma).

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::RwLock;

use sync_core::user_api;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub api_url: String,
    pub usk_token: String,
    pub user_id: String,
    pub email: String,
}

#[derive(Default)]
pub struct AppState {
    pub session: RwLock<Option<AuthSession>>,
    pub http: reqwest::Client,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            session: RwLock::new(None),
            http: reqwest::Client::builder()
                .user_agent(concat!("opensync-desktop/", env!("CARGO_PKG_VERSION")))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DesktopInfo {
    pub version: &'static str,
    pub platform: &'static str,
    pub default_api_url: &'static str,
}

#[derive(Debug, Serialize)]
pub struct UiVault {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub workspace_name: String,
    pub created_at: Option<String>,
}

impl From<user_api::UserVault> for UiVault {
    fn from(v: user_api::UserVault) -> Self {
        Self {
            id: v.id,
            name: v.name,
            description: v.description,
            workspace_name: v.workspace_name,
            created_at: v.created_at,
        }
    }
}

const DEFAULT_API_URL: &str = "https://opensync.space/api";

#[tauri::command]
async fn desktop_info() -> DesktopInfo {
    DesktopInfo {
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        default_api_url: DEFAULT_API_URL,
    }
}

#[tauri::command]
async fn auth_login(
    state: State<'_, Arc<AppState>>,
    api_url: Option<String>,
    usk_token: String,
) -> Result<AuthSession, String> {
    let api_url = api_url
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_API_URL.to_string());
    let token = usk_token.trim().to_string();
    if token.is_empty() {
        return Err("Token vazio".into());
    }
    let me = user_api::fetch_me(&state.http, &api_url, &token)
        .await
        .map_err(|e| format!("Falha ao validar token: {e}"))?;

    let session = AuthSession {
        api_url,
        usk_token: token,
        user_id: me.user_id,
        email: me.email,
    };
    *state.session.write().await = Some(session.clone());
    Ok(session)
}

#[tauri::command]
async fn auth_logout(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    *state.session.write().await = None;
    Ok(())
}

#[tauri::command]
async fn auth_current(state: State<'_, Arc<AppState>>) -> Result<Option<AuthSession>, String> {
    Ok(state.session.read().await.clone())
}

#[tauri::command]
async fn vaults_list(state: State<'_, Arc<AppState>>) -> Result<Vec<UiVault>, String> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or_else(|| "Não autenticado".to_string())?;

    let vaults =
        user_api::list_user_vaults(&state.http, &session.api_url, &session.usk_token)
            .await
            .map_err(|e| format!("Falha ao listar vaults: {e}"))?;
    Ok(vaults.into_iter().map(UiVault::from).collect())
}

#[tauri::command]
async fn vaults_create(
    state: State<'_, Arc<AppState>>,
    name: String,
) -> Result<UiVault, String> {
    let session = state
        .session
        .read()
        .await
        .clone()
        .ok_or_else(|| "Não autenticado".to_string())?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Nome do vault vazio".into());
    }

    let vault = user_api::create_user_vault(
        &state.http,
        &session.api_url,
        &session.usk_token,
        trimmed,
    )
    .await
    .map_err(|e| format!("Falha ao criar vault: {e}"))?;
    Ok(UiVault::from(vault))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "opensync_desktop=info,sync_core=info".into()),
        )
        .without_time()
        .init();

    let state = Arc::new(AppState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            auth_login,
            auth_logout,
            auth_current,
            vaults_list,
            vaults_create,
        ])
        .setup(|app| {
            tracing::info!(
                "🚀 OpenSync Desktop inicializado (v{})",
                env!("CARGO_PKG_VERSION")
            );
            // Acesso ao window principal para futuras integrações (tray, eventos, etc.)
            if let Some(_w) = app.get_webview_window("main") {
                tracing::info!("🖼️  Janela principal pronta");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar aplicação Tauri");
}
