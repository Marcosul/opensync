import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export type UserAccessKey = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/** Listar tokens ativos */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  try {
    const result = await backendRequest<{ keys: UserAccessKey[] }>("/user-access-keys", user);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar tokens";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Criar novo token */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  let label: string | undefined;
  try {
    const body = await request.json() as { label?: string };
    label = body.label;
  } catch {
    // label opcional
  }

  try {
    const result = await backendRequest<{ token: string; id: string; label: string }>(
      "/user-access-keys",
      user,
      { method: "POST", body: { label } },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar token";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
