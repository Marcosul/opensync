import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type Body = { commit?: unknown };

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Vault id invalido" }, { status: 400 });
  }
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const commit = typeof body.commit === "string" ? body.commit.trim() : "";
  if (!commit) {
    return NextResponse.json({ error: "commit obrigatorio" }, { status: 400 });
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
    const result = await backendRequest<{
      ok: true;
      commitHash: string;
      importedFiles: number;
    }>(`/vaults/${encodeURIComponent(id)}/git/restore`, user, {
      method: "POST",
      body: { commit },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao restaurar commit";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
