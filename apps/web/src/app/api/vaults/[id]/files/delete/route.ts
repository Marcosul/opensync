import { NextResponse } from "next/server";
import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type DeleteBody = {
  path?: string;
  base_version?: string;
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

  let body: DeleteBody;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.path?.trim() || !body.base_version) {
    return NextResponse.json({ error: "path e base_version obrigatorios" }, { status: 400 });
  }

  try {
    const result = await backendRequest<{ path: string; version: string; updated_at: string }>(
      `/vaults/${encodeURIComponent(id)}/files/delete`,
      user,
      { method: "POST", body },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no delete";
    const status = message.includes("409") || message.includes("Versao remota divergiu") ? 409 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
