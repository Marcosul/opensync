import { NextResponse, type NextRequest } from "next/server";

import { ONBOARDING_COOKIE_NAME, isOnboardingCompleted } from "@/lib/onboarding";
import { createSupabaseProxyClient } from "@/lib/supabase/proxy-client";
import { isOnboardingCompleteInDatabase } from "@/lib/supabase/onboarding-status";

function getTrimmedPathname(pathname: string) {
  try {
    const decodedPathname = decodeURIComponent(pathname);
    return decodedPathname.replace(/\s+$/g, "");
  } catch {
    return pathname.replace(/\s+$/g, "");
  }
}

function isPrivatePath(pathname: string) {
  return pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding");
}

function isAuthPath(pathname: string) {
  return pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const trimmedPathname = getTrimmedPathname(pathname);

  // Normalize URLs accidentally returned by OAuth providers with trailing spaces.
  if (trimmedPathname !== pathname) {
    const normalizedUrl = new URL(request.url);
    normalizedUrl.pathname = trimmedPathname;
    return NextResponse.redirect(normalizedUrl);
  }

  if (!isPrivatePath(pathname) && !isAuthPath(pathname)) {
    return NextResponse.next();
  }

  const { supabase, response } = createSupabaseProxyClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let onboardingDone = isOnboardingCompleted(
    request.cookies.get(ONBOARDING_COOKIE_NAME)?.value,
  );

  if (user) {
    const fromDb = await isOnboardingCompleteInDatabase(supabase, user);
    onboardingDone = fromDb || onboardingDone;
  }

  if (isPrivatePath(pathname) && !user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (user && isAuthPath(pathname)) {
    return NextResponse.redirect(
      new URL(onboardingDone ? "/dashboard" : "/onboarding", request.url),
    );
  }

  if (user && pathname.startsWith("/dashboard") && !onboardingDone) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  if (user && pathname.startsWith("/onboarding") && onboardingDone) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/sign-in",
    "/sign-up",
    "/auth/:path*",
    "/dashboard/:path*",
    "/onboarding/:path*",
  ],
};
