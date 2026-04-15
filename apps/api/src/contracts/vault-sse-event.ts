/**
 * Contrato SSE do vault (espelha `packages/sync/src/sse-event.ts`).
 * Mantido na API para o Docker/Fly usar só o contexto `apps/api` sem `workspace:*`.
 */
export type VaultSseEvent =
  | { type: "change"; vaultId: string; changeId: string; cursor: string }
  | { type: "heartbeat"; vaultId: string; ts: number };
