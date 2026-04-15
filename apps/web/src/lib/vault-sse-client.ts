import type { VaultSseEvent } from "@opensync/sync";

const SSE_RECONNECT_DELAY_BASE_MS = 2_000;
const SSE_RECONNECT_DELAY_MAX_MS = 30_000;

/**
 * Conecta ao stream SSE do vault via Next.js proxy (/api/vaults/:id/events).
 * Chama `onCursorChange` sempre que há mudanças remotas.
 * Reconecta automaticamente com exponential backoff.
 * Retorna função de cleanup para encerrar a conexão.
 *
 * Usa EventSource nativo do browser (sem polyfill necessário).
 */
export function connectVaultSse(
  vaultId: string,
  onCursorChange: (cursor: string) => void,
  onConnected?: () => void,
): () => void {
  let stopped = false;
  let delay = SSE_RECONNECT_DELAY_BASE_MS;
  let es: EventSource | undefined;

  function connect(): void {
    if (stopped) return;

    const url = `/api/vaults/${encodeURIComponent(vaultId)}/events`;
    es = new EventSource(url);

    es.onopen = () => {
      delay = SSE_RECONNECT_DELAY_BASE_MS; // reset backoff
      onConnected?.();
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as VaultSseEvent;
        if (data.type === "change") {
          onCursorChange(data.cursor);
        }
        // heartbeat: ignorar (mantém conexão viva)
      } catch {
        /* linha malformada: ignorar */
      }
    };

    es.onerror = () => {
      es?.close();
      es = undefined;
      if (stopped) return;
      setTimeout(() => {
        delay = Math.min(delay * 2, SSE_RECONNECT_DELAY_MAX_MS);
        connect();
      }, delay);
    };
  }

  connect();

  return () => {
    stopped = true;
    es?.close();
    es = undefined;
  };
}
