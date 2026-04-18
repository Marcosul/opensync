use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::api::HttpError;

/// Base URL do user API (`<api_url>` ou `<api_url>/api` se faltar).
fn user_api_base(api_url: &str) -> String {
    let raw = api_url.trim_end_matches('/');
    if raw.ends_with("/api") {
        raw.to_string()
    } else {
        format!("{raw}/api")
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Me {
    #[serde(rename = "userId")]
    pub user_id: String,
    pub email: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UserVault {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "workspaceName")]
    pub workspace_name: String,
    #[serde(rename = "createdAt", default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct UserVaultsResponse {
    vaults: Vec<UserVault>,
}

#[derive(Debug, Clone, Deserialize)]
struct UserVaultResponse {
    vault: UserVault,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SyncTokenResponse {
    pub token: String,
}

#[derive(Debug, Clone, Serialize)]
struct CreateVaultBody<'a> {
    name: &'a str,
}

async fn ok_text(res: reqwest::Response) -> Result<String> {
    let status = res.status().as_u16();
    let body = res.text().await.unwrap_or_default();
    if (200..300).contains(&status) {
        Ok(body)
    } else {
        Err(HttpError { status, body }.into())
    }
}

/// `GET /user/me` — valida o token `usk_...`.
pub async fn fetch_me(client: &Client, api_url: &str, usk_token: &str) -> Result<Me> {
    let base = user_api_base(api_url);
    let res = client
        .get(format!("{base}/user/me"))
        .bearer_auth(usk_token)
        .send()
        .await
        .context("user/me send")?;
    let text = ok_text(res).await?;
    serde_json::from_str(&text).context("parse user/me")
}

/// `GET /user/vaults` — lista vaults do utilizador.
pub async fn list_user_vaults(
    client: &Client,
    api_url: &str,
    usk_token: &str,
) -> Result<Vec<UserVault>> {
    let base = user_api_base(api_url);
    let res = client
        .get(format!("{base}/user/vaults"))
        .bearer_auth(usk_token)
        .send()
        .await
        .context("user/vaults send")?;
    let text = ok_text(res).await?;
    let parsed: UserVaultsResponse = serde_json::from_str(&text).context("parse user/vaults")?;
    Ok(parsed.vaults)
}

/// `POST /user/vaults` — cria um vault novo.
pub async fn create_user_vault(
    client: &Client,
    api_url: &str,
    usk_token: &str,
    name: &str,
) -> Result<UserVault> {
    let base = user_api_base(api_url);
    let res = client
        .post(format!("{base}/user/vaults"))
        .bearer_auth(usk_token)
        .json(&CreateVaultBody { name })
        .send()
        .await
        .context("create vault send")?;
    let text = ok_text(res).await?;
    let parsed: UserVaultResponse = serde_json::from_str(&text).context("parse create vault")?;
    Ok(parsed.vault)
}

/// `POST /user/vaults/:id/sync-token` — gera token `ast_...`/`osk_...` para o daemon.
pub async fn create_sync_token(
    client: &Client,
    api_url: &str,
    usk_token: &str,
    vault_id: &str,
) -> Result<String> {
    let base = user_api_base(api_url);
    let url = format!(
        "{base}/user/vaults/{}/sync-token",
        urlencoding::encode(vault_id)
    );
    let res = client
        .post(&url)
        .bearer_auth(usk_token)
        .send()
        .await
        .context("create sync-token send")?;
    let text = ok_text(res).await?;
    let parsed: SyncTokenResponse =
        serde_json::from_str(&text).context("parse sync-token")?;
    Ok(parsed.token)
}
