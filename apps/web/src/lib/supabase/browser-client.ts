"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnvOrNull } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  const env = getSupabaseEnvOrNull();
  if (!env) {
    throw new Error(
      "Supabase nao configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY) em apps/web/.env — veja .env.example.",
    );
  }
  return createBrowserClient(env.url, env.anonKey);
}
