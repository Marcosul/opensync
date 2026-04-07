"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import {
  type DragEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";

import { VaultExplorerContextMenu, type ExplorerCommand } from "@/components/app/vault-explorer-context-menu";
import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";
import type { ExplorerItemRef } from "@/components/app/vault-tree-ops";
import { VAULT_EXPLORER_DRAG_MIME } from "@/components/app/vault-tree-ops";
import { cn } from "@/lib/utils";

export type ExplorerVisibleRow =
  | { kind: "file"; docId: string; name: string; parentTreePath: string }
  | { kind: "folder"; path: string; name: string };

export function explorerRowKey(row: ExplorerVisibleRow): string {
  return row.kind === "file" ? `f:${row.parentTreePath}:${row.docId}` : `d:${row.path}`;
}

export function rowToItemRef(row: ExplorerVisibleRow): ExplorerItemRef {
  return row.kind === "file" ? { kind: "file", docId: row.docId } : { kind: "folder", path: row.path };
}

export function explorerRefsForDragRow(
  row: ExplorerVisibleRow,
  selKeys: Set<string>,
  flatRows: ExplorerVisibleRow[]
): ExplorerItemRef[] {
  const k = explorerRowKey(row);
  if (selKeys.size > 0 && selKeys.has(k)) {
    const refs: ExplorerItemRef[] = [];
    for (const r of flatRows) {
      if (selKeys.has(explorerRowKey(r))) refs.push(rowToItemRef(r));
    }
    return refs;
  }
  return [rowToItemRef(row)];
}

