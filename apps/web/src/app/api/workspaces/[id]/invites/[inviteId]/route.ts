import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; inviteId: string }> },
) {
  const { id, inviteId } = await context.params;
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
      `/workspaces/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`,
      { id: user.id, email: user.email },
      { method: "DELETE" },
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao cancelar convite";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
