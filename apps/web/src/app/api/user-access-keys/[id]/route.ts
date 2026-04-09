import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/** Revogar token por ID */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  try {
    const result = await backendRequest<{ ok: boolean }>(
      `/user-access-keys/${encodeURIComponent(id)}`,
      user,
      { method: "DELETE" },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao revogar token";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
