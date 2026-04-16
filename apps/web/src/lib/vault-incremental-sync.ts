import { mergeTextPreserveBoth } from "@opensync/sync";
import type { WebSyncStateMap } from "./vault-web-sync-state";

type UpsertResult = { path: string; version: string; updated_at: string };

/** Resultado do sync de um único arquivo */
export type SingleFileSyncResult =
  | { ok: true; version: string }
  | { ok: false; merged: string; reason: "conflict_merge_failed" | "error" };

/**
 * Faz upsert incremental de um único arquivo do vault com conflict resolution.
 *
 * O servidor também expõe prepare-put → PUT → commit-put (ver `docs/dev/sync-engine-v2.md`);
 * o cliente web mantém POST `/files/upsert` por simplicidade e paridade de merge com 409.
 *
 * Fluxo:
 * 1. Tenta upsert com base_version do syncState
 * 2. Se 409 (versão divergiu): busca conteúdo remoto, resolve com merge determinístico
 *    (sem marcadores no texto) e re-tenta com a versão remota como base
 * 3. Se merge também falhar: retorna { ok: false, merged } para a UI exibir ao usuário
 *
 * Alinhado com opensync-ubuntu (`mergeTextPreserveBoth` → auto-resolve no pacote sync).
 */
export async function syncSingleFile(
  vaultId: string,
  filePath: string,
  content: string,
  syncState: WebSyncStateMap,
  signal?: AbortSignal,
): Promise<SingleFileSyncResult> {
  // Verificar se o conteúdo já está sincronizado (deduplicação)
  if (syncState.isClean(filePath, content)) {
    return { ok: true, version: syncState.get(filePath)!.remoteVersion };
  }

  const baseVersion = syncState.get(filePath)?.remoteVersion ?? null;

  try {
    const result = await apiUpsert(vaultId, filePath, content, baseVersion, signal);
    syncState.afterUpsert(filePath, result.version, content);
    return { ok: true, version: result.version };
  } catch (err) {
    if (!is409(err)) {
      return { ok: false, merged: content, reason: "error" };
    }

    // 409: versão divergiu — buscar conteúdo remoto e fazer merge
    try {
      const remote = await apiGetBlob(vaultId, filePath, signal);
      const merged = mergeTextPreserveBoth(content, remote.content);

      const retryResult = await apiUpsert(vaultId, filePath, merged, remote.commitHash, signal);
      syncState.afterUpsert(filePath, retryResult.version, merged);
      return { ok: true, version: retryResult.version };
    } catch {
      // Se o retry também falhou, retorna o texto merged para exibição
      return { ok: false, merged: content, reason: "conflict_merge_failed" };
    }
  }
}

/**
 * Sincroniza múltiplos arquivos em paralelo (com limite de concorrência).
 * Retorna mapa de path → resultado.
 */
export async function syncDirtyFiles(
  vaultId: string,
  dirtyPaths: string[],
  getContent: (path: string) => string,
  syncState: WebSyncStateMap,
  signal?: AbortSignal,
): Promise<Map<string, SingleFileSyncResult>> {
  const results = new Map<string, SingleFileSyncResult>();
  const MAX_CONCURRENCY = 4;

  // Processar em lotes de MAX_CONCURRENCY
  for (let i = 0; i < dirtyPaths.length; i += MAX_CONCURRENCY) {
    const batch = dirtyPaths.slice(i, i + MAX_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (fp) => {
        const content = getContent(fp);
        const result = await syncSingleFile(vaultId, fp, content, syncState, signal);
        return [fp, result] as const;
      }),
    );
    for (const [fp, result] of batchResults) {
      results.set(fp, result);
    }
  }
  return results;
}

// ─── Helpers internos ────────────────────────────────────────────────────────

async function apiUpsert(
  vaultId: string,
  filePath: string,
  content: string,
  baseVersion: string | null,
  signal?: AbortSignal,
): Promise<UpsertResult> {
  const res = await fetch(`/api/vaults/${encodeURIComponent(vaultId)}/files/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath, content, base_version: baseVersion }),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(text || `upsert ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text) as UpsertResult;
}

async function apiGetBlob(
  vaultId: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<{ content: string; commitHash: string }> {
  const res = await fetch(
    `/api/vaults/${encodeURIComponent(vaultId)}/git/blob?path=${encodeURIComponent(filePath)}`,
    { signal },
  );
  if (!res.ok) {
    throw new Error(`blob ${res.status}`);
  }
  return (await res.json()) as { content: string; commitHash: string };
}

function is409(err: unknown): boolean {
  if (err instanceof Error) {
    const e = err as Error & { status?: number };
    if (e.status === 409) return true;
    if (e.message.includes("409") || e.message.includes("Versao remota divergiu")) return true;
  }
  return false;
}
