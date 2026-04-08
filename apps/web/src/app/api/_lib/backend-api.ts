/** Cabecalhos enviados ao Nest; basta o que o Supabase devolve em `getUser()`. */
export type BackendRequestUser = {
  id: string;
  email?: string | null;
};

function resolveBackendBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? process.env.OPENSYNC_API_URL ?? "").trim();
  if (!raw) return "";
  const clean = raw.replace(/\/+$/, "");
  return clean.endsWith("/api") ? clean.slice(0, -4) : clean;
}

/** NestJS usa `setGlobalPrefix('api')`; paths sem `/api` viram 404 no servidor real. */
function resolveBackendPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/api" || normalized.startsWith("/api/")) {
    return normalized;
  }
  return `/api${normalized}`;
}

const TRANSIENT_BACKEND_STATUSES = new Set([502, 503, 504]);
const BACKEND_FETCH_MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type BackendVault = {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  giteaRepo: string;
  createdAt: string;
};

export async function backendRequest<T>(
  path: string,
  user: BackendRequestUser,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const base = resolveBackendBaseUrl();
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_URL/OPENSYNC_API_URL não configurado");
  }
  const method = options.method ?? "GET";
  const url = `${base}${resolveBackendPath(path)}`;
  const body =
    options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers: Record<string, string> = {
    "x-opensync-user-id": user.id,
    "x-opensync-user-email": user.email ?? "",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let lastStatus = 0;
  for (let attempt = 1; attempt <= BACKEND_FETCH_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
    });
    lastStatus = response.status;
    if (response.ok) {
      return (await response.json()) as T;
    }
    const retry =
      TRANSIENT_BACKEND_STATUSES.has(response.status) &&
      attempt < BACKEND_FETCH_MAX_ATTEMPTS;
    if (retry) {
      await sleep(250 * 2 ** (attempt - 1));
      continue;
    }
    const message = await response.text();
    throw new Error(message || `Falha no backend (${response.status})`);
  }
  throw new Error(`Falha no backend (${lastStatus})`);
}
