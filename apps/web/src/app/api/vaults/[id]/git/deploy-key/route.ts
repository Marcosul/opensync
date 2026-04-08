import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export type AgentDeployKeyResponse = {
  vaultId: string;
  giteaRepo: string;
  giteaDeployKeyId: number;
  fingerprint: string | null;
  publicKey: string;
  privateKeyOpenssh: string;
  cloneSshUrl: string;
  instructions: string;
};

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
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

  try {
    const result = await backendRequest<AgentDeployKeyResponse>(
      `/vaults/${encodeURIComponent(id)}/git/deploy-key`,
      user,
      { method: "POST" },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar deploy key";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
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

  try {
    const result = await backendRequest<{ ok: boolean; removed: boolean }>(
      `/vaults/${encodeURIComponent(id)}/git/deploy-key`,
      user,
      { method: "DELETE" },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao revogar deploy key";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
