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

/** Origem da app em SSR / docs quando NEXT_PUBLIC_APP_URL está vazio. */
const FALLBACK_APP_ORIGIN = "https://opensync.space";

/** Caminho do script de instalação Ubuntu servido pelo Next (GET). */
export const UBUNTU_INSTALL_SCRIPT_PATH = "/install/ubuntu";

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

/** Origem canónica da app em contexto servidor (ex.: página de docs). */
export function getPublicAppOriginForServer(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "") || FALLBACK_APP_ORIGIN;
}

/** URL absoluta do script GET /install/ubuntu (cliente: usa window ou NEXT_PUBLIC_APP_URL). */
export function getUbuntuInstallScriptUrlForClient(): string {
  const origin = getPublicAppOriginForClient();
  return origin ? `${origin}${UBUNTU_INSTALL_SCRIPT_PATH}` : "";
}

/** URL absoluta do script de instalação Ubuntu (servidor). */
export function getUbuntuInstallScriptUrlForServer(): string {
  return `${getPublicAppOriginForServer()}${UBUNTU_INSTALL_SCRIPT_PATH}`;
}

/** Comando de uma linha para colar no terminal Ubuntu. */
export function getUbuntuInstallOnelinerForClient(): string {
  const url = getUbuntuInstallScriptUrlForClient();
  return url ? `curl -fsSL ${url} | bash` : "";
}

export function getUbuntuInstallOnelinerForServer(): string {
  return `curl -fsSL ${getUbuntuInstallScriptUrlForServer()} | bash`;
}
