import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { AgentConnectionPayload } from "@/lib/onboarding-agent";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type OnboardingPayload = {
  goals?: string[];
  usageContext?: string;
  frequency?: string;
  agentConnection?: AgentConnectionPayload;
};

function shouldFallbackToUserMetadata(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("profiles") ||
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    (m.includes("relation") && m.includes("does not exist"))
  );
}

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

  if (!payload.agentConnection) {
    return NextResponse.json({ error: "Informe a conexao do agente" }, { status: 400 });
  }

  const completedAt = new Date().toISOString();

  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    if (shouldFallbackToUserMetadata(selectError.message)) {
      const metaErr = await saveOnboardingToUserMetadata(supabase, user, {
        completedAt,
        goals,
        usageContext: payload.usageContext ?? null,
        frequency: payload.frequency ?? null,
        agentConnection: payload.agentConnection,
      });
      if (metaErr) {
        return NextResponse.json({ error: metaErr }, { status: 500 });
      }
      return NextResponse.json({ ok: true, stored: "user_metadata" });
    }
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (existing) {
    const { error } = await supabase
      .from("profiles")
      .update({
        onboarding_goals: goals,
        onboarding_usage_context: payload.usageContext ?? null,
        onboarding_frequency: payload.frequency ?? null,
        onboarding_completed_at: completedAt,
        agent_connection: payload.agentConnection,
      })
      .eq("id", user.id);

    if (error) {
      if (shouldFallbackToUserMetadata(error.message)) {
        const metaErr = await saveOnboardingToUserMetadata(supabase, user, {
          completedAt,
          goals,
          usageContext: payload.usageContext ?? null,
          frequency: payload.frequency ?? null,
          agentConnection: payload.agentConnection,
        });
        if (metaErr) {
          return NextResponse.json({ error: metaErr }, { status: 500 });
        }
        return NextResponse.json({ ok: true, stored: "user_metadata" });
      }
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
      agent_connection: payload.agentConnection,
    });

    if (error) {
      if (shouldFallbackToUserMetadata(error.message)) {
        const metaErr = await saveOnboardingToUserMetadata(supabase, user, {
          completedAt,
          goals,
          usageContext: payload.usageContext ?? null,
          frequency: payload.frequency ?? null,
          agentConnection: payload.agentConnection,
        });
        if (metaErr) {
          return NextResponse.json({ error: metaErr }, { status: 500 });
        }
        return NextResponse.json({ ok: true, stored: "user_metadata" });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, stored: "profiles" });
}

async function saveOnboardingToUserMetadata(
  supabase: SupabaseClient,
  user: User,
  data: {
    completedAt: string;
    goals: string[];
    usageContext: string | null;
    frequency: string | null;
    agentConnection: AgentConnectionPayload;
  },
): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      opensync_onboarding_completed_at: data.completedAt,
      opensync_onboarding_goals: data.goals,
      opensync_onboarding_usage_context: data.usageContext,
      opensync_onboarding_frequency: data.frequency,
      opensync_agent_connection: data.agentConnection,
    },
  });
  return error?.message ?? null;
}
