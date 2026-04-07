import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  DEFAULT_SSH_REMOTE_PATH,
  toStoredAgentConnection,
  type AgentConnectionPayload,
  type AgentConnectionStored,
} from "@/lib/onboarding-agent";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { backendRequest, type BackendVault } from "@/app/api/_lib/backend-api";
import {
  normalizeStoredRemotePath,
  sshPullAuthFromStored,
} from "@/lib/server/agent-ssh-pull-params";
import { mapSshKeyOrConnectionError } from "@/lib/server/ssh-error-message";
import { mirrorSshProgress } from "@/lib/server/ssh-connect-log";
import { pullTextFilesFromSshServer } from "@/lib/server/ssh-workspace-pull";
import { isBackendSyncVaultId } from "@/lib/vault-sync-flatten";

type ConnectPayload = {
  agentConnection?: AgentConnectionPayload;
  vaultName?: string;
};

type SshConnectSuccessBody = {
  ok: true;
  stored: "profiles" | "user_metadata";
  backendVaultId: string | null;
  /** ID usado no explorador (UUID do Nest ou `profile-<userId>`). */
  snapshotVaultId: string;
  initialFiles: Record<string, string>;
  sshResolvedPath: string | null;
};

function connectSuccessJson(body: SshConnectSuccessBody) {
  return NextResponse.json(body);
}

const VAULT_NAME_MAX = 120;

function normalizeVaultName(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return t.length > VAULT_NAME_MAX ? t.slice(0, VAULT_NAME_MAX) : t;
}

function isBackendConflictError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  if (m.includes('"statusCode":409') || /\b409\b/.test(m)) return true;
  try {
    const j = JSON.parse(m) as { statusCode?: number };
    return j.statusCode === 409;
  } catch {
    return /conflict|já existe|ja existe/i.test(m);
  }
}

async function resolveBackendVaultForConnect(
  user: { id: string; email?: string | null },
  vaultLabel: string,
): Promise<BackendVault | null> {
  try {
    const created = await backendRequest<{ vault: BackendVault }>("/vaults", user, {
      method: "POST",
      body: { name: vaultLabel, path: "./openclaw" },
    });
    return created.vault;
  } catch (err) {
    if (!isBackendConflictError(err) || !vaultLabel.trim()) return null;
    try {
      const listed = await backendRequest<{ vaults: BackendVault[] }>("/vaults", user);
      const want = vaultLabel.trim().toLowerCase();
      const match = listed.vaults.find((v) => v.name.trim().toLowerCase() === want);
      return match ?? null;
    } catch {
      return null;
    }
  }
}

function shouldFallbackToUserMetadata(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("profiles") ||
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    (m.includes("relation") && m.includes("does not exist"))
  );
}

async function persistAfterSshPull(
  supabase: SupabaseClient,
  user: User,
  stored: AgentConnectionStored,
  backendVault: BackendVault | null,
  initialFiles: Record<string, string>,
  sshResolvedPath: string | null,
): Promise<SshConnectSuccessBody> {
  const snapshotVaultId =
    backendVault?.id && isBackendSyncVaultId(backendVault.id)
      ? backendVault.id
      : `profile-${user.id}`;

  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    if (shouldFallbackToUserMetadata(selectError.message)) {
      const metaErr = await saveAgentConnectionToUserMetadata(supabase, user, stored);
      if (metaErr) {
        throw new Error(metaErr);
      }
      return {
        ok: true,
        stored: "user_metadata",
        backendVaultId: backendVault?.id ?? null,
        snapshotVaultId,
        initialFiles,
        sshResolvedPath,
      };
    }
    throw new Error(selectError.message);
  }

  if (existing) {
    const { error } = await supabase
      .from("profiles")
      .update({ agent_connection: stored })
      .eq("id", user.id);

    if (error) {
      if (shouldFallbackToUserMetadata(error.message)) {
        const metaErr = await saveAgentConnectionToUserMetadata(supabase, user, stored);
        if (metaErr) {
          throw new Error(metaErr);
        }
        return {
          ok: true,
          stored: "user_metadata",
          backendVaultId: backendVault?.id ?? null,
          snapshotVaultId,
          initialFiles,
          sshResolvedPath,
        };
      }
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? "",
      onboarding_goals: ["Vault conectado pelo dashboard"],
      onboarding_usage_context: null,
      onboarding_frequency: null,
      onboarding_completed_at: null,
      agent_connection: stored,
    });

    if (error) {
      if (shouldFallbackToUserMetadata(error.message)) {
        const metaErr = await saveAgentConnectionToUserMetadata(supabase, user, stored);
        if (metaErr) {
          throw new Error(metaErr);
        }
        return {
          ok: true,
          stored: "user_metadata",
          backendVaultId: backendVault?.id ?? null,
          snapshotVaultId,
          initialFiles,
          sshResolvedPath,
        };
      }
      throw new Error(error.message);
    }
  }

  return {
    ok: true,
    stored: "profiles",
    backendVaultId: backendVault?.id ?? null,
    snapshotVaultId,
    initialFiles,
    sshResolvedPath,
  };
}

