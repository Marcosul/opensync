export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: ApiMethod;
  body?: unknown;
  headers?: HeadersInit;
  cache?: RequestCache;
};

function getApiBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!baseUrl) {
    return "";
  }

  return baseUrl.replace(/\/+$/, "");
}

function getRequestUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  let normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const apiBaseUrl = getApiBaseUrl();

  if (apiBaseUrl && apiBaseUrl.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    normalizedPath = normalizedPath.slice(4);
  }

  return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
}

export async function apiRequest<TResponse>(
  path: string,
  options: RequestOptions = {},
) {
  const { method = "GET", body, headers, cache = "no-store" } = options;

  const response = await fetch(getRequestUrl(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache,
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
