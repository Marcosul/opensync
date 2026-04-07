const API_URL = process.env.OPENSYNC_API_URL ?? 'https://api.opensync.space';

function resolveVaultId(vaultId?: string): string {
  const resolved = (vaultId ?? process.env.OPENSYNC_VAULT_ID ?? '').trim();
  if (!resolved) {
    throw new Error('Vault ID ausente. Defina OPENSYNC_VAULT_ID ou ctx.config.vaultId.');
  }
  return resolved;
}

export async function sync(workspaceDir: string, token: string, vaultId?: string): Promise<void> {
  const resolvedVaultId = resolveVaultId(vaultId);
  await fetch(`${API_URL}/git/${encodeURIComponent(resolvedVaultId)}/push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-opensync-user-id': process.env.OPENSYNC_USER_ID ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ workspaceDir }),
  });
}
