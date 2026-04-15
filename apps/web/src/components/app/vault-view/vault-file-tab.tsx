"use client";

import { ContextMenu } from "@base-ui/react/context-menu";
import { ListX, Pencil, X } from "lucide-react";
import type { ReactNode } from "react";

import { VaultExplorerFileIcon } from "@/components/app/vault-explorer-file-icon";
import { cn } from "@/lib/utils";

const menuItemClass = cn(
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
  "text-foreground data-highlighted:bg-muted",
);

function MenuIcon({ children }: { children: ReactNode }) {
  return <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">{children}</span>;
}

/** Aba de ficheiro com botão fechar e menu de contexto (renomear, fechar, fechar todos). */
export function FileTab({
  fileId,
  active,
  onSelect,
  onClose,
  onRename,
  onCloseAllTabs,
}: {
  fileId: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: () => void;
  onCloseAllTabs: () => void;
}) {
  const shortName = fileId.includes("/") ? fileId.split("/").pop() ?? fileId : fileId;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        className={cn(
          "flex max-w-[min(200px,40vw)] shrink-0 items-stretch rounded-md border font-mono text-xs outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-primary/40",
          active
            ? "border-sidebar-border/60 bg-sidebar-accent text-sidebar-accent-foreground"
            : "border-transparent bg-transparent text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate px-2 py-1 text-left"
          title={fileId}
        >
          <VaultExplorerFileIcon fileName={shortName} active={active} size={13} className="shrink-0" />
          <span className="min-w-0 truncate">{shortName}</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="flex shrink-0 items-center justify-center rounded-r-md px-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          aria-label={`Fechar ${fileId}`}
        >
          <X className="size-3.5" />
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-[210] outline-none" sideOffset={4} alignOffset={-4}>
          <ContextMenu.Popup
            className={cn(
              "min-w-[200px] origin-[var(--transform-origin)] rounded-lg border border-border bg-card py-1 text-foreground shadow-lg",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            <ContextMenu.Item className={menuItemClass} onClick={onRename}>
              <MenuIcon>
                <Pencil className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Renomear
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onClick={onClose}>
              <MenuIcon>
                <X className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Fechar
            </ContextMenu.Item>
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <ContextMenu.Item className={menuItemClass} onClick={onCloseAllTabs}>
              <MenuIcon>
                <ListX className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Fechar todos
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
