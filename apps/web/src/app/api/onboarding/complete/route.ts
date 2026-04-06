import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type OnboardingPayload = {
  goals?: string[];
  usageContext?: string;
  frequency?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as OnboardingPayload;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const goals = payload.goals ?? [];
  if (goals.length === 0) {
    return NextResponse.json({ error: "Selecione pelo menos um objetivo" }, { status: 400 });
  }

  const completedAt = new Date().toISOString();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("profiles")
      .update({
        onboarding_goals: goals,
        onboarding_usage_context: payload.usageContext ?? null,
        onboarding_frequency: payload.frequency ?? null,
        onboarding_completed_at: completedAt,
      })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? "",
      onboarding_goals: goals,
      onboarding_usage_context: payload.usageContext ?? null,
      onboarding_frequency: payload.frequency ?? null,
      onboarding_completed_at: completedAt,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
