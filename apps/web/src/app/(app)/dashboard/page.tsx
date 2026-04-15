import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";

import { PendingInvitesBanner } from "@/components/app/pending-invites-banner";
import { DashboardVaultGrid } from "@/components/dashboard/dashboard-vault-grid";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { fetchVaultListForUser } from "@/lib/server/vault-list";
import { deriveAgentMode, deriveVaultName, formatAgentPreview } from "@/lib/vault-display";
import type { VaultListItem } from "@/lib/vault-list-types";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { items: listItems, agentConnectionRaw: agentRaw } = user
    ? await fetchVaultListForUser(user)
    : { items: [] as VaultListItem[], agentConnectionRaw: null };

  const hasAgent = agentRaw != null && typeof agentRaw === "object";
  const savedVaultItems = listItems
    .filter((v) => !v.managedByProfile)
    .map((s) => ({
      id: s.id,
      workspaceId: s.workspaceId,
      name: s.name,
      description: s.pathLabel,
      connected: false,
      agentMode: "empty",
      isEmpty: true,
      fileCount: 0,
      gitSetupLink: true,
    }));

  const agentVaultItems =
    hasAgent && user
      ? [
          {
            id: `profile-${user.id}`,
            workspaceId: undefined as string | undefined,
            name: deriveVaultName(agentRaw as Record<string, unknown>),
            description: formatAgentPreview(agentRaw as Record<string, unknown>),
            connected: true,
            agentMode: deriveAgentMode(agentRaw as Record<string, unknown>),
            fileCount: 11,
            isEmpty: false,
            managedByProfile: true,
          },
        ]
      : [];

  const vaults = [...savedVaultItems, ...agentVaultItems];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center border-b border-border bg-card/30 px-4">
        <span className="text-sm font-medium text-foreground/80">Vaults</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <PendingInvitesBanner />
        {vaults.length === 0 ? (
          <EmptyVaults />
        ) : (
          <DashboardVaultGrid vaults={vaults} />
        )}
      </div>
    </div>
  );
}

function EmptyVaults() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
        <FolderOpen className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground">Nenhum vault conectado</p>
        <p className="text-sm text-muted-foreground">
          Crie um vault vazio ou conecte um agente para ver seus cofres aqui.
        </p>
      </div>
      <Link
        href="/vaults/new"
        className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="size-4" />
        Novo Vault
      </Link>
    </div>
  );
}
