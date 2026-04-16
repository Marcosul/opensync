import { hashContent } from "./hash";

/** Config mínima para chamadas à API do agente (prepare → PUT → commit). */
export type AgentHttpTransportConfig = {
  /** URL base com sufixo `/api` (ex.: `https://host/api`). */
  apiBase: string;
  vaultId: string;
  bearerToken: string;
};

function agentVaultFilesBase(cfg: AgentHttpTransportConfig): string {
  return `${cfg.apiBase.replace(/\/+$/, "")}/agent/vaults/${encodeURIComponent(cfg.vaultId)}/files`;
}

/**
 * Upload de um ficheiro via prepare-put → PUT texto → commit-put (sync-engine v2).
 * Usa o mesmo hash SHA-256 UTF-8 que o servidor (`VaultFilesService.sha256HexUtf8`).
 */
export async function putFileViaPrepareCommit(
  cfg: AgentHttpTransportConfig,
  relPath: string,
  content: string,
  baseVersion: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<{ path: string; version: string }> {
  const base = agentVaultFilesBase(cfg);
  const hash = hashContent(content);
  const size = new TextEncoder().encode(content).length;

  const prepRes = await fetchImpl(`${base}/prepare-put`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.bearerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: relPath,
      hash,
      size,
      base_version: baseVersion,
    }),
  });
  const prepText = await prepRes.text();
  if (prepRes.status === 409) {
    const err = new Error(prepText || "Conflict") as Error & { status: number };
    err.status = 409;
    throw err;
  }
  if (!prepRes.ok) {
    const err = new Error(prepText || `prepare-put ${prepRes.status}`) as Error & { status: number };
    err.status = prepRes.status;
    throw err;
  }

  const prep = JSON.parse(prepText) as {
    status: string;
    new_version?: string;
    upload_token?: string;
    expires_at?: string;
  };

  if (prep.status === "already_exists" && prep.new_version !== undefined) {
    return { path: relPath, version: prep.new_version };
  }

  if (prep.status !== "upload_required" || !prep.upload_token) {
    throw new Error(`prepare-put resposta inesperada: ${prepText}`);
  }

  const token = prep.upload_token;
  const putRes = await fetchImpl(`${base}/uploads/${encodeURIComponent(token)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfg.bearerToken}`,
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: content,
  });
  const putText = await putRes.text();
  if (!putRes.ok) {
    const err = new Error(putText || `upload ${putRes.status}`) as Error & { status: number };
    err.status = putRes.status;
    throw err;
  }

  const commitRes = await fetchImpl(`${base}/commit-put`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.bearerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ upload_token: token }),
  });
  const commitText = await commitRes.text();
  if (!commitRes.ok) {
    const err = new Error(commitText || `commit-put ${commitRes.status}`) as Error & {
      status: number;
    };
    err.status = commitRes.status;
    throw err;
  }

  return JSON.parse(commitText) as { path: string; version: string };
}
