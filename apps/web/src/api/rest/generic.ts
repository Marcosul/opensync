export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: ApiMethod;
  body?: unknown;
  headers?: HeadersInit;
  cache?: RequestCache;
  signal?: AbortSignal;
};

/**
 * Chamadas para Route Handlers do próprio app (`/api/...`).
 * Não usar `NEXT_PUBLIC_API_URL` aqui — essa env é o backend OpenSync (Gitea etc.),
 * usado só em `backendRequest` (que monta a URL do Nest com prefixo `/api`).
 */
function getRequestUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return path.startsWith("/") ? path : `/${path}`;
}

export async function apiRequest<TResponse>(
  path: string,
  options: RequestOptions = {},
) {
  const { method = "GET", body, headers, cache = "no-store", signal } = options;

  const response = await fetch(getRequestUrl(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache,
    signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }

  if (response.status === 204) {
    return null as TResponse;
  }

  return (await response.json()) as TResponse;
}
