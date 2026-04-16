/**
 * Prefetch em lote dos blobs Git do vault lazy (TanStack Query + merge em `noteContents`).
 * Alimenta grafo/backlinks e evita loading ao abrir ficheiros já em cache.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { VaultUiState } from "@/components/app/vault-persistence";
import {
  createVaultGitBlobQueryFn,
  LAZY_GIT_BLOB_STALE_MS,
  vaultGitBlobQueryKey,
} from "@/lib/vault-git-blob-query";
import { isGitKeepMarkerPath } from "@/lib/vault-git-tree-import";

export const LAZY_GIT_BLOB_PREFETCH_CONCURRENCY = 4;
/** Prefetch em segundo plano dos separadores abertos (baixa prioridade, pouca concorrência). */
export const LAZY_OPEN_TAB_PREFETCH_CONCURRENCY = 2;
export const LAZY_OPEN_TAB_PREFETCH_MAX = 16;
/** Limita o prefetch global para não competir com a abertura interativa do editor. */
export const LAZY_GIT_BACKGROUND_PREFETCH_MAX = 64;

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
    /** Quando o tail remoto mudou: voltar a buscar mesmo que já exista corpo em memória. */
    forceBlobRefetch?: boolean;
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
    forceBlobRefetch = false,
  } = opts;
  const pathSet = new Set(paths);
  const priorityPaths = [
    uiLatestRef.current.activeTabId,
    ...uiLatestRef.current.openTabs,
  ].filter((id): id is string => Boolean(id) && pathSet.has(id));
  const prioritySet = new Set(priorityPaths);
  const orderedPaths = [
    ...new Set(priorityPaths),
    ...paths
      .filter((p) => !prioritySet.has(p))
      .slice(0, LAZY_GIT_BACKGROUND_PREFETCH_MAX),
  ];
  blobsSnapshotCommitRef.current = opts.commitShort;
  for (let i = 0; i < orderedPaths.length; i += LAZY_GIT_BLOB_PREFETCH_CONCURRENCY) {
    if (signal.aborted) return;
    const slice = orderedPaths.slice(i, i + LAZY_GIT_BLOB_PREFETCH_CONCURRENCY);
    const updates: Record<string, string> = {};
    await Promise.all(
      slice.map(async (p) => {
        if (signal.aborted) return;
        if (lazyGitDirtyDocIdsRef.current.has(p)) return;
        if (!forceBlobRefetch && noteContentsRef.current[p] !== undefined) return;
        try {
          if (forceBlobRefetch) {
            await queryClient.removeQueries({
              queryKey: vaultGitBlobQueryKey(vaultId, p, opts.commitShort),
            });
          }
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
    setNoteContents((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(updates)) {
        if (lazyGitDirtyDocIdsRef.current.has(k)) continue;
        next[k] = v;
      }
      noteContentsRef.current = next;
      return next;
    });
  }
  if (signal.aborted) return;
  const tab = uiLatestRef.current.activeTabId;
  if (tab && noteContentsRef.current[tab] !== undefined) {
    lastBlobFetchRef.current = { tab, commit: opts.commitShort };
  }
}
