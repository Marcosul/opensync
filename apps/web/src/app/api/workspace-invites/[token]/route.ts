import { NextResponse } from "next/server";

import { backendPublicRequest } from "@/app/api/_lib/backend-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  try {
    const result = await backendPublicRequest<{ invite: unknown }>(
      `/workspace-invites/${encodeURIComponent(token)}`,
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Convite invalido";
    const status = message.includes("nao configurado") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
