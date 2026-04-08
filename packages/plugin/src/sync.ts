import { resolveOpensyncApiBase } from './api-base';

function resolveVaultId(vaultId?: string): string {
  const resolved = (vaultId ?? process.env.OPENSYNC_VAULT_ID ?? '').trim();
  if (!resolved) {
    throw new Error('Vault ID ausente. Defina OPENSYNC_VAULT_ID ou ctx.config.vaultId.');
  }
  return resolved;
}

export async function sync(workspaceDir: string, token: string, vaultId?: string): Promise<void> {
  const resolvedVaultId = resolveVaultId(vaultId);
  const base = resolveOpensyncApiBase();
  await fetch(`${base}/git/${encodeURIComponent(resolvedVaultId)}/push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-opensync-user-id': process.env.OPENSYNC_USER_ID ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ workspaceDir }),
  });
}
