import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type Body = {
  token?: string;
  inviteId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  if (!body.token?.trim() && !body.inviteId?.trim()) {
    return NextResponse.json({ error: "Informe token ou inviteId" }, { status: 400 });
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
    const result = await backendRequest<{ ok: boolean; workspaceId?: string }>(
      "/workspace-invites/accept",
      { id: user.id, email: user.email },
      {
        method: "POST",
        body: {
          ...(body.token?.trim() ? { token: body.token.trim() } : {}),
          ...(body.inviteId?.trim() ? { inviteId: body.inviteId.trim() } : {}),
        },
      },
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao aceitar convite";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
