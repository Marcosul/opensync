import type { User } from "@supabase/supabase-js";

import { backendRequest, type BackendVault } from "@/app/api/_lib/backend-api";
import {
  deriveVaultExplorerKind,
  deriveVaultName,
  formatAgentPreview,
} from "@/lib/vault-display";
import type { VaultListItem } from "@/lib/vault-list-types";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

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

  const vaults: VaultListItem[] = backendVaults.map((v) => ({
    id: v.id,
    name: v.name,
    pathLabel: v.giteaRepo,
    kind: "blank" as const,
    managedByProfile: false,
    deletable: true,
  }));

  if (raw != null && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    vaults.push({
      id: `profile-${user.id}`,
      name: deriveVaultName(o),
      pathLabel: formatAgentPreview(o),
      kind: deriveVaultExplorerKind(o),
      managedByProfile: true,
      deletable: false,
    });
  }

  return { items: vaults, agentConnectionRaw: raw ?? null };
}
