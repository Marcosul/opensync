export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: ApiMethod;
  body?: unknown;
  headers?: HeadersInit;
  cache?: RequestCache;
};

export async function apiRequest<TResponse>(
  path: string,
  options: RequestOptions = {},
) {
  const { method = "GET", body, headers, cache = "no-store" } = options;

  const response = await fetch(path, {
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
