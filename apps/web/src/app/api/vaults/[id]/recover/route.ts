import { NextResponse } from "next/server";

import { backendRequest } from "@/app/api/_lib/backend-api";
import type { AgentConnectionStored } from "@/lib/onboarding-agent";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { sshPullAuthFromStored } from "@/lib/server/agent-ssh-pull-params";
import { mapSshKeyOrConnectionError } from "@/lib/server/ssh-error-message";
import { pullTextFilesFromSshServer } from "@/lib/server/ssh-workspace-pull";
import { isBackendSyncVaultId } from "@/lib/vault-sync-flatten";

type RecoverResponse = {
  ok: true;
  importedFiles: number;
  commitHash?: string;
};

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const vaultId = id?.trim();
  if (!vaultId || !isBackendSyncVaultId(vaultId)) {
    return NextResponse.json({ error: "Vault id invalido" }, { status: 400 });
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
    .select("agent_connection")
    .eq("id", user.id)
    .maybeSingle();

  const raw =
    profile?.agent_connection ?? user.user_metadata?.opensync_agent_connection;
  if (raw == null || typeof raw !== "object") {
    return NextResponse.json(
      { error: "Conexao SSH do agente nao encontrada no perfil." },
      { status: 400 },
    );
  }

  const stored = raw as AgentConnectionStored;
  const linkedId =
    typeof stored.backendVaultId === "string"
      ? stored.backendVaultId.trim()
      : null;
  if (!linkedId || linkedId !== vaultId) {
    return NextResponse.json(
      {
        error:
          "Este vault nao corresponde ao backendVaultId da conexao do agente.",
      },
      { status: 403 },
    );
  }

  const auth = sshPullAuthFromStored(stored);
  if (!auth) {
    return NextResponse.json(
      { error: "Conexao do agente invalida para recuperacao via SSH." },
      { status: 400 },
    );
  }

  try {
    const pulled = await pullTextFilesFromSshServer(auth);
    const filesCount = Object.keys(pulled.files).length;
    if (filesCount === 0) {
      return NextResponse.json(
        { error: "Nenhum ficheiro de texto encontrado no caminho remoto." },
        { status: 400 },
      );
    }
    const sync = await backendRequest<{ ok: boolean; commitHash: string }>(
      `/vaults/${encodeURIComponent(vaultId)}/sync`,
      user,
      { method: "POST", body: { files: pulled.files } },
    );
    return NextResponse.json<RecoverResponse>({
      ok: true,
      importedFiles: filesCount,
      commitHash: sync.commitHash,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? mapSshKeyOrConnectionError(error.message)
        : "Falha na recuperacao do conteudo remoto.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
