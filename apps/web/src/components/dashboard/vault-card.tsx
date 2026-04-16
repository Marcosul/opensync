"use client";

import { Menu } from "@base-ui/react/menu";
import { Cpu, FolderOpen, MoreVertical, Share2, Trash2, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { apiRequest } from "@/api/rest/generic";
import { isBackendSyncVaultId } from "@/lib/vault-sync-flatten";
import { cn } from "@/lib/utils";

import { VaultDeleteConfirmDialog } from "./vault-delete-confirm-dialog";
import { VaultPublishDialog } from "./vault-publish-dialog";

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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishUrl, setPublishUrl] = useState("");

  const explorerHref = `/vault?vaultId=${encodeURIComponent(vault.id)}`;
  const syncHref = vault.gitSetupLink
    ? `/dashboard/vaults/${encodeURIComponent(vault.id)}/git`
    : "/settings";

  const canPublishOrDeleteRemote =
    isBackendSyncVaultId(vault.id) && !vault.managedByProfile;

  const runDelete = useCallback(async () => {
    setDeleteBusy(true);
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
        setDeleteOpen(false);
        window.alert("Este cofre não pode ser removido a partir do painel.");
        return;
      }
      setDeleteOpen(false);
      router.refresh();
    } catch {
      window.alert("Não foi possível remover este cofre. Tente novamente.");
    } finally {
      setDeleteBusy(false);
    }
  }, [router, vault.id, vault.managedByProfile]);

  const requestDelete = () => {
    setDeleteOpen(true);
  };

  const handlePublish = useCallback(async () => {
    if (!canPublishOrDeleteRemote) {
      window.alert("Apenas cofres guardados no servidor podem ser publicados.");
      return;
    }
    setPublishBusy(true);
    try {
      const res = await apiRequest<{ token: string; publicPath: string }>(
        `/api/vaults/${encodeURIComponent(vault.id)}/public-share`,
        { method: "POST" },
      );
      const path = res.publicPath?.trim() || `/public/vault/${encodeURIComponent(res.token)}`;
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setPublishUrl(origin ? `${origin}${path.startsWith("/") ? path : `/${path}`}` : path);
      setPublishOpen(true);
    } catch {
      window.alert("Não foi possível gerar o link público. Tente novamente.");
    } finally {
      setPublishBusy(false);
    }
  }, [canPublishOrDeleteRemote, vault.id]);

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
                    {canPublishOrDeleteRemote ? (
                      <Menu.Item
                        className={menuItemClass}
                        onClick={() => void handlePublish()}
                        disabled={publishBusy}
                      >
                        <Share2 className="size-3.5 shrink-0" aria-hidden />
                        {publishBusy ? "A gerar…" : "Publicar vault"}
                      </Menu.Item>
                    ) : null}
                    <Menu.Item
                      className={cn(menuItemClass, "text-destructive data-highlighted:bg-destructive/10")}
                      onClick={requestDelete}
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

      <VaultDeleteConfirmDialog
        open={deleteOpen}
        vaultName={vault.name}
        busy={deleteBusy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={runDelete}
      />
      <VaultPublishDialog
        open={publishOpen}
        vaultName={vault.name}
        publicUrl={publishUrl}
        onClose={() => setPublishOpen(false)}
      />
    </div>
  );
}
