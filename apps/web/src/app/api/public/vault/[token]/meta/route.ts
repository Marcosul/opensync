import { NextResponse } from "next/server";

import { backendPublicRequest } from "@/app/api/_lib/backend-api";

export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Token invalido" }, { status: 400 });
  }

  try {
    const result = await backendPublicRequest<{ name: string }>(
      `/public/vaults/${encodeURIComponent(token.trim())}/meta`,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Partilha nao encontrada" }, { status: 404 });
  }
}
