/** Eventos emitidos pelo endpoint SSE do servidor */
export type VaultSseEvent =
  | { type: "change"; vaultId: string; changeId: string; cursor: string }
  | { type: "heartbeat"; vaultId: string; ts: number };
