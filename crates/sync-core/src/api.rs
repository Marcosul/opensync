use crate::{
    config::{api_base, SyncConfig},
    hash::hash_content,
};
use anyhow::{anyhow, bail, Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

// ── Tipos de resposta ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct ChangeRow {
    pub path: String,
    pub content: Option<String>,
    pub version: String,
    pub deleted: Option<bool>,
    pub rename_from: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ManifestEntry {
    pub path: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChangesResponse {
    pub changes: Vec<ChangeRow>,
    pub next_cursor: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ManifestResponse {
    #[serde(rename = "commitHash")]
    pub commit_hash: String,
    pub entries: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileContent {
    pub content: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpsertResult {
    pub path: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteResult {
    pub version: String,
}

// ── Erro com status HTTP ──────────────────────────────────────────────────────

#[derive(Debug)]
pub struct HttpError {
    pub status: u16,
    pub body: String,
}

impl std::fmt::Display for HttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "HTTP {}: {}", self.status, self.body)
    }
}
impl std::error::Error for HttpError {}

pub fn is_auth_error(e: &anyhow::Error) -> bool {
    e.downcast_ref::<HttpError>()
        .map(|e| e.status == 401 || e.status == 403)
        .unwrap_or(false)
}

pub fn is_conflict(e: &anyhow::Error) -> bool {
    e.downcast_ref::<HttpError>()
        .map(|e| e.status == 409)
        .unwrap_or(false)
}

pub fn is_transient(e: &anyhow::Error) -> bool {
    e.downcast_ref::<HttpError>()
        .map(|e| e.status == 408 || e.status == 429 || e.status >= 500)
        .unwrap_or(true) // sem status (timeout de rede) → tratar como transient
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

// ── Helpers de URL ────────────────────────────────────────────────────────────

fn vault_files_url(cfg: &SyncConfig) -> String {
    format!(
        "{}/agent/vaults/{}/files",
        api_base(cfg),
        urlencoding::encode(&cfg.vault_id)
    )
}

fn vault_url(cfg: &SyncConfig) -> String {
    format!(
        "{}/agent/vaults/{}",
        api_base(cfg),
        urlencoding::encode(&cfg.vault_id)
    )
}

pub fn sse_url(cfg: &SyncConfig) -> String {
    format!("{}/events", vault_url(cfg))
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

pub async fn fetch_changes(
    client: &Client,
    cfg: &SyncConfig,
    token: &str,
    cursor: &str,
) -> Result<ChangesResponse> {
    let url = format!(
        "{}/changes?cursor={}",
        vault_url(cfg),
        urlencoding::encode(cursor)
    );
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .context("fetch_changes")?;
    let text = ok_text(res).await?;
    serde_json::from_str(&text).context("parse changes")
}

pub async fn fetch_vault_manifest(
    client: &Client,
    cfg: &SyncConfig,
    token: &str,
) -> Result<ManifestResponse> {
    let url = format!("{}/manifest", vault_files_url(cfg));
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .context("fetch_manifest")?;
    let text = ok_text(res).await?;
    serde_json::from_str(&text).context("parse manifest")
}

pub async fn get_file_content(
    client: &Client,
    cfg: &SyncConfig,
    token: &str,
    path: &str,
) -> Result<FileContent> {
    let url = format!(
        "{}/content?path={}",
        vault_files_url(cfg),
        urlencoding::encode(path)
    );
    let res = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .context("get_file_content")?;
    let text = ok_text(res).await?;
    serde_json::from_str(&text).context("parse file content")
}

// ── Upload (prepare → PUT → commit) ──────────────────────────────────────────

#[derive(Serialize)]
struct PreparePutBody<'a> {
    path: &'a str,
    hash: String,
    size: usize,
    base_version: Option<&'a str>,
}

#[derive(Deserialize)]
struct PreparePutResponse {
    status: String,
    new_version: Option<String>,
    upload_token: Option<String>,
}

#[derive(Serialize)]
struct CommitPutBody<'a> {
    upload_token: &'a str,
}

pub async fn upsert_file(
    client: &Client,
    cfg: &SyncConfig,
    token: &str,
    path: &str,
    content: &str,
    base_version: Option<&str>,
) -> Result<UpsertResult> {
    let base = vault_files_url(cfg);
    let hash = hash_content(content);
    let size = content.len();

    let prep = client
        .post(format!("{base}/prepare-put"))
        .bearer_auth(token)
        .json(&PreparePutBody {
            path,
            hash,
            size,
            base_version,
        })
        .send()
        .await
        .context("prepare-put send")?;
    let prep_text = ok_text(prep).await?;
    let prep_resp: PreparePutResponse =
        serde_json::from_str(&prep_text).context("parse prepare-put")?;

    if prep_resp.status == "already_exists" {
        let version = prep_resp
            .new_version
            .ok_or_else(|| anyhow!("already_exists sem new_version"))?;
        return Ok(UpsertResult {
            path: path.to_string(),
            version,
        });
    }

    if prep_resp.status != "upload_required" {
        bail!("prepare-put resposta inesperada: {prep_text}");
    }

    let upload_token = prep_resp
        .upload_token
        .ok_or_else(|| anyhow!("upload_required sem upload_token"))?;

    // PUT do conteúdo
    let put_res = client
        .put(format!(
            "{base}/uploads/{}",
            urlencoding::encode(&upload_token)
        ))
        .bearer_auth(token)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(content.to_string())
        .send()
        .await
        .context("upload PUT")?;
    ok_text(put_res).await?;

    // commit-put
    let commit_res = client
        .post(format!("{base}/commit-put"))
        .bearer_auth(token)
        .json(&CommitPutBody {
            upload_token: &upload_token,
        })
        .send()
        .await
        .context("commit-put")?;
    let commit_text = ok_text(commit_res).await?;
    serde_json::from_str(&commit_text).context("parse commit-put")
}

// ── Delete ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct DeleteBody<'a> {
    path: &'a str,
    base_version: &'a str,
}

pub async fn delete_file(
    client: &Client,
    cfg: &SyncConfig,
    token: &str,
    path: &str,
    base_version: &str,
) -> Result<DeleteResult> {
    let url = format!("{}/delete", vault_files_url(cfg));
    let res = client
        .post(&url)
        .bearer_auth(token)
        .json(&DeleteBody { path, base_version })
        .send()
        .await
        .context("delete_file")?;
    let text = ok_text(res).await?;
    serde_json::from_str(&text).context("parse delete")
}
