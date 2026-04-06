/**
 * Supabase public key: classic `anon` JWT or newer publishable key (`sb_publishable_...`).
 * Prefer `NEXT_PUBLIC_SUPABASE_ANON_KEY`; fall back to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and a public Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)",
    );
  }

  return { url, anonKey };
}
