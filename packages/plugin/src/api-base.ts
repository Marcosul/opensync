/** Base URL da API Nest (inclui `/api`). */
export function resolveOpensyncApiBase(): string {
  const raw = (process.env.OPENSYNC_API_URL ?? 'https://api.opensync.space').replace(/\/+$/, '');
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}
