import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export type GraphNode = {
  id: string;
  label: string;
  type: "markdown" | "file";
  path: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  type: "wikilink" | "link";
};

export type VaultGraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  fileCount: number;
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
  const rebuild = url.searchParams.get("rebuild");
  const qs = rebuild === "true" ? "?rebuild=true" : "";

  try {
    const result = await backendRequest<VaultGraphResponse>(
      `/vaults/${encodeURIComponent(id)}/graph${qs}`,
      user,
      { method: "GET" },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar grafo";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
