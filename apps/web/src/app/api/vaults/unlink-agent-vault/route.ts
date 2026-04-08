import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { isBackendSyncVaultId } from "@/lib/vault-sync-flatten";

type Body = { vaultId?: unknown };

/**
 * Remove o vault do Nest (e Gitea) quando for o cofre ligado ao agente no perfil,
 * e limpa `agent_connection` para o explorador não voltar a listar esse cofre.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  let vaultId: string;
  try {
    const body = (await request.json()) as Body;
    vaultId = typeof body.vaultId === "string" ? body.vaultId.trim() : "";
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  if (!vaultId) {
    return NextResponse.json({ error: "Informe vaultId" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("agent_connection")
    .eq("id", user.id)
    .maybeSingle();

  const raw =
    profile?.agent_connection ?? user.user_metadata?.opensync_agent_connection;

  const syntheticRowId = `profile-${user.id}`;

  if (raw == null || typeof raw !== "object") {
    if (isBackendSyncVaultId(vaultId)) {
      try {
        await backendRequest(`/vaults/${encodeURIComponent(vaultId)}`, user, {
          method: "DELETE",
        });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Falha no backend" },
          { status: 502 },
        );
      }
    }
    return NextResponse.json({ ok: true, mode: "no_agent_connection" });
  }

  const o = raw as Record<string, unknown>;
  const linkedRaw = o?.backendVaultId ?? o?.backend_vault_id;
  const linkedBackendId =
    typeof linkedRaw === "string" && isBackendSyncVaultId(linkedRaw) ? linkedRaw.trim() : null;

  const matchesRow =
    vaultId === syntheticRowId ||
    (linkedBackendId !== null && vaultId === linkedBackendId);

  if (!matchesRow) {
    return NextResponse.json(
      { error: "Este cofre nao corresponde a conexao do agente no perfil." },
      { status: 403 },
    );
  }

  const nestIdToDelete = isBackendSyncVaultId(vaultId) ? vaultId : linkedBackendId;

  if (nestIdToDelete) {
    try {
      await backendRequest(`/vaults/${encodeURIComponent(nestIdToDelete)}`, user, {
        method: "DELETE",
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Falha ao remover vault no servidor" },
        { status: 502 },
      );
    }
  }

  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({ agent_connection: null })
    .eq("id", user.id);

  if (profileUpdateError) {
    console.error(
      "\x1b[33m⚠️ [unlink-agent-vault]\x1b[0m profiles.agent_connection:",
      profileUpdateError.message,
    );
  }

  const { error: metaErr } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      opensync_agent_connection: null,
    },
  });

  if (metaErr) {
    return NextResponse.json(
      { error: `Nao foi possivel limpar a conexao na sessao: ${metaErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
