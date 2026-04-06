export const ONBOARDING_COOKIE_NAME = "opensync_onboarding_completed";

export function isOnboardingCompleted(value?: string) {
  return value === "1";
}
