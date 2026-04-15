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

/**
 * Versão do pacote `.deb` em `public/releases/` (alinhado com `apps/opensync-ubuntu/package.json` e `build-deb.sh`).
 */
export const UBUNTU_DEB_PACKAGE_VERSION = "0.2.5";

/** Caminho público do `.deb` quando servido pelo próprio site (ficheiro em `apps/web/public/releases/`). */
export function getDefaultUbuntuDebPathname(): string {
  return `/releases/opensync-ubuntu_${UBUNTU_DEB_PACKAGE_VERSION}_amd64.deb`;
}

/** URL HTTPS do `.deb` por defeito (ficheiro em `public/releases/` no mesmo host da app). */
export function getDefaultUbuntuDebUrlForServer(): string {
  return `${getPublicAppOriginForServer()}${getDefaultUbuntuDebPathname()}`;
}

/**
 * URL pública do `.deb` no Supabase Storage (bucket `installer`, object público).
 * Usa `NEXT_PUBLIC_SUPABASE_URL` — já presente no deploy típico; evita 404 em `/releases/...` sem ficheiro.
 */
export function getSupabasePublicInstallerDebUrlForServer(): string {
  const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!supabase) return "";
  try {
    const u = new URL(supabase);
    if (u.protocol !== "https:") return "";
  } catch {
    return "";
  }
  const objectPath = `/storage/v1/object/public/installer/opensync-ubuntu_${UBUNTU_DEB_PACKAGE_VERSION}_amd64.deb`;
  return `${supabase}${objectPath}`;
}

/**
 * Ordem: `OPENSYNC_UBUNTU_DEB_URL` → URL derivada do Supabase (`installer/`) → mesmo host `/releases/...`.
 */
export function resolveUbuntuDebDownloadUrlForServer(): string {
  const explicit = (process.env.OPENSYNC_UBUNTU_DEB_URL ?? "").trim();
  if (explicit) return explicit;
  const fromSupabase = getSupabasePublicInstallerDebUrlForServer();
  if (fromSupabase) return fromSupabase;
  return getDefaultUbuntuDebUrlForServer();
}

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
