import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type PatchBody = {
  name?: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as PatchBody;

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
    const result = await backendRequest<{ workspace: { id: string; name: string } }>(
      `/workspaces/${encodeURIComponent(id)}`,
      { id: user.id, email: user.email },
      { method: "PATCH", body: { name: body.name.trim() } },
    );
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Falha ao atualizar workspace";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
