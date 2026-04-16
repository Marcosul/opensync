/**
 * Logs de diagnóstico vault sync (cliente). Ativar: `NEXT_PUBLIC_OPENSYNC_VAULT_SYNC_DEBUG=1` no `.env.local`.
 */
export function isVaultSyncDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPENSYNC_VAULT_SYNC_DEBUG === "1";
}

export function logVaultSync(...args: unknown[]): void {
  if (!isVaultSyncDebugEnabled()) return;
  console.log("%c[opensync:vault-sync]", "color:#22c55e;font-weight:600", ...args);
}
