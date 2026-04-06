import { NextResponse } from "next/server";

import { ONBOARDING_COOKIE_NAME } from "@/lib/onboarding";

type OnboardingPayload = {
  goals?: string[];
  usageContext?: string;
  frequency?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as OnboardingPayload;
  const response = NextResponse.json({ ok: true });

  response.cookies.set(ONBOARDING_COOKIE_NAME, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  if (payload.goals?.length) {
    response.cookies.set("opensync_goals", payload.goals.join(" | "), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  if (payload.usageContext) {
    response.cookies.set("opensync_usage_context", payload.usageContext, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  if (payload.frequency) {
    response.cookies.set("opensync_usage_frequency", payload.frequency, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
