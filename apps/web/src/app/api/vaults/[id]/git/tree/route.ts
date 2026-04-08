import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export type VaultGitTreeResponse = {
  commitHash: string;
  entries: { path: string; size: number }[];
};

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const ref = url.searchParams.get("ref");
  const qs =
    ref && ref.trim() ? `?ref=${encodeURIComponent(ref.trim())}` : "";

  try {
    const result = await backendRequest<VaultGitTreeResponse>(
      `/vaults/${encodeURIComponent(id)}/git/tree${qs}`,
      user,
      { method: "GET" },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao ler arvore";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
