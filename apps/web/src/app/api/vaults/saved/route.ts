import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  mergeSavedVaultsFromSources,
  type SavedVaultRecord,
} from "@/lib/saved-vaults";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

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
    const metaErr = await saveVaultsToUserMetadata(supabase, user, nextList);
    return metaErr ? { ok: false, error: metaErr } : { ok: true };
  }

  return { ok: true };
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Informe o id do vault" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
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
  const target = current.find((v) => v.id === id);
  if (!target) {
    return NextResponse.json({ error: "Vault nao encontrado" }, { status: 404 });
  }
  if (target.kind !== "empty") {
    return NextResponse.json({ error: "Operacao nao permitida" }, { status: 400 });
  }

  const nextList = current.filter((v) => v.id !== id);
  const result = await persistSavedVaults(supabase, user, nextList);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
