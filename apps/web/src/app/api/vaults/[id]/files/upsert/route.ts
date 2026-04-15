import { NextResponse } from "next/server";
import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type UpsertBody = {
  path?: string;
  content?: string;
  base_version?: string | null;
};

type UpsertResult = {
  path: string;
  version: string;
  updated_at: string;
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

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.path?.trim() || typeof body.content !== "string") {
    return NextResponse.json({ error: "path e content obrigatorios" }, { status: 400 });
  }

  try {
    const result = await backendRequest<UpsertResult>(
      `/vaults/${encodeURIComponent(id)}/files/upsert`,
      user,
      { method: "POST", body },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no upsert";
    const status = message.includes("409") || message.includes("Versao remota divergiu") ? 409 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
