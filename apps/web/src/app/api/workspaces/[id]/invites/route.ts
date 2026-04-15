import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const result = await backendRequest<{ invites: unknown[] }>(
      `/workspaces/${encodeURIComponent(id)}/invites`,
      { id: user.id, email: user.email },
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao listar convites";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

type PostBody = {
  email?: string;
  role?: string;
  message?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as PostBody;
  if (!body.email || typeof body.email !== "string" || !body.email.trim()) {
    return NextResponse.json({ error: "Informe o e-mail" }, { status: 400 });
  }
  if (!body.role || typeof body.role !== "string") {
    return NextResponse.json({ error: "Informe o papel (role)" }, { status: 400 });
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
    const result = await backendRequest<{ invite: unknown }>(
      `/workspaces/${encodeURIComponent(id)}/invites`,
      { id: user.id, email: user.email },
      {
        method: "POST",
        body: {
          email: body.email.trim(),
          role: body.role,
          ...(body.message ? { message: body.message } : {}),
        },
      },
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao criar convite";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