export async function POST(request: Request) {
  const streamMode = new URL(request.url).searchParams.get("stream") === "1";
  const payload = (await request.json()) as ConnectPayload;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  if (!payload.agentConnection) {
    return NextResponse.json({ error: "Informe a conexao do agente" }, { status: 400 });
  }

  if (payload.agentConnection.mode === "gateway") {
    return NextResponse.json(
      { error: "Conexao via gateway foi descontinuada. Use SSH com chave ou com senha." },
      { status: 400 },
    );
  }

  const ac = payload.agentConnection;

  const vaultLabel = normalizeVaultName(payload.vaultName);
  if (!vaultLabel) {
    return NextResponse.json({ error: "Informe o nome do vault" }, { status: 400 });
  }

  const backendVault = await resolveBackendVaultForConnect(user, vaultLabel);

  let stored: AgentConnectionStored = {
    ...toStoredAgentConnection(ac, vaultLabel),
    ...(backendVault?.id && isBackendSyncVaultId(backendVault.id)
      ? { backendVaultId: backendVault.id }
      : {}),
  };

  if (stored.mode === "ssh_key" || stored.mode === "ssh_password") {
    const rp = stored.remotePath?.trim() || DEFAULT_SSH_REMOTE_PATH;
    stored = { ...stored, remotePath: normalizeStoredRemotePath(rp) };
  }

  const auth = sshPullAuthFromStored(stored);
  if (!auth) {
    return NextResponse.json({ error: "Dados SSH invalidos" }, { status: 400 });
  }

  if (streamMode) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };
        const log = mirrorSshProgress((m) => send({ t: "log", m }));
        try {
          const pulled = await pullTextFilesFromSshServer(auth, log, { verboseWire: true });
          log("💾 A gravar conexao no perfil...");
          const body = await persistAfterSshPull(
            supabase,
            user,
            stored,
            backendVault,
            pulled.files,
            pulled.resolvedPath,
          );
          send({ t: "done", body });
        } catch (err) {
          const message =
            err instanceof Error
              ? mapSshKeyOrConnectionError(err.message)
              : "Falha na conexao SSH ou no caminho remoto.";
          send({ t: "error", error: message });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  let initialFiles: Record<string, string>;
  let sshResolvedPath: string | null = null;
  try {
    const log = mirrorSshProgress();
    const pulled = await pullTextFilesFromSshServer(auth, log);
    initialFiles = pulled.files;
    sshResolvedPath = pulled.resolvedPath;
  } catch (err) {
    const message =
      err instanceof Error
        ? mapSshKeyOrConnectionError(err.message)
        : "Falha na conexao SSH ou no caminho remoto.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const body = await persistAfterSshPull(
      supabase,
      user,
      stored,
      backendVault,
      initialFiles,
      sshResolvedPath,
    );
    return connectSuccessJson(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao gravar perfil" },
      { status: 500 },
    );
  }
}

async function saveAgentConnectionToUserMetadata(
  supabase: SupabaseClient,
  user: User,
  agentConnection: AgentConnectionStored,
): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      opensync_agent_connection: agentConnection,
    },
  });
  return error?.message ?? null;
}
