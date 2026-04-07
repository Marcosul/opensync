import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import {
  META_SETTINGS_KEY,
  sanitizeUserSettings,
  type UserSettings,
} from "@/lib/user-settings";

const LOG = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
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

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const userMetaSettings = sanitizeUserSettings(user.user_metadata?.[META_SETTINGS_KEY]);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    if (shouldFallbackToUserMetadata(profileError.message)) {
      console.log(
        `${LOG.yellow}🟡 [settings][GET] profiles indisponivel, usando user_metadata para ${user.id}${LOG.reset}`,
      );
      return NextResponse.json({ ok: true, settings: userMetaSettings, stored: "user_metadata" });
    }
    console.error(`${LOG.red}🔴 [settings][GET] erro no profiles:${LOG.reset}`, profileError.message);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const settingsFromProfile = sanitizeUserSettings(profile?.settings);
  console.log(
    `${LOG.cyan}🔵 [settings][GET] settings carregadas para ${user.id} (fonte: profiles)${LOG.reset}`,
  );
  return NextResponse.json({
    ok: true,
    settings: profile?.settings ? settingsFromProfile : userMetaSettings,
    stored: "profiles",
  });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as { settings?: unknown };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const settings = sanitizeUserSettings(payload.settings);
  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    if (shouldFallbackToUserMetadata(selectError.message)) {
      const metaErr = await saveSettingsToUserMetadata(supabase, user, settings);
      if (metaErr) {
        console.error(`${LOG.red}🔴 [settings][POST] erro user_metadata:${LOG.reset}`, metaErr);
        return NextResponse.json({ error: metaErr }, { status: 500 });
      }
      console.log(
        `${LOG.yellow}🟡 [settings][POST] settings salvas no user_metadata para ${user.id}${LOG.reset}`,
      );
      return NextResponse.json({ ok: true, settings, stored: "user_metadata" });
    }
    console.error(`${LOG.red}🔴 [settings][POST] erro ao buscar profile:${LOG.reset}`, selectError.message);
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ settings })
      .eq("id", user.id);

    if (updateError) {
      if (shouldFallbackToUserMetadata(updateError.message)) {
        const metaErr = await saveSettingsToUserMetadata(supabase, user, settings);
        if (metaErr) {
          console.error(`${LOG.red}🔴 [settings][POST] erro user_metadata:${LOG.reset}`, metaErr);
          return NextResponse.json({ error: metaErr }, { status: 500 });
        }
        console.log(
          `${LOG.yellow}🟡 [settings][POST] fallback para user_metadata (update) em ${user.id}${LOG.reset}`,
        );
        return NextResponse.json({ ok: true, settings, stored: "user_metadata" });
      }
      console.error(`${LOG.red}🔴 [settings][POST] erro update profiles:${LOG.reset}`, updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? "",
      onboarding_goals: ["Configuracoes inicializadas"],
      onboarding_usage_context: null,
      onboarding_frequency: null,
      onboarding_completed_at: null,
      settings,
    });

    if (insertError) {
      if (shouldFallbackToUserMetadata(insertError.message)) {
        const metaErr = await saveSettingsToUserMetadata(supabase, user, settings);
        if (metaErr) {
          console.error(`${LOG.red}🔴 [settings][POST] erro user_metadata:${LOG.reset}`, metaErr);
          return NextResponse.json({ error: metaErr }, { status: 500 });
        }
        console.log(
          `${LOG.yellow}🟡 [settings][POST] fallback para user_metadata (insert) em ${user.id}${LOG.reset}`,
        );
        return NextResponse.json({ ok: true, settings, stored: "user_metadata" });
      }
      console.error(`${LOG.red}🔴 [settings][POST] erro insert profiles:${LOG.reset}`, insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  console.log(`${LOG.green}🟢 [settings][POST] settings salvas no profiles para ${user.id}${LOG.reset}`);
  return NextResponse.json({ ok: true, settings, stored: "profiles" });
}

async function saveSettingsToUserMetadata(
  supabase: SupabaseClient,
  user: User,
  settings: UserSettings,
): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      [META_SETTINGS_KEY]: settings,
    },
  });
  return error?.message ?? null;
}

