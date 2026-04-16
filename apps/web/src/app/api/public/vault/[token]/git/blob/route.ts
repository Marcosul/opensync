import { NextResponse } from "next/server";

import { backendPublicRequest } from "@/app/api/_lib/backend-api";

type VaultGitBlobResponse = { content: string; commitHash: string };

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Token invalido" }, { status: 400 });
  }

  const url = new URL(request.url);
  const pathParam = url.searchParams.get("path");
  if (!pathParam?.trim()) {
    return NextResponse.json({ error: "Parametro path obrigatorio" }, { status: 400 });
  }

  const qs = `?path=${encodeURIComponent(pathParam)}`;

  try {
    const result = await backendPublicRequest<VaultGitBlobResponse>(
      `/public/vaults/${encodeURIComponent(token.trim())}/git/blob${qs}`,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Ficheiro ou partilha invalida" }, { status: 404 });
  }
}
