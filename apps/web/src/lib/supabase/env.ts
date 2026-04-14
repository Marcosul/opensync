/**
 * Supabase public key: classic `anon` JWT or newer publishable key (`sb_publishable_...`).
 * Prefer `NEXT_PUBLIC_SUPABASE_ANON_KEY`; fall back to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`.
 */
export function getSupabaseEnvOrNull(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  )?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnvOrNull() !== null;
}

/** Usar em rotas/actions que exigem Supabase; falha com mensagem clara se o `.env` estiver incompleto. */
export function getSupabaseEnv() {
  const env = getSupabaseEnvOrNull();
  if (!env) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and a public Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)",
    );
  }
  return env;
}
