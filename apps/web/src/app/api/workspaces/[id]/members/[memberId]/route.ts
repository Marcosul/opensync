import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type PatchBody = {
  role?: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await context.params;
  const body = (await request.json()) as PatchBody;
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
    const result = await backendRequest<{ member: unknown }>(
      `/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`,
      { id: user.id, email: user.email },
      { method: "PATCH", body: { role: body.role } },
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao atualizar membro";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const result = await backendRequest<{ ok: boolean }>(
      `/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`,
      { id: user.id, email: user.email },
      { method: "DELETE" },
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao remover membro";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
