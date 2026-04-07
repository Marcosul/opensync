"use client";

import { ContextMenu } from "@base-ui/react/context-menu";
import {
  Bookmark,
  ChevronRight,
  Clipboard,
  Copy,
  ExternalLink,
  FolderInput,
  FolderPlus,
  FolderSearch,
  LayoutGrid,
  List,
  Pencil,
  SquarePen,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ExplorerContextTarget =
  | { kind: "folder"; treePath: string; name: string }
  | { kind: "file"; docId: string; name: string; parentTreePath: string }
  /** Área vazia do explorador: mesmas ações de criação/busca da pasta listada. */
  | { kind: "pane"; parentTreePath: string; label: string };

export type ExplorerCommand =
  | { type: "new-note"; parentTreePath: string }
  | { type: "new-folder"; parentTreePath: string }
  | { type: "new-canvas"; parentTreePath: string }
  | { type: "new-base"; parentTreePath: string }
  | { type: "duplicate"; docId: string }
  | { type: "move-folder"; treePath: string }
  | { type: "move-file"; docId: string }
  | { type: "search-in-folder"; treePath: string }
  | { type: "bookmark"; target: ExplorerContextTarget }
  | { type: "show-in-folder"; target: ExplorerContextTarget }
  | { type: "rename"; target: ExplorerContextTarget }
  | { type: "delete"; target: ExplorerContextTarget };

function vaultFsPathForDoc(docId: string): string {
  if (docId === "openclaw.json") return "~/.openclaw/openclaw.json";
  return `~/.openclaw/workspace/${docId}`;
}

function vaultFsPathForDir(treePath: string): string {
  if (treePath === "openclaw-root") return "~/.openclaw/";
  const rest = treePath.startsWith("openclaw/") ? treePath.slice("openclaw/".length) : treePath;
  return `~/.openclaw/${rest}/`.replace(/\/+$/, "/");
}

const itemClass = cn(
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
  "text-foreground data-highlighted:bg-muted"
);

const destructiveItemClass = cn(
  itemClass,
  "text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
);

function MenuIcon({
  children,
  destructive,
}: {
  children: ReactNode;
  destructive?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center",
        destructive ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function parentForNewItem(target: ExplorerContextTarget): string {
  if (target.kind === "folder") return target.treePath;
  if (target.kind === "pane") return target.parentTreePath;
  return target.parentTreePath;
}

export function VaultExplorerContextMenu({
  target,
  children,
  onCommand,
}: {
  target: ExplorerContextTarget;
  children: ReactNode;
  onCommand: (cmd: ExplorerCommand) => void;
}) {
  const isPane = target.kind === "pane";
  const isFolder = target.kind === "folder";
  const isFile = target.kind === "file";

  const fullPath =
    target.kind === "file"
      ? vaultFsPathForDoc(target.docId)
      : vaultFsPathForDir(isPane ? target.parentTreePath : target.treePath);
  const fileName =
    target.kind === "file" ? target.name : isPane ? target.label : `${target.name}/`;
  const parentPath = parentForNewItem(target);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        className={cn("outline-none [&:focus-visible]:ring-2 [&:focus-visible]:ring-primary/40", isPane && "h-full min-h-0 w-full")}
        onContextMenu={isPane ? undefined : (e) => e.stopPropagation()}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-[200] outline-none" sideOffset={4} alignOffset={-4}>
          <ContextMenu.Popup
            className={cn(
              "min-w-[248px] origin-[var(--transform-origin)] rounded-lg border border-border bg-card py-1 text-foreground shadow-lg",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
            )}
          >
            <ContextMenu.Item
              className={itemClass}
              onClick={() => onCommand({ type: "new-note", parentTreePath: parentPath })}
            >
              <MenuIcon>
                <SquarePen className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Nova nota
            </ContextMenu.Item>
            <ContextMenu.Item
              className={itemClass}
              onClick={() => onCommand({ type: "new-folder", parentTreePath: parentPath })}
              disabled={isFile}
            >
              <MenuIcon>
                <FolderPlus className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Nova pasta
            </ContextMenu.Item>
            <ContextMenu.Item
              className={itemClass}
              onClick={() => onCommand({ type: "new-canvas", parentTreePath: parentPath })}
            >
              <MenuIcon>
                <LayoutGrid className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Novo canvas
            </ContextMenu.Item>
            <ContextMenu.Item
              className={itemClass}
              onClick={() => onCommand({ type: "new-base", parentTreePath: parentPath })}
            >
              <MenuIcon>
                <List className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Nova base
            </ContextMenu.Item>

            <ContextMenu.Separator className="my-1 h-px bg-border" />

            <ContextMenu.Item
              className={itemClass}
              onClick={() =>
                target.kind === "file" ? onCommand({ type: "duplicate", docId: target.docId }) : undefined
              }
              disabled={!isFile}
            >
              <MenuIcon>
                <Copy className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Fazer uma cópia
            </ContextMenu.Item>
            <ContextMenu.Item
              className={itemClass}
              disabled={isPane}
              onClick={() => {
                if (isPane) return;
                if (isFolder) onCommand({ type: "move-folder", treePath: target.treePath });
                else onCommand({ type: "move-file", docId: target.docId });
              }}
            >
              <MenuIcon>
                <FolderInput className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              {isFolder ? "Mover pasta para…" : "Mover para…"}
            </ContextMenu.Item>
            <ContextMenu.Item
              className={itemClass}
              onClick={() =>
                onCommand({
                  type: "search-in-folder",
                  treePath: isFolder ? target.treePath : target.parentTreePath,
                })
              }
            >
              <MenuIcon>
                <FolderSearch className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              {isFolder || isPane ? "Pesquisa na pasta" : "Buscar no arquivo"}
            </ContextMenu.Item>
            <ContextMenu.Item
              className={itemClass}
              disabled={isPane}
              onClick={() => {
                if (!isPane) onCommand({ type: "bookmark", target });
              }}
            >
              <MenuIcon>
                <Bookmark className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Marcador…
            </ContextMenu.Item>

            <ContextMenu.Separator className="my-1 h-px bg-border" />

            <ContextMenu.SubmenuRoot>
              <ContextMenu.SubmenuTrigger className={cn(itemClass, "justify-between pr-1.5")}>
                <span className="flex items-center gap-2">
                  <MenuIcon>
                    <Clipboard className="size-3.5 stroke-[1.5]" />
                  </MenuIcon>
                  Copiar caminho
                </span>
                <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
              </ContextMenu.SubmenuTrigger>
              <ContextMenu.Portal>
                <ContextMenu.Positioner className="z-[210] outline-none" sideOffset={2} alignOffset={-4}>
                  <ContextMenu.Popup
                    className={cn(
                      "min-w-[200px] origin-[var(--transform-origin)] rounded-lg border border-border bg-card py-1 shadow-lg",
                      "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
                    )}
                  >
                    <ContextMenu.Item className={itemClass} onClick={() => copyText(fullPath)}>
                      Caminho completo
                    </ContextMenu.Item>
                    <ContextMenu.Item className={itemClass} onClick={() => copyText(fileName)}>
                      {isFile ? "Nome do arquivo" : "Nome da pasta"}
                    </ContextMenu.Item>
                  </ContextMenu.Popup>
                </ContextMenu.Positioner>
              </ContextMenu.Portal>
            </ContextMenu.SubmenuRoot>

            <ContextMenu.Separator className="my-1 h-px bg-border" />

            <ContextMenu.Item
              className={itemClass}
              disabled={isPane}
              onClick={() => {
                if (!isPane) onCommand({ type: "show-in-folder", target });
              }}
            >
              <MenuIcon>
                <ExternalLink className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Mostrar na pasta
            </ContextMenu.Item>

            <ContextMenu.Separator className="my-1 h-px bg-border" />

            <ContextMenu.Item
              className={itemClass}
              disabled={isPane}
              onClick={() => {
                if (!isPane) onCommand({ type: "rename", target });
              }}
            >
              <MenuIcon>
                <Pencil className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Renomear
            </ContextMenu.Item>
            <ContextMenu.Item
              className={destructiveItemClass}
              disabled={isPane}
              onClick={() => {
                if (!isPane) onCommand({ type: "delete", target });
              }}
            >
              <MenuIcon destructive>
                <Trash2 className="size-3.5 stroke-[1.5]" />
              </MenuIcon>
              Apagar
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}