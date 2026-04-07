import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import {
  deriveVaultExplorerKind,
  deriveVaultName,
  formatAgentPreview,
} from "@/lib/vault-display";
import type { VaultListItem } from "@/lib/vault-list-types";
import { backendRequest, type BackendVault } from "@/app/api/_lib/backend-api";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ vaults: [] as VaultListItem[] });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("agent_connection")
    .eq("id", user.id)
    .maybeSingle();

  const raw =
    profile?.agent_connection ?? user.user_metadata?.opensync_agent_connection;

  const backend = await backendRequest<{ vaults: BackendVault[] }>("/vaults", user);
  const vaults: VaultListItem[] = backend.vaults.map((v) => ({
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

  return NextResponse.json({ vaults });
}
