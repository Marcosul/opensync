import type { User } from "@supabase/supabase-js";

function resolveBackendBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? process.env.OPENSYNC_API_URL ?? "").trim();
  if (!raw) return "";
  const clean = raw.replace(/\/+$/, "");
  return clean.endsWith("/api") ? clean.slice(0, -4) : clean;
}

export type BackendVault = {
  id: string;
  name: string;
  path: string;
  giteaRepo: string;
  createdAt: string;
};

export async function backendRequest<T>(
  path: string,
  user: User,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const base = resolveBackendBaseUrl();
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_URL/OPENSYNC_API_URL não configurado");
  }
  const method = options.method ?? "GET";
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-opensync-user-id": user.id,
      "x-opensync-user-email": user.email ?? "",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Falha no backend (${response.status})`);
  }
  return (await response.json()) as T;
}
