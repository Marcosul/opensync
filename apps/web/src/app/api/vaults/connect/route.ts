import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  toStoredAgentConnection,
  type AgentConnectionPayload,
  type AgentConnectionStored,
} from "@/lib/onboarding-agent";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type ConnectPayload = {
  agentConnection?: AgentConnectionPayload;
  vaultName?: string;
};

const VAULT_NAME_MAX = 120;

function normalizeVaultName(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return t.length > VAULT_NAME_MAX ? t.slice(0, VAULT_NAME_MAX) : t;
}

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
  const payload = (await request.json()) as ConnectPayload;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  if (!payload.agentConnection) {
    return NextResponse.json({ error: "Informe a conexao do agente" }, { status: 400 });
  }

  const vaultLabel = normalizeVaultName(payload.vaultName);
  if (!vaultLabel) {
    return NextResponse.json({ error: "Informe o nome do vault" }, { status: 400 });
  }

  const stored: AgentConnectionStored = toStoredAgentConnection(
    payload.agentConnection,
    vaultLabel,
  );

  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    if (shouldFallbackToUserMetadata(selectError.message)) {
      const metaErr = await saveAgentConnectionToUserMetadata(supabase, user, stored);
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
      .update({ agent_connection: stored })
      .eq("id", user.id);

    if (error) {
      if (shouldFallbackToUserMetadata(error.message)) {
        const metaErr = await saveAgentConnectionToUserMetadata(supabase, user, stored);
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
      onboarding_goals: ["Vault conectado pelo dashboard"],
      onboarding_usage_context: null,
      onboarding_frequency: null,
      onboarding_completed_at: null,
      agent_connection: stored,
    });

    if (error) {
      if (shouldFallbackToUserMetadata(error.message)) {
        const metaErr = await saveAgentConnectionToUserMetadata(supabase, user, stored);
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

async function saveAgentConnectionToUserMetadata(
  supabase: SupabaseClient,
  user: User,
  agentConnection: AgentConnectionStored,
): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      opensync_agent_connection: agentConnection,
    },
  });
  return error?.message ?? null;
}
