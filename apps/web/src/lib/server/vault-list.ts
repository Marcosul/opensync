import type { User } from "@supabase/supabase-js";

import { backendRequest, type BackendVault } from "@/app/api/_lib/backend-api";
import {
  deriveVaultExplorerKind,
  deriveVaultName,
  formatAgentPreview,
} from "@/lib/vault-display";
import type { VaultListItem } from "@/lib/vault-list-types";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { isBackendSyncVaultId } from "@/lib/vault-sync-flatten";

export type VaultListResult = {
  items: VaultListItem[];
  /** Objeto `agent_connection` bruto (para `deriveAgentMode` no dashboard). */
  agentConnectionRaw: unknown | null;
};

/**
 * Monta a lista de vaults no mesmo servidor (sem HTTP interno).
 * Evita `fetch("/api/...")` em RSC — no Node isso quebra por URL relativa.
 */
export async function fetchVaultListForUser(user: User): Promise<VaultListResult> {
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("agent_connection")
    .eq("id", user.id)
    .maybeSingle();

  const raw =
    profile?.agent_connection ?? user.user_metadata?.opensync_agent_connection;

  let backendVaults: BackendVault[] = [];
  try {
    const backend = await backendRequest<{ vaults: BackendVault[] }>("/vaults", user);
    backendVaults = backend.vaults;
  } catch (err) {
    console.error(
      "\x1b[33m⚠️ [vault-list]\x1b[0m \x1b[31mBackend falhou — seguindo só com dados locais\x1b[0m",
      err instanceof Error ? err.message : err,
    );
  }

  const o =
    raw != null && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const linkedRaw = o?.backendVaultId ?? o?.backend_vault_id;
  const linkedStr = typeof linkedRaw === "string" ? linkedRaw.trim() : "";
  const linkedBackendId = linkedStr && isBackendSyncVaultId(linkedStr) ? linkedStr : null;
  const linkedRow = linkedBackendId
    ? backendVaults.find((v) => v.id === linkedBackendId)
    : undefined;

  const backendForList = linkedBackendId
    ? backendVaults.filter((v) => v.id !== linkedBackendId)
    : backendVaults;

  const vaults: VaultListItem[] = backendForList.map((v) => ({
    id: v.id,
    name: v.name,
    pathLabel: v.giteaRepo,
    kind: "blank" as const,
    managedByProfile: false,
    deletable: true,
    remoteSync: "git" as const,
  }));

  if (o) {
    const mode = o.mode;
    const remoteSync =
      mode === "ssh_key" || mode === "ssh_password" ? ("ssh" as const) : undefined;
    vaults.push({
      id: linkedBackendId ?? `profile-${user.id}`,
      name: deriveVaultName(o),
      pathLabel: linkedRow?.giteaRepo ?? formatAgentPreview(o),
      kind: deriveVaultExplorerKind(o),
      managedByProfile: true,
      deletable: false,
      ...(remoteSync ? { remoteSync } : {}),
    });
  }

  return { items: vaults, agentConnectionRaw: raw ?? null };
}
