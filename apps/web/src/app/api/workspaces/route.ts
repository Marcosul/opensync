import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const result = await backendRequest<{ workspaces: unknown[] }>("/workspaces", {
      id: user.id,
      email: user.email,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao listar workspaces";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

type PostBody = {
  name?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as PostBody;
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Informe um nome valido" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const result = await backendRequest<{ workspace: unknown }>(
      "/workspaces",
      { id: user.id, email: user.email },
      { method: "POST", body: { name: body.name.trim() } },
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao criar workspace";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
