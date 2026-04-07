import { Cpu, FolderOpen, Plus, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";

import { AddVaultCard } from "@/components/dashboard/add-vault-card";
import { apiRequest } from "@/api/rest/generic";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { deriveAgentMode, deriveVaultName, formatAgentPreview } from "@/lib/vault-display";
import type { VaultListItem } from "@/lib/vault-list-types";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("agent_connection, onboarding_completed_at")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const agentRaw =
    profile?.agent_connection ?? user?.user_metadata?.opensync_agent_connection;
  const hasAgent = agentRaw != null && typeof agentRaw === "object";

  const backendVaults = user
    ? await apiRequest<{ vaults: VaultListItem[] }>("/api/vaults/list")
    : { vaults: [] as VaultListItem[] };
  const savedVaultItems: VaultItem[] = backendVaults.vaults
    .filter((v) => !v.managedByProfile)
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.pathLabel,
      connected: false,
      agentMode: "empty",
      isEmpty: true,
      fileCount: 0,
    }));

  const agentVaultItems: VaultItem[] =
    hasAgent && user
      ? [
          {
            id: `profile-${user.id}`,
            name: deriveVaultName(agentRaw as Record<string, unknown>),
            description: formatAgentPreview(agentRaw as Record<string, unknown>),
            connected: true,
            agentMode: deriveAgentMode(agentRaw as Record<string, unknown>),
            fileCount: 11,
            isEmpty: false,
          },
        ]
      : [];

  const vaults: VaultItem[] = [...savedVaultItems, ...agentVaultItems];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex h-10 shrink-0 items-center border-b border-border bg-card/30 px-4">
        <span className="text-sm font-medium text-foreground/80">Vaults</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {vaults.length === 0 ? (
          <EmptyVaults />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vaults.map((v) => (
              <VaultCard key={v.id} vault={v} />
            ))}
            <AddVaultCard />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

type VaultItem = {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  agentMode: string;
  fileCount: number;
  isEmpty?: boolean;
};

// ─── Components ─────────────────────────────────────────────────────────────

function VaultCard({ vault }: { vault: VaultItem }) {
  return (
    <Link
      href={`/vault?vault=${encodeURIComponent(vault.id)}`}
      className="group relative z-0 flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/50">
            <FolderOpen className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-sm text-foreground">{vault.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {vault.isEmpty ? "Sem agente" : `${vault.fileCount} arquivos`}
            </p>
          </div>
        </div>

        {/* Connection badge */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            vault.connected
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          {vault.connected ? (
            <Wifi className="size-3" />
          ) : (
            <WifiOff className="size-3" />
          )}
          {vault.connected ? "Conectado" : "Offline"}
        </div>
      </div>

      {/* Agent / detalhe */}
      <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
        {vault.isEmpty ? (
          <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <p className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {vault.description}
        </p>
      </div>
    </Link>
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
        href="/dashboard/vaults/new"
        className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="size-4" />
        Novo Vault
      </Link>
    </div>
  );
}

