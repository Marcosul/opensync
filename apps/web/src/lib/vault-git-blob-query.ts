import { fetchVaultGitBlob } from "@/lib/vault-git-client";

export const LAZY_GIT_BLOB_STALE_MS = 60_000;
export const LAZY_GIT_BLOB_GC_MS = 1000 * 60 * 30;

export const vaultGitBlobQueryKeyRoot = ["vault-git-blob"] as const;

export function vaultGitBlobQueryKey(
  vaultId: string,
  docPath: string,
  commitKey: string,
) {
  return ["vault-git-blob", vaultId, docPath, commitKey] as const;
}

export async function fetchVaultGitBlobQueryFn(
  vaultId: string,
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const { content } = await fetchVaultGitBlob(vaultId, path, { signal });
  return content;
}

export function mergeVaultGitAbortSignals(
  outer: AbortSignal,
  inner: AbortSignal,
): AbortSignal {
  const anyFn = (
    typeof AbortSignal !== "undefined"
      ? (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal })
          .any
      : undefined
  );
  if (typeof anyFn === "function") {
    return anyFn([outer, inner]);
  }
  return inner;
}

export function createVaultGitBlobQueryFn(
  vaultId: string,
  path: string,
  outerSignal: AbortSignal,
) {
  return ({ signal }: { signal: AbortSignal }) =>
    fetchVaultGitBlobQueryFn(
      vaultId,
      path,
      mergeVaultGitAbortSignals(outerSignal, signal),
    );
}
