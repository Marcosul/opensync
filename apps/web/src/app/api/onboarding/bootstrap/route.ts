import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

/**
 * Garante perfil no Supabase (dispara workspace via trigger) e workspace no Nest (fallback).
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (!existingProfile) {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? "",
      onboarding_goals: [],
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  try {
    const result = await backendRequest<{ workspace: { id: string; name: string } }>(
      "/workspaces/ensure-default",
      { id: user.id, email: user.email },
      { method: "POST" },
    );
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Falha ao garantir workspace no backend";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
