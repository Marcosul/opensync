import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export type VaultFileDbResponse = {
  source: "vault_files";
  vaultId: string;
  path: string;
  version: string;
  byteLength: number;
  content: string;
};

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Vault id invalido" }, { status: 400 });
  }

  const url = new URL(request.url);
  const pathParam = url.searchParams.get("path");
  if (!pathParam?.trim()) {
    return NextResponse.json({ error: "Parametro path obrigatorio" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const qs = `?path=${encodeURIComponent(pathParam)}`;

  try {
    const result = await backendRequest<VaultFileDbResponse>(
      `/vaults/${encodeURIComponent(id)}/files/db${qs}`,
      user,
      { method: "GET" },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao ler ficheiro na BD";
    const status = /404|nao encontrad|not found/i.test(message) ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
