import { NextResponse } from "next/server";

import type { VaultListItem } from "@/lib/vault-list-types";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { backendRequest, type BackendVault } from "@/app/api/_lib/backend-api";

const VAULT_NAME_MAX = 120;

type EmptyPayload = { vaultName?: string };

function normalizeName(raw: string | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > VAULT_NAME_MAX ? t.slice(0, VAULT_NAME_MAX) : t;
}

export async function POST(request: Request) {
  const payload = (await request.json()) as EmptyPayload;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const name = normalizeName(payload.vaultName);
  if (!name) {
    return NextResponse.json({ error: "Informe o nome do vault" }, { status: 400 });
  }

  try {
    const created = await backendRequest<{ vault: BackendVault }>("/vaults", user, {
      method: "POST",
      body: { name, path: "./openclaw" },
    });
    const vault: VaultListItem = {
      id: created.vault.id,
      name: created.vault.name,
      pathLabel: created.vault.giteaRepo,
      kind: "blank",
      managedByProfile: false,
      deletable: true,
      remoteSync: "git",
    };
    return NextResponse.json({ vault });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao criar vault no backend";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
