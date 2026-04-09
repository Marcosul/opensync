import { resolveOpensyncApiBase } from "./api-base";
import { collectWorkspaceTextFiles } from "./workspace-files";

function resolveVaultId(vaultId?: string): string {
  const resolved = (vaultId ?? process.env.OPENSYNC_VAULT_ID ?? "").trim();
  if (!resolved) {
    throw new Error("Vault ID ausente. Defina OPENSYNC_VAULT_ID ou ctx.config.vaultId.");
  }
  return resolved;
}

export async function sync(workspaceDir: string, token: string, vaultId?: string): Promise<void> {
  const resolvedVaultId = resolveVaultId(vaultId);
  const base = resolveOpensyncApiBase();
  const files = await collectWorkspaceTextFiles(workspaceDir);
  if (Object.keys(files).length === 0) {
    throw new Error(
      "Nenhum ficheiro de texto no workspace para enviar. Adicione notas ou ficheiros .md e tente de novo.",
    );
  }
  const res = await fetch(`${base}/git/${encodeURIComponent(resolvedVaultId)}/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ files }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Push falhou (${res.status})`);
  }
}
