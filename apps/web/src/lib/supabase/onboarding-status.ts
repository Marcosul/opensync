import type { SupabaseClient, User } from "@supabase/supabase-js";

const META_COMPLETED_AT = "opensync_onboarding_completed_at";

export function isOnboardingCompleteFromMetadata(user: User): boolean {
  return Boolean(user.user_metadata?.[META_COMPLETED_AT]);
}

/**
 * Onboarding concluido se estiver em user_metadata (fallback) ou em public.profiles.
 */
export async function isOnboardingCompleteInDatabase(
  supabase: SupabaseClient,
  user: User,
): Promise<boolean> {
  if (isOnboardingCompleteFromMetadata(user)) {
    return true;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.onboarding_completed_at);
}
