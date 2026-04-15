"use client";

import { Menu } from "@base-ui/react/menu";
import { Cpu, FolderOpen, MoreVertical, Trash2, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiRequest } from "@/api/rest/generic";
import { isBackendSyncVaultId } from "@/lib/vault-sync-flatten";
import { cn } from "@/lib/utils";

export type DashboardVaultCardVault = {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  agentMode: string;
  fileCount: number;
  isEmpty?: boolean;
  gitSetupLink?: boolean;
  /** Cofre sintético ligado ao agente no perfil (`profile-…`). */
  managedByProfile?: boolean;
};

const menuItemClass = cn(
  "flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
  "text-foreground data-highlighted:bg-muted",
);

const menuPopupClass = cn(
  "min-w-[200px] origin-[var(--transform-origin)] rounded-lg border border-border bg-card py-1 text-foreground shadow-lg",
  "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
);

export function VaultCard({ vault }: { vault: DashboardVaultCardVault }) {
  const router = useRouter();
  const explorerHref = `/vault?vaultId=${encodeURIComponent(vault.id)}`;
  const syncHref = vault.gitSetupLink
    ? `/dashboard/vaults/${encodeURIComponent(vault.id)}/git`
    : "/settings";

  const handleDelete = async () => {
    const ok = window.confirm(
      `Remover o cofre «${vault.name}»? Esta ação não pode ser anulada.`,
    );
    if (!ok) return;

    try {
      if (vault.managedByProfile) {
        await apiRequest<{ ok: boolean }>("/api/vaults/unlink-agent-vault", {
          method: "POST",
          body: { vaultId: vault.id },
        });
      } else if (isBackendSyncVaultId(vault.id)) {
        await apiRequest(`/api/vaults/saved?id=${encodeURIComponent(vault.id)}`, {
          method: "DELETE",
        });
      } else {
        window.alert("Este cofre não pode ser removido a partir do painel.");
        return;
      }
      router.refresh();
    } catch {
      window.alert("Não foi possível remover este cofre. Tente novamente.");
    }
  };

  const openSync = () => {
    router.push(syncHref);
  };

  return (
    <div
      className={cn(
        "group flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all",
        "hover:border-primary/40 hover:shadow-md",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={explorerHref}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg outline-none ring-offset-background",
              "focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label={`Abrir explorador do cofre ${vault.name}`}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
              <FolderOpen
                className="size-4 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-sm text-foreground">{vault.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {vault.isEmpty ? "Sem agente" : `${vault.fileCount} arquivos`}
              </p>
            </div>
          </Link>

          <div className="flex shrink-0 items-start gap-1">
            <div
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                vault.connected
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {vault.connected ? (
                <Wifi className="size-3" aria-hidden />
              ) : (
                <WifiOff className="size-3" aria-hidden />
              )}
              {vault.connected ? "Conectado" : "Offline"}
            </div>

            <Menu.Root modal={false}>
              <Menu.Trigger
                type="button"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none",
                  "hover:bg-muted hover:text-foreground data-popup-open:bg-muted",
                )}
                aria-label={`Ações do cofre ${vault.name}`}
              >
                <MoreVertical className="size-4" aria-hidden />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner className="z-[120] outline-none" side="bottom" align="end" sideOffset={4}>
                  <Menu.Popup className={menuPopupClass}>
                    <Menu.Item className={menuItemClass} onClick={openSync}>
                      Instruções de sincronização
                    </Menu.Item>
                    <Menu.Item
                      className={cn(menuItemClass, "text-destructive data-highlighted:bg-destructive/10")}
                      onClick={handleDelete}
                    >
                      <Trash2 className="size-3.5 shrink-0" aria-hidden />
                      Deletar
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </div>

        <Link
          href={explorerHref}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 outline-none ring-offset-background",
            "transition-colors hover:border-border hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={`Abrir explorador: ${vault.description}`}
        >
          {vault.isEmpty ? (
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <Cpu className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <p className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{vault.description}</p>
        </Link>
      </div>
    </div>
  );
}
