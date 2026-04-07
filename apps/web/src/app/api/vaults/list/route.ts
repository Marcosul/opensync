import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import {
  deriveVaultExplorerKind,
  deriveVaultName,
  formatAgentPreview,
} from "@/lib/vault-display";
import type { VaultListItem } from "@/lib/vault-list-types";
import { mergeSavedVaultsFromSources, savedVaultToListItem } from "@/lib/saved-vaults";

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
    .select("agent_connection, saved_vaults")
    .eq("id", user.id)
    .maybeSingle();

  const savedRecords = mergeSavedVaultsFromSources(
    profile?.saved_vaults,
    user.user_metadata?.opensync_saved_vaults,
  );
  const emptyVaults: VaultListItem[] = savedRecords
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(savedVaultToListItem);

  const raw =
    profile?.agent_connection ?? user.user_metadata?.opensync_agent_connection;

  const vaults: VaultListItem[] = [...emptyVaults];

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
