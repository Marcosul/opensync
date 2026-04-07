import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  DEFAULT_SSH_REMOTE_PATH,
  toStoredAgentConnection,
  type AgentConnectionPayload,
} from "@/lib/onboarding-agent";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import {
  normalizeStoredRemotePath,
  sshPullAuthFromStored,
} from "@/lib/server/agent-ssh-pull-params";
import { mapSshKeyOrConnectionError } from "@/lib/server/ssh-error-message";
import { verifySshRemotePath } from "@/lib/server/ssh-workspace-pull";

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

  if (payload.agentConnection.mode === "gateway") {
    return NextResponse.json(
      { error: "Conexao via gateway foi descontinuada. Use SSH com chave ou com senha." },
      { status: 400 },
    );
  }

  const ac = payload.agentConnection;
  const sshProbe = sshPullAuthFromStored(toStoredAgentConnection(ac, undefined));
  if (sshProbe) {
    try {
      await verifySshRemotePath(sshProbe);
    } catch (err) {
      const message =
        err instanceof Error
          ? mapSshKeyOrConnectionError(err.message)
          : "Falha na conexao SSH ou no caminho remoto.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  let connectionToSave: Exclude<AgentConnectionPayload, { mode: "gateway" }> = ac;
  if (ac.mode === "ssh_key" || ac.mode === "ssh_password") {
    const rp = ac.remotePath?.trim() || DEFAULT_SSH_REMOTE_PATH;
    connectionToSave = { ...ac, remotePath: normalizeStoredRemotePath(rp) };
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
        agentConnection: connectionToSave,
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
        agent_connection: connectionToSave,
      })
      .eq("id", user.id);

    if (error) {
      if (shouldFallbackToUserMetadata(error.message)) {
        const metaErr = await saveOnboardingToUserMetadata(supabase, user, {
          completedAt,
          goals,
          usageContext: payload.usageContext ?? null,
          frequency: payload.frequency ?? null,
          agentConnection: connectionToSave,
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
      agent_connection: connectionToSave,
    });

    if (error) {
      if (shouldFallbackToUserMetadata(error.message)) {
        const metaErr = await saveOnboardingToUserMetadata(supabase, user, {
          completedAt,
          goals,
          usageContext: payload.usageContext ?? null,
          frequency: payload.frequency ?? null,
          agentConnection: connectionToSave,
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
