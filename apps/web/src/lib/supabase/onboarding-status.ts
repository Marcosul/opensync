import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True when onboarding was finished (persisted on public.profiles.onboarding_completed_at).
 */
export async function isOnboardingCompleteInDatabase(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.onboarding_completed_at);
}
