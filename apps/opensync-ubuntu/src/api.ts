import type { SyncConfig } from "./config";
import { putFileViaPrepareCommit, type ChangeRow, type ManifestEntry } from "@opensync/sync";

export type { ChangeRow, ManifestEntry };

function apiBase(cfg: SyncConfig): string {
  const raw = cfg.apiUrl.replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

// ─── User API (autenticado via usk_...) ──────────────────────────────────────

export type UserVault = {
  id: string;
  name: string;
  description?: string;
  workspaceName: string;
  createdAt: string;
};

export async function fetchMe(
  apiUrl: string,
  uskToken: string,
): Promise<{ userId: string; email: string }> {
  const base = apiUrl.replace(/\/+$/, "").endsWith("/api")
    ? apiUrl.replace(/\/+$/, "")
    : `${apiUrl.replace(/\/+$/, "")}/api`;
  const res = await fetch(`${base}/user/me`, {
    headers: { Authorization: `Bearer ${uskToken}` },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(text || `me ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text) as { userId: string; email: string };
}

export async function fetchUserVaults(
  apiUrl: string,
  uskToken: string,
): Promise<UserVault[]> {
  const base = apiUrl.replace(/\/+$/, "").endsWith("/api")
    ? apiUrl.replace(/\/+$/, "")
    : `${apiUrl.replace(/\/+$/, "")}/api`;
  const res = await fetch(`${base}/user/vaults`, {
    headers: { Authorization: `Bearer ${uskToken}` },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(text || `vaults ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return (JSON.parse(text) as { vaults: UserVault[] }).vaults;
}

export async function createUserVault(
  apiUrl: string,
  uskToken: string,
  name: string,
): Promise<UserVault> {
  const base = apiUrl.replace(/\/+$/, "").endsWith("/api")
    ? apiUrl.replace(/\/+$/, "")
    : `${apiUrl.replace(/\/+$/, "")}/api`;
  const res = await fetch(`${base}/user/vaults`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${uskToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(text || `create-vault ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return (JSON.parse(text) as { vault: UserVault }).vault;
}

export async function createSyncToken(
  apiUrl: string,
  uskToken: string,
  vaultId: string,
): Promise<{ token: string }> {
  const base = apiUrl.replace(/\/+$/, "").endsWith("/api")
    ? apiUrl.replace(/\/+$/, "")
    : `${apiUrl.replace(/\/+$/, "")}/api`;
  const res = await fetch(`${base}/user/vaults/${encodeURIComponent(vaultId)}/sync-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${uskToken}` },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(text || `sync-token ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text) as { token: string };
}

// ─── App local API (autenticado via osk_...) ─────────────────────────────────

export async function fetchChanges(
  cfg: SyncConfig,
  token: string,
  cursor: string,
): Promise<{ changes: ChangeRow[]; next_cursor: string }> {
  const base = apiBase(cfg);
  const url = `${base}/agent/vaults/${encodeURIComponent(cfg.vaultId)}/changes?cursor=${encodeURIComponent(cursor)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `changes ${res.status}`);
  return JSON.parse(text) as { changes: ChangeRow[]; next_cursor: string };
}

export async function fetchVaultManifest(
  cfg: SyncConfig,
  token: string,
): Promise<{ commitHash: string; entries: ManifestEntry[] }> {
  const base = apiBase(cfg);
  const url = `${base}/agent/vaults/${encodeURIComponent(cfg.vaultId)}/files/manifest`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `manifest ${res.status}`);
  return JSON.parse(text) as { commitHash: string; entries: ManifestEntry[] };
}

export async function upsertFile(
  cfg: SyncConfig,
  token: string,
  path: string,
  content: string,
  baseVersion: string | null,
): Promise<{ path: string; version: string }> {
  return putFileViaPrepareCommit(
    { apiBase: apiBase(cfg), vaultId: cfg.vaultId, bearerToken: token },
    path,
    content,
    baseVersion,
  );
}

export async function getFileContent(
  cfg: SyncConfig,
  token: string,
  filePath: string,
): Promise<{ content: string; version: string }> {
  const base = apiBase(cfg);
  const url = `${base}/agent/vaults/${encodeURIComponent(cfg.vaultId)}/files/content?path=${encodeURIComponent(filePath)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `content ${res.status}`);
  return JSON.parse(text) as { content: string; version: string; file_id?: string };
}

export async function deleteFile(
  cfg: SyncConfig,
  token: string,
  filePath: string,
  baseVersion: string,
): Promise<{ version: string }> {
  const base = apiBase(cfg);
  const url = `${base}/agent/vaults/${encodeURIComponent(cfg.vaultId)}/files/delete`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: filePath, base_version: baseVersion }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `delete ${res.status}`);
  return JSON.parse(text) as { version: string };
}
