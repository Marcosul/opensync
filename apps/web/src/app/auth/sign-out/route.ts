import { NextResponse } from "next/server";

import { ONBOARDING_COOKIE_NAME } from "@/lib/onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/sign-in", request.url));
  response.cookies.delete(ONBOARDING_COOKIE_NAME);
  return response;
}
