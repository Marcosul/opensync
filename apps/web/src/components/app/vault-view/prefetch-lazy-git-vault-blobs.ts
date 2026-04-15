/**
 * Prefetch em lote dos blobs Git do vault lazy (TanStack Query + merge em `noteContents`).
 * Alimenta grafo/backlinks e evita loading ao abrir ficheiros já em cache.
 */
import type { QueryClient } from "@tanstack/react-query";
import { startTransition } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { VaultUiState } from "@/components/app/vault-persistence";
import {
  createVaultGitBlobQueryFn,
  LAZY_GIT_BLOB_STALE_MS,
  vaultGitBlobQueryKey,
} from "@/lib/vault-git-blob-query";
import { isGitKeepMarkerPath } from "@/lib/vault-git-tree-import";

export const LAZY_GIT_BLOB_PREFETCH_CONCURRENCY = 8;
/** Prefetch em segundo plano dos separadores abertos (baixa prioridade, pouca concorrência). */
export const LAZY_OPEN_TAB_PREFETCH_CONCURRENCY = 2;
export const LAZY_OPEN_TAB_PREFETCH_MAX = 16;

export async function prefetchLazyGitVaultBlobs(
  vaultId: string,
  remotePaths: readonly string[],
  signal: AbortSignal,
  opts: {
    queryClient: QueryClient;
    noteContentsRef: MutableRefObject<Record<string, string>>;
    lazyGitDirtyDocIdsRef: MutableRefObject<Set<string>>;
    setNoteContents: Dispatch<SetStateAction<Record<string, string>>>;
    uiLatestRef: MutableRefObject<VaultUiState>;
    lastBlobFetchRef: MutableRefObject<{ tab: string; commit: string | null } | null>;
    blobsSnapshotCommitRef: MutableRefObject<string | null>;
    commitShort: string;
  },
): Promise<void> {
  const paths = remotePaths
    .map((p) => p.replace(/\\/g, "/").trim())
    .filter((p) => p.length > 0 && !isGitKeepMarkerPath(p));
  const {
    queryClient,
    noteContentsRef,
    lazyGitDirtyDocIdsRef,
    setNoteContents,
    uiLatestRef,
    lastBlobFetchRef,
    blobsSnapshotCommitRef,
  } = opts;
  blobsSnapshotCommitRef.current = opts.commitShort;
  for (let i = 0; i < paths.length; i += LAZY_GIT_BLOB_PREFETCH_CONCURRENCY) {
    if (signal.aborted) return;
    const slice = paths.slice(i, i + LAZY_GIT_BLOB_PREFETCH_CONCURRENCY);
    const updates: Record<string, string> = {};
    await Promise.all(
      slice.map(async (p) => {
        if (signal.aborted) return;
        if (lazyGitDirtyDocIdsRef.current.has(p)) return;
        if (noteContentsRef.current[p] !== undefined) return;
        try {
          const content = await queryClient.fetchQuery({
            queryKey: vaultGitBlobQueryKey(vaultId, p, opts.commitShort),
            queryFn: createVaultGitBlobQueryFn(vaultId, p, signal),
            staleTime: LAZY_GIT_BLOB_STALE_MS,
          });
          updates[p] = content;
        } catch {
          /* ignora um path; os restantes continuam */
        }
      }),
    );
    if (signal.aborted) return;
    if (Object.keys(updates).length === 0) continue;
    blobsSnapshotCommitRef.current = opts.commitShort;
    startTransition(() => {
      setNoteContents((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(updates)) {
          if (lazyGitDirtyDocIdsRef.current.has(k)) continue;
          next[k] = v;
        }
        noteContentsRef.current = next;
        return next;
      });
    });
  }
  if (signal.aborted) return;
  const tab = uiLatestRef.current.activeTabId;
  if (tab && noteContentsRef.current[tab] !== undefined) {
    lastBlobFetchRef.current = { tab, commit: opts.commitShort };
  }
}
