"use client";

import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { AddVaultCard } from "@/components/dashboard/add-vault-card";
import { VaultCard } from "@/components/dashboard/vault-card";
import { useWorkspaceContext } from "@/components/app/workspace-context";

export type DashboardVaultItem = {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  agentMode: string;
  fileCount: number;
  isEmpty?: boolean;
  gitSetupLink?: boolean;
  managedByProfile?: boolean;
  workspaceId?: string;
};

type Props = {
  vaults: DashboardVaultItem[];
};

export function DashboardVaultGrid({ vaults }: Props) {
  const { activeId, loaded } = useWorkspaceContext();

  const filtered = useMemo(() => {
    if (!loaded || !activeId) return vaults;
    return vaults.filter((v) => {
      if (v.managedByProfile) return true;
      if (!v.workspaceId) return true;
      return v.workspaceId === activeId;
    });
  }, [vaults, activeId, loaded]);

  if (filtered.length === 0) {
    return <EmptyVaults />;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
      {filtered.map((v) => (
        <VaultCard key={v.id} vault={v} />
      ))}
      <AddVaultCard />
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
        <p className="font-medium text-foreground">Nenhum vault neste workspace</p>
        <p className="text-sm text-muted-foreground">
          Troque de workspace no painel ou crie um novo vault.
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
