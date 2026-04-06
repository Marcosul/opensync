import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ONBOARDING_COOKIE_NAME, isOnboardingCompleted } from "@/lib/onboarding";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { isOnboardingCompleteInDatabase } from "@/lib/supabase/onboarding-status";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const onboardingDoneFromCookie = isOnboardingCompleted(
    cookieStore.get(ONBOARDING_COOKIE_NAME)?.value,
  );
  const onboardingDoneFromDb = await isOnboardingCompleteInDatabase(supabase, user.id);
  const onboardingDone = onboardingDoneFromDb || onboardingDoneFromCookie;

  return NextResponse.redirect(
    new URL(onboardingDone ? "/dashboard" : "/onboarding", request.url),
  );
}
