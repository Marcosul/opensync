import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Vault id invalido" }, { status: 400 });
  }
  const url = new URL(request.url);
  const sha = url.searchParams.get("sha")?.trim();
  if (!sha) {
    return NextResponse.json({ error: "Query sha e obrigatoria" }, { status: 400 });
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
    const qs = `?sha=${encodeURIComponent(sha)}`;
    const result = await backendRequest<{ patch: string; truncated: boolean }>(
      `/vaults/${encodeURIComponent(id)}/git/commit-diff${qs}`,
      user,
      { method: "GET" },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao obter diff";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