export function parseExplorerDragPayload(dt: DataTransfer): ExplorerItemRef[] | null {
  const raw =
    dt.getData(VAULT_EXPLORER_DRAG_MIME) || dt.getData("text/plain");
  if (!raw || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: ExplorerItemRef[] = [];
    for (const x of parsed) {
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        if (o.kind === "file" && typeof o.docId === "string") out.push({ kind: "file", docId: o.docId });
        if (o.kind === "folder" && typeof o.path === "string") out.push({ kind: "folder", path: o.path });
      }
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export type ExplorerInlineRenameState =
  | null
  | { kind: "file"; docId: string; parentTreePath: string; draft: string; initialName: string }
  | { kind: "folder"; treePath: string; draft: string; initialName: string };

export type VaultExplorerTreeViewProps = {
  entries: TreeEntry[];
  parentDirPath: string;
  depth: number;
  expandedPaths: Set<string>;
  onToggleDir: (path: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onExplorerCommand: (cmd: ExplorerCommand) => void;
  inlineRename: ExplorerInlineRenameState;
  onRenameDraftChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  skipRenameBlurCommitRef: MutableRefObject<boolean>;
  explorerSelKeys: Set<string>;
  explorerFocusIdx: number | null;
  flatIndexByKey: Map<string, number>;
  explorerDragOverPath: string | null;
  onExplorerRowPointerDown: (e: PointerEvent, row: ExplorerVisibleRow) => void;
  onExplorerDragStart: (e: DragEvent, row: ExplorerVisibleRow) => void;
  onFolderDragOver: (e: DragEvent, path: string) => void;
  onFolderDrop: (e: DragEvent, path: string) => void;
  renameRowClass: string;
  renameInputClass: string;
};

export function VaultExplorerTreeView({
  entries,
  parentDirPath,
  depth,
  expandedPaths,
  onToggleDir,
  selectedId,
  onSelect,
  onExplorerCommand,
  inlineRename,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  skipRenameBlurCommitRef,
  explorerSelKeys,
  explorerFocusIdx,
  flatIndexByKey,
  explorerDragOverPath,
  onExplorerRowPointerDown,
  onExplorerDragStart,
  onFolderDragOver,
  onFolderDrop,
  renameRowClass,
  renameInputClass,
}: VaultExplorerTreeViewProps) {
  const shared: Omit<VaultExplorerTreeViewProps, "entries" | "parentDirPath" | "depth"> = {
    expandedPaths,
    onToggleDir,
    selectedId,
    onSelect,
    onExplorerCommand,
    inlineRename,
    onRenameDraftChange,
    onRenameCommit,
    onRenameCancel,
    skipRenameBlurCommitRef,
    explorerSelKeys,
    explorerFocusIdx,
    flatIndexByKey,
    explorerDragOverPath,
    onExplorerRowPointerDown,
    onExplorerDragStart,
    onFolderDragOver,
    onFolderDrop,
    renameRowClass,
    renameInputClass,
  };

  const onRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      skipRenameBlurCommitRef.current = true;
      onRenameCommit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      skipRenameBlurCommitRef.current = true;
      onRenameCancel();
    }
  };

  const onRenameBlur = () => {
    if (skipRenameBlurCommitRef.current) {
      skipRenameBlurCommitRef.current = false;
      return;
    }
    onRenameCommit();
  };

  const rowVisual = (row: ExplorerVisibleRow, fileActive: boolean) => {
    const k = explorerRowKey(row);
    const picked = explorerSelKeys.has(k) || (explorerSelKeys.size === 0 && row.kind === "file" && row.docId === selectedId);
    const focused = explorerFocusIdx !== null && flatIndexByKey.get(k) === explorerFocusIdx;
    const isFolder = row.kind === "folder";
    return cn(
      picked &&
        (isFolder ? "bg-muted/50 text-foreground" : "bg-primary/12 text-primary"),
      !picked && "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
      focused && "ring-1 ring-border/80 ring-offset-1 ring-offset-sidebar",
      fileActive && picked && "font-medium"
    );
  };

  return (
    <ul className={cn("space-y-0.5", depth > 0 && "ml-2 border-l border-border/50 pl-2")}>
      {entries.map((entry) => {
        if (entry.type === "dir") {
          const isOpen = expandedPaths.has(entry.path);
          const folderRow: ExplorerVisibleRow = { kind: "folder", path: entry.path, name: entry.name };
          const dropActive = explorerDragOverPath === entry.path;

          if (inlineRename?.kind === "folder" && inlineRename.treePath === entry.path) {
            const session = inlineRename;
            return (
              <li key={entry.path} onDrop={(e) => onFolderDrop(e, entry.path)}>
                <div
                  className={cn(renameRowClass)}
                  data-explorer-inline-rename
                  data-explorer-folder-drop-target=""
                  onDragOver={(e) => onFolderDragOver(e, entry.path)}
                  onDrop={(e) => onFolderDrop(e, entry.path)}
                >
                  <button
                    type="button"
                    data-tree-dir={entry.path}
                    onClick={() => onToggleDir(entry.path)}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={isOpen ? "Recolher pasta" : "Expandir pasta"}
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 opacity-60" />
                    )}
                  </button>
                  <input
                    autoFocus
                    aria-label="Novo nome da pasta"
                    className={renameInputClass}
                    value={session.draft}
                    onChange={(e) => onRenameDraftChange(e.target.value)}
                    onKeyDown={onRenameKeyDown}
                    onBlur={onRenameBlur}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
                {isOpen && entry.children.length > 0 && (
                  <VaultExplorerTreeView
                    entries={entry.children}
                    parentDirPath={entry.path}
                    depth={depth + 1}
                    {...shared}
                  />
                )}
                {isOpen && entry.children.length === 0 && (
                  <VaultExplorerContextMenu
                    target={{ kind: "folder", treePath: entry.path, name: entry.name }}
                    onCommand={onExplorerCommand}
                  >
                    <p className="cursor-context-menu px-5 py-1 font-mono text-[10px] italic text-muted-foreground/40">
                      (vazio)
                    </p>
                  </VaultExplorerContextMenu>
                )}
              </li>
            );
          }

          return (
            <li key={entry.path} onDrop={(e) => onFolderDrop(e, entry.path)}>
              <VaultExplorerContextMenu
                target={{ kind: "folder", treePath: entry.path, name: entry.name }}
                onCommand={onExplorerCommand}
              >
                <div
                  data-explorer-folder-drop-target=""
                  onDragOver={(e) => onFolderDragOver(e, entry.path)}
                  onDrop={(e) => onFolderDrop(e, entry.path)}
                  className={cn(
                    "flex w-full items-center gap-0.5 rounded-md px-0.5 transition-[background-color,box-shadow] duration-100",
                    dropActive && "bg-muted/45 ring-1 ring-border"
                  )}
                >
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onToggleDir(entry.path);
                    }}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={isOpen ? "Recolher pasta" : "Expandir pasta"}
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 opacity-60" />
                    )}
                  </button>
                  <button
                    type="button"
                    draggable
                    data-tree-dir={entry.path}
                    onPointerDown={(e) => onExplorerRowPointerDown(e, folderRow)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                      onToggleDir(entry.path);
                    }}
                    onDragStart={(e) => {
                      onExplorerDragStart(e, folderRow);
                      e.currentTarget.blur();
                    }}
                    className={cn(
                      "min-w-0 flex-1 rounded px-1 py-1 text-left font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
                      rowVisual(folderRow, false)
                    )}
                  >
                    <span className="min-w-0 truncate">{entry.name}</span>
                  </button>
                </div>
              </VaultExplorerContextMenu>
              {isOpen && entry.children.length > 0 && (
                <VaultExplorerTreeView
                  entries={entry.children}
                  parentDirPath={entry.path}
                  depth={depth + 1}
                  {...shared}
                />
              )}
              {isOpen && entry.children.length === 0 && (
                <VaultExplorerContextMenu
                  target={{ kind: "folder", treePath: entry.path, name: entry.name }}
                  onCommand={onExplorerCommand}
                >
                  <p className="cursor-context-menu px-5 py-1 font-mono text-[10px] italic text-muted-foreground/40">
                    (vazio)
                  </p>
                </VaultExplorerContextMenu>
              )}
            </li>
          );
        }

        if (entry.type === "file" && "disabled" in entry && entry.disabled) {
          return (
            <li key={`${entry.name}-disabled`}>
              <span className="flex items-center gap-2 rounded px-2 py-1 font-mono text-[11px] text-muted-foreground/30">
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/20" />
                {entry.name}
              </span>
            </li>
          );
        }

        if (entry.type === "file" && "docId" in entry) {
          const active = selectedId !== null && entry.docId === selectedId;
          const fileRow: ExplorerVisibleRow = {
            kind: "file",
            docId: entry.docId,
            name: entry.name,
            parentTreePath: parentDirPath,
          };

          if (
            inlineRename?.kind === "file" &&
            inlineRename.docId === entry.docId &&
            inlineRename.parentTreePath === parentDirPath
          ) {
            const session = inlineRename;
            return (
              <li key={entry.docId}>
                <div className={cn(renameRowClass, "gap-2 px-2")} data-explorer-inline-rename>
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      active ? "bg-primary" : "bg-muted-foreground/35"
                    )}
                  />
                  <input
                    autoFocus
                    aria-label="Novo nome do arquivo"
                    className={renameInputClass}
                    value={session.draft}
                    onChange={(e) => onRenameDraftChange(e.target.value)}
                    onKeyDown={onRenameKeyDown}
                    onBlur={onRenameBlur}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              </li>
            );
          }

          return (
            <li key={entry.docId}>
              <VaultExplorerContextMenu
                target={{
                  kind: "file",
                  docId: entry.docId,
                  name: entry.name,
                  parentTreePath: parentDirPath,
                }}
                onCommand={onExplorerCommand}
              >
                <button
                  type="button"
                  draggable
                  data-tree-doc={entry.docId}
                  onPointerDown={(e) => onExplorerRowPointerDown(e, fileRow)}
                  onDragStart={(e) => {
                    onExplorerDragStart(e, fileRow);
                    e.currentTarget.blur();
                  }}
                  onClick={() => onSelect(entry.docId)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
                    rowVisual(fileRow, active)
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      active ? "bg-primary" : "bg-muted-foreground/35"
                    )}
                  />
                  <span className="min-w-0 truncate">{entry.name}</span>
                </button>
              </VaultExplorerContextMenu>
            </li>
          );
        }

        return null;
      })}
    </ul>
  );
}
