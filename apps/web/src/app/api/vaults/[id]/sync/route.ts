import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type SyncBody = {
  files?: Record<string, string>;
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Vault id invalido" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  let body: SyncBody;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.files || typeof body.files !== "object" || Array.isArray(body.files)) {
    return NextResponse.json({ error: "Campo files obrigatorio (objeto)" }, { status: 400 });
  }

  try {
    const result = await backendRequest<{ ok: boolean; commitHash: string }>(
      `/vaults/${encodeURIComponent(id)}/sync`,
      user,
      { method: "POST", body: { files: body.files } },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
