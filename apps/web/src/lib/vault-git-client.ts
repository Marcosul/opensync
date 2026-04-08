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
