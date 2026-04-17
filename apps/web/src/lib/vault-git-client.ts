import { apiRequest } from "@/api/rest/generic";

export type VaultGitTreeEntry = { path: string; size: number };

export async function fetchVaultGitTree(
  vaultId: string,
  opts?: { ref?: string; signal?: AbortSignal },
): Promise<{ commitHash: string; entries: VaultGitTreeEntry[] }> {
  const ref = opts?.ref;
  const qs =
    ref && ref.trim() ? `?ref=${encodeURIComponent(ref.trim())}` : "";
  return apiRequest(`/api/vaults/${encodeURIComponent(vaultId)}/git/tree${qs}`, {
    signal: opts?.signal,
  });
}

export async function fetchVaultGitBlob(
  vaultId: string,
  path: string,
  opts?: { signal?: AbortSignal },
): Promise<{ content: string; commitHash: string }> {
  return apiRequest(
    `/api/vaults/${encodeURIComponent(vaultId)}/git/blob?path=${encodeURIComponent(path)}`,
    { signal: opts?.signal },
  );
}

export type VaultAllContentsEntry = { path: string; content: string; version: string };

export async function fetchVaultAllContents(
  vaultId: string,
  opts?: { signal?: AbortSignal },
): Promise<{ commitHash: string; files: VaultAllContentsEntry[] }> {
  return apiRequest(
    `/api/vaults/${encodeURIComponent(vaultId)}/files/all-contents`,
    { signal: opts?.signal },
  );
}

export async function fetchVaultGitCommitDiff(
  vaultId: string,
  sha: string,
  opts?: { signal?: AbortSignal },
): Promise<{ patch: string; truncated: boolean }> {
  return apiRequest(
    `/api/vaults/${encodeURIComponent(vaultId)}/git/commits/${encodeURIComponent(sha.trim())}/diff`,
    { signal: opts?.signal },
  );
}

export async function fetchPublicVaultGitTree(
  token: string,
  opts?: { ref?: string; signal?: AbortSignal },
): Promise<{ commitHash: string; entries: VaultGitTreeEntry[] }> {
  const ref = opts?.ref;
  const qs =
    ref && ref.trim() ? `?ref=${encodeURIComponent(ref.trim())}` : "";
  return apiRequest(`/api/public/vault/${encodeURIComponent(token)}/git/tree${qs}`, {
    signal: opts?.signal,
  });
}

export async function fetchPublicVaultGitBlob(
  token: string,
  path: string,
  opts?: { signal?: AbortSignal },
): Promise<{ content: string; commitHash: string }> {
  return apiRequest(
    `/api/public/vault/${encodeURIComponent(token)}/git/blob?path=${encodeURIComponent(path)}`,
    { signal: opts?.signal },
  );
}
