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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const qs = limitRaw ? `?limit=${encodeURIComponent(limitRaw)}` : "";
  try {
    const result = await backendRequest<{
      commits: Array<{ sha: string; message: string; authorName: string; authoredAt: string }>;
    }>(`/vaults/${encodeURIComponent(id)}/git/commits${qs}`, user, { method: "GET" });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar commits";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
