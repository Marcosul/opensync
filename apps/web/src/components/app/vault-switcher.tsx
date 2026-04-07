"use client";

import { Menu } from "@base-ui/react/menu";
import {
  Check,
  ChevronsUpDown,
  HelpCircle,
  Library,
  MoreVertical,
  Plus,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

import type { VaultMeta } from "@/components/app/vault-persistence";
import { cn } from "@/lib/utils";

const menuItemClass = cn(
  "flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
  "text-foreground data-highlighted:bg-muted"
);

type VaultSidebarFooterProps = {
  vaults: VaultMeta[];
  activeId: string;
  activeName: string;
  pathTooltip: string;
  statsLine: string;
  onSelectVault: (id: string) => void;
  onOpenManageVaults: () => void;
};

export function VaultSidebarFooter({
  vaults,
  activeId,
  activeName,
  pathTooltip,
  statsLine,
  onSelectVault,
  onOpenManageVaults,
}: VaultSidebarFooterProps) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-t border-border bg-sidebar/50 px-1.5 py-1.5">
      <Menu.Root>
        <Menu.Trigger
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-left text-xs font-medium text-foreground",
            "outline-none hover:bg-muted data-popup-open:bg-muted"
          )}
          title={`${pathTooltip}\n${statsLine}`}
        >
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="min-w-0 truncate">{activeName}</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-[220] outline-none" side="top" align="start" sideOffset={6}>
            <Menu.Popup
              className={cn(
                "min-w-[220px] origin-[var(--transform-origin)] rounded-lg border border-border bg-card py-1 text-foreground shadow-lg",
                "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
              )}
            >
              {vaults.map((v) => (
                <Menu.Item
                  key={v.id}
                  className={cn(menuItemClass, "justify-between pr-2")}
                  onClick={() => onSelectVault(v.id)}
                >
                  <span className="min-w-0 truncate">{v.name}</span>
                  {v.id === activeId ? (
                    <Check className="size-3.5 shrink-0 opacity-80" aria-hidden />
                  ) : (
                    <span className="size-3.5 shrink-0" aria-hidden />
                  )}
                </Menu.Item>
              ))}
              <Menu.Separator className="my-1 h-px bg-border" />
              <Menu.Item className={menuItemClass} onClick={onOpenManageVaults}>
                <Library className="size-3.5 text-muted-foreground" aria-hidden />
                Gerenciar cofres…
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <button
        type="button"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Ajuda"
        aria-label="Ajuda"
      >
        <HelpCircle className="size-4" />
      </button>
      <Link
        href="/settings"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Configurações"
        aria-label="Configurações"
      >
        <Settings className="size-4" />
      </Link>
    </div>
  );
}

type VaultManageDialogProps = {
  open: boolean;
  onClose: () => void;
  vaults: VaultMeta[];
  activeId: string;
  onSelectVault: (id: string) => void;
  onRemoveVault: (id: string) => void;
};

export function VaultManageDialog({
  open,
  onClose,
  vaults,
  activeId,
  onSelectVault,
  onRemoveVault,
}: VaultManageDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(520px,85vh)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        role="dialog"
        aria-labelledby="vault-manage-title"
      >
        <div className="border-b border-border px-4 py-3">
          <h2 id="vault-manage-title" className="text-sm font-semibold text-foreground">
            Gerenciar cofres
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Adicione um cofre novo ou remova da lista. Ao remover, os dados locais deste navegador
            desse cofre serão apagados.
          </p>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
          {vaults.map((v) => (
            <li
              key={v.id}
              className="flex items-center gap-1 rounded-lg border border-transparent px-2 py-2 hover:bg-muted/50"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  onSelectVault(v.id);
                  onClose();
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{v.name}</span>
                  {v.id === activeId && (
                    <Check className="size-3.5 shrink-0 text-primary" aria-label="Cofre ativo" />
                  )}
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {v.pathLabel}
                </p>
              </button>
              <VaultRowRemoveMenu
                vaultName={v.name}
                canRemove={vaults.length > 1 && v.deletable !== false}
                onRemove={() => onRemoveVault(v.id)}
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/dashboard/vaults/new"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            Adicionar vault
          </Link>
          <button
            type="button"
            className="w-full rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-auto sm:px-4"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function VaultRowRemoveMenu({
  vaultName,
  canRemove,
  onRemove,
}: {
  vaultName: string;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const tryRemove = useCallback(() => {
    if (!canRemove) {
      window.alert("É preciso manter pelo menos um cofre na lista.");
      return;
    }
    if (
      !window.confirm(
        `Remover "${vaultName}" da lista?\n\nO histórico deste cofre neste navegador será apagado.`
      )
    ) {
      return;
    }
    onRemove();
  }, [canRemove, vaultName, onRemove]);

  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground data-popup-open:bg-muted"
        aria-label={`Opções do cofre ${vaultName}`}
      >
        <MoreVertical className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[310] outline-none" side="bottom" align="end" sideOffset={4}>
          <Menu.Popup
            className={cn(
              "min-w-[180px] origin-[var(--transform-origin)] rounded-lg border border-border bg-card py-1 shadow-lg",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
            )}
          >
            <Menu.Item
              className={cn(
                menuItemClass,
                "text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
              )}
              disabled={!canRemove}
              onClick={tryRemove}
            >
              Remover da lista…
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
