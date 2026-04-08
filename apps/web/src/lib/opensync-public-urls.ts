/**
 * URL base pública da API Nest (termina em `/api`).
 * Usar `NEXT_PUBLIC_API_URL` no browser (ex.: `http://localhost:3001/api` ou `https://api.opensync.space/api`).
 */
export function normalizePublicApiBaseUrl(raw: string | undefined | null): string {
  const t = (raw ?? "").trim().replace(/\/+$/, "");
  if (!t) return "";
  return t.endsWith("/api") ? t : `${t}/api`;
}

/** Valor para mostrar no assistente quando a env não está definida (produção). */
const FALLBACK_API_BASE = "https://api.opensync.space/api";

export function getPublicApiBaseUrlForClient(): string {
  return normalizePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_URL) || FALLBACK_API_BASE;
}

/** Origem da app (para links absolutos ao guia da skill). */
export function getPublicAppOriginForClient(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "") || "";
}
