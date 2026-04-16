import { NextResponse } from "next/server";

import { backendPublicRequest } from "@/app/api/_lib/backend-api";

type VaultGitTreeResponse = { commitHash: string; entries: Array<{ path: string; size: number }> };

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Token invalido" }, { status: 400 });
  }

  const url = new URL(request.url);
  const ref = url.searchParams.get("ref");
  const qs = ref && ref.trim() ? `?ref=${encodeURIComponent(ref.trim())}` : "";

  try {
    const result = await backendPublicRequest<VaultGitTreeResponse>(
      `/public/vaults/${encodeURIComponent(token.trim())}/git/tree${qs}`,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Partilha nao encontrada" }, { status: 404 });
  }
}
