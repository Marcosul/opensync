import { NextResponse } from "next/server";

import type { VaultListItem } from "@/lib/vault-list-types";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { backendRequest, type BackendVault } from "@/app/api/_lib/backend-api";

const VAULT_NAME_MAX = 120;

type EmptyPayload = { vaultName?: string };

type BackendErrorPayload = {
  statusCode?: number;
  error?: string;
  message?: string | string[];
};

function normalizeName(raw: string | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > VAULT_NAME_MAX ? t.slice(0, VAULT_NAME_MAX) : t;
}

function parseBackendError(rawMessage: string): BackendErrorPayload | null {
  try {
    const parsed = JSON.parse(rawMessage) as BackendErrorPayload;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function messageIncludesConflictHint(payload: BackendErrorPayload): boolean {
  const text = Array.isArray(payload.message)
    ? payload.message.join(" ")
    : typeof payload.message === "string"
      ? payload.message
      : "";
  const error = typeof payload.error === "string" ? payload.error : "";
  return /conflict|ja existe|já existe|already exists|duplicate/i.test(`${text} ${error}`);
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
    const rawMessage =
      error instanceof Error ? error.message : "Falha ao criar vault no backend";
    const parsed = parseBackendError(rawMessage);

    if (parsed?.statusCode === 409 && messageIncludesConflictHint(parsed)) {
      try {
        const list = await backendRequest<{ vaults: BackendVault[] }>("/vaults", user, {
          method: "GET",
        });
        const exact = list.vaults.find((v) => normalizeName(v.name) === name);
        const fallback = list.vaults.find(
          (v) => v.name.trim().toLowerCase() === name.toLowerCase(),
        );
        const existing = exact ?? fallback;

        if (existing) {
          const vault: VaultListItem = {
            id: existing.id,
            name: existing.name,
            pathLabel: existing.giteaRepo,
            kind: "blank",
            managedByProfile: false,
            deletable: true,
            remoteSync: "git",
          };
          return NextResponse.json({ vault, reused: true as const });
        }
      } catch {
        // Fallback para resposta de conflito amigável abaixo.
      }
      return NextResponse.json(
        { error: `Ja existe um vault com nome "${name}" neste workspace.` },
        { status: 409 },
      );
    }

    const message =
      parsed && typeof parsed.message === "string" && parsed.message
        ? parsed.message
        : rawMessage;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
