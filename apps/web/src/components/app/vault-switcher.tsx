"use client";

import { Menu } from "@base-ui/react/menu";
import {
  Check,
  ChevronsUpDown,
  HelpCircle,
  Library,
  Loader2,
  MoreVertical,
  Plus,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

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
  if (vaults.length === 0) {
    return (
      <div className="flex shrink-0 items-center gap-1 border-t border-border bg-sidebar/50 px-1.5 py-1.5">
        <Link
          href="/vaults/new"
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-left text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">Criar cofre</span>
        </Link>
        <button
          type="button"
          onClick={onOpenManageVaults}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Gerenciar cofres"
          aria-label="Gerenciar cofres"
        >
          <Library className="size-4" />
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
  onRemoveVault: (id: string) => void | Promise<void>;
};

function VaultRemoveConfirmDialog({
  open,
  vaultName,
  pathLabel,
  isLastVault,
  isProfileLinkedVault,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  vaultName: string;
  pathLabel: string;
  isLastVault: boolean;
  isProfileLinkedVault: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  if (!open || typeof document === "undefined") return null;

  const describedByParts = ["vault-remove-confirm-desc"];
  if (isLastVault) describedByParts.push("vault-remove-last-vault-hint");
  if (isProfileLinkedVault) describedByParts.push("vault-remove-profile-hint");
  const describedBy = describedByParts.join(" ");

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onCancel}
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        role="alertdialog"
        aria-labelledby="vault-remove-confirm-title"
        aria-describedby={describedBy}
      >
        <h2 id="vault-remove-confirm-title" className="text-base font-semibold text-foreground">
          Remover &quot;{vaultName}&quot; da lista?
        </h2>
        <p id="vault-remove-confirm-desc" className="mt-2 text-sm text-muted-foreground">
          O registro do vault, o repositório correspondente no Gitea e o cache local neste navegador
          serão removidos. Esta ação não pode ser desfeita.
        </p>
        {isProfileLinkedVault ? (
          <p
            id="vault-remove-profile-hint"
            className="mt-2 text-sm text-amber-800 dark:text-amber-200/90"
          >
            Este cofre está ligado ao agente no seu perfil. Ao remover, a conexão SSH/gateway
            guardada será apagada e será preciso configurar de novo no dashboard se quiser voltar a
            usar o agente.
          </p>
        ) : null}
        {pathLabel ? (
          <p className="mt-2 truncate rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
            {pathLabel}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-muted/80 dark:text-red-400"
            onClick={onConfirm}
          >
            Remover
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function VaultManageDialog({
  open,
  onClose,
  vaults,
  activeId,
  onSelectVault,
  onRemoveVault,
}: VaultManageDialogProps) {
  const [removeConfirmVault, setRemoveConfirmVault] = useState<VaultMeta | null>(null);
  const [deletingVaultId, setDeletingVaultId] = useState<string | null>(null);

  const removeBusy = deletingVaultId !== null;

  useEffect(() => {
    if (!open) {
      setRemoveConfirmVault(null);
      setDeletingVaultId(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4" role="presentation">
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Fechar"
          onClick={() => {
            if (removeBusy) return;
            onClose();
          }}
        />
        <div
          className="relative flex max-h-[min(520px,85vh)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          role="dialog"
          aria-labelledby="vault-manage-title"
          aria-busy={removeBusy}
        >
          <div className="border-b border-border px-4 py-3">
            <h2 id="vault-manage-title" className="text-sm font-semibold text-foreground">
              Gerenciar cofres
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Adicione um cofre novo ou exclua um cofre da lista. Ao excluir, os dados locais deste
              navegador desse cofre serão apagados.
            </p>
          </div>
          <ul className="flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
            {vaults.length === 0 ? (
              <li className="px-2 py-8 text-center text-sm text-muted-foreground">
                Nenhum cofre ainda. Use o botão abaixo para criar o primeiro.
              </li>
            ) : null}
            {vaults.map((v) => {
              const isDeleting = deletingVaultId === v.id;
              return (
                <li
                  key={v.id}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border border-transparent px-2 py-2 hover:bg-muted/50",
                    isDeleting && "bg-muted/40"
                  )}
                  aria-busy={isDeleting}
                >
                  <button
                    type="button"
                    disabled={removeBusy}
                    className={cn(
                      "min-w-0 flex-1 text-left",
                      removeBusy && "cursor-not-allowed opacity-60"
                    )}
                    onClick={() => {
                      if (removeBusy) return;
                      onSelectVault(v.id);
                      onClose();
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {isDeleting ? (
                          <Loader2
                            className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                            aria-hidden
                          />
                        ) : null}
                        <span className="text-sm font-medium text-foreground">{v.name}</span>
                        {v.id === activeId && !isDeleting ? (
                          <Check className="size-3.5 shrink-0 text-primary" aria-label="Cofre ativo" />
                        ) : null}
                      </div>
                      {isDeleting ? (
                        <span className="text-xs text-muted-foreground">A remover…</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {v.pathLabel}
                    </p>
                  </button>
                  <VaultRowRemoveMenu
                    vaultName={v.name}
                    interactionsLocked={removeBusy}
                    onRequestRemove={() => setRemoveConfirmVault(v)}
                  />
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/vaults/new"
              onClick={(e) => {
                if (removeBusy) {
                  e.preventDefault();
                  return;
                }
                onClose();
              }}
              className={cn(
                "inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto",
                removeBusy && "pointer-events-none opacity-50"
              )}
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              Adicionar vault
            </Link>
            <button
              type="button"
              disabled={removeBusy}
              className="w-full rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 sm:w-auto sm:px-4"
              onClick={onClose}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      <VaultRemoveConfirmDialog
        open={removeConfirmVault !== null}
        vaultName={removeConfirmVault?.name ?? ""}
        pathLabel={removeConfirmVault?.pathLabel ?? ""}
        isLastVault={vaults.length === 1}
        isProfileLinkedVault={removeConfirmVault?.managedByProfile === true}
        onCancel={() => setRemoveConfirmVault(null)}
        onConfirm={async () => {
          const meta = removeConfirmVault;
          if (!meta) return;
          setRemoveConfirmVault(null);
          setDeletingVaultId(meta.id);
          try {
            await Promise.resolve(onRemoveVault(meta.id));
          } finally {
            setDeletingVaultId(null);
          }
        }}
      />
    </>
  );
}

function VaultRowRemoveMenu({
  vaultName,
  interactionsLocked,
  onRequestRemove,
}: {
  vaultName: string;
  interactionsLocked: boolean;
  onRequestRemove: () => void;
}) {
  const onRemoveClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      window.setTimeout(() => {
        onRequestRemove();
      }, 0);
    },
    [onRequestRemove]
  );

  return (
    <Menu.Root modal={false} disabled={interactionsLocked}>
      <Menu.Trigger
        className={cn(
          "flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground data-popup-open:bg-muted",
          interactionsLocked && "pointer-events-none opacity-40"
        )}
        aria-label={`Opções do cofre ${vaultName}`}
      >
        <MoreVertical className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[420] outline-none" side="bottom" align="end" sideOffset={4}>
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
              onClick={onRemoveClick}
            >
              Remover da lista…
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
