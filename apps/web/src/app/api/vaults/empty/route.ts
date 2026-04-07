import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { VaultListItem } from "@/lib/vault-list-types";
import {
  mergeSavedVaultsFromSources,
  type SavedVaultRecord,
  savedVaultToListItem,
} from "@/lib/saved-vaults";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

const VAULT_NAME_MAX = 120;

type EmptyPayload = {
  vaultName?: string;
};

function shouldFallbackToUserMetadata(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("profiles") ||
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("saved_vaults") ||
    (m.includes("column") && m.includes("does not exist")) ||
    (m.includes("relation") && m.includes("does not exist"))
  );
}

function normalizeName(raw: string | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > VAULT_NAME_MAX ? t.slice(0, VAULT_NAME_MAX) : t;
}

async function persistSavedVaults(
  supabase: SupabaseClient,
  user: User,
  nextList: SavedVaultRecord[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    if (shouldFallbackToUserMetadata(selectError.message)) {
      const metaErr = await saveVaultsToUserMetadata(supabase, user, nextList);
      return metaErr ? { ok: false, error: metaErr } : { ok: true };
    }
    return { ok: false, error: selectError.message };
  }

  if (existing) {
    const { error } = await supabase
      .from("profiles")
      .update({ saved_vaults: nextList })
      .eq("id", user.id);

    if (error) {
      if (shouldFallbackToUserMetadata(error.message)) {
        const metaErr = await saveVaultsToUserMetadata(supabase, user, nextList);
        return metaErr ? { ok: false, error: metaErr } : { ok: true };
      }
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? "",
      onboarding_goals: [],
      saved_vaults: nextList,
    });

    if (error) {
      if (shouldFallbackToUserMetadata(error.message)) {
        const metaErr = await saveVaultsToUserMetadata(supabase, user, nextList);
        return metaErr ? { ok: false, error: metaErr } : { ok: true };
      }
      return { ok: false, error: error.message };
    }
  }

  return { ok: true };
}

async function saveVaultsToUserMetadata(
  supabase: SupabaseClient,
  user: User,
  vaults: SavedVaultRecord[],
): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      opensync_saved_vaults: vaults,
    },
  });
  return error?.message ?? null;
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("saved_vaults")
    .eq("id", user.id)
    .maybeSingle();

  const current = mergeSavedVaultsFromSources(
    profile?.saved_vaults,
    user.user_metadata?.opensync_saved_vaults,
  );

  const record: SavedVaultRecord = {
    id: randomUUID(),
    name,
    kind: "empty",
    createdAt: new Date().toISOString(),
  };
  const nextList = [...current, record];

  const result = await persistSavedVaults(supabase, user, nextList);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const vault: VaultListItem = savedVaultToListItem(record);
  return NextResponse.json({ vault });
}
