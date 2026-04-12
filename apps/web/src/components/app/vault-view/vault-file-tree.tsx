"use client";

/**
 * Barra lateral do cofre: modo ficheiros (árvore + DnD), busca global e marcadores.
 * Teclado (F2, Delete, setas) e seleção múltipla ficam aqui para não inflar o workspace.
 */
import {
  ArrowDownAZ,
  Bookmark,
  ChevronsDownUp,
  Folder,
  FolderPlus,
  Search,
  SquarePen,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";

import {
  VaultExplorerContextMenu,
  type ExplorerCommand,
} from "@/components/app/vault-explorer-context-menu";
import {
  VaultExplorerTreeView,
  explorerRowKey,
  explorerRefsForDragRow,
  parseExplorerDragPayload,
  rowToItemRef,
  type ExplorerInlineRenameState,
  type ExplorerVisibleRow,
} from "@/components/app/vault-explorer-tree-view";
import { VaultSidebarFooter } from "@/components/app/vault-switcher";
import {
  filterEntriesByNameQuery,
  filterTopLevelExplorerRefs,
  getChildrenAtPath,
  VAULT_EXPLORER_DRAG_MIME,
  type ExplorerItemRef,
} from "@/components/app/vault-tree-ops";
import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";
import type { VaultBookmark, VaultMeta } from "@/components/app/vault-persistence";
import { cn } from "@/lib/utils";

import {
  flattenTreeDocs,
  flattenVisibleExplorerRows,
  sortTreeEntries,
  type SidebarMode,
  type TreeSortOrder,
} from "./explorer-tree-utils";
import {
  EXPLORER_INLINE_RENAME_INPUT_CLASS,
  EXPLORER_INLINE_RENAME_ROW_CLASS,
} from "./vault-chrome-styles";

export function FileTree({
  treeRootLabel,
  treeRootPath,
  treeChildren,
  selectedId,
  onSelect,
  expandedPaths,
  onToggleDir,
  folderSearch,
  onFolderSearchChange,
  bookmarks,
  onOpenBookmark,
  onRemoveBookmark,
  revealTarget,
  onRevealHandled,
  onExplorerCommand,
  vaultMetas,
  activeVaultId,
  activeVaultName,
  vaultPathTooltip,
  vaultStatsLine,
  onSelectVault,
  onOpenManageVaults,
  sidebarMode,
  onSidebarModeChange,
  treeSortOrder,
  onCycleSort,
  onQuickNewNote,
  onQuickNewFolder,
  onCollapseAllFolders,
  onCollapseSidebar,
  explorerInlineRename,
  onExplorerRenameDraftChange,
  onExplorerRenameCommit,
  onExplorerRenameCancel,
  skipExplorerRenameBlurCommitRef,
  explorerTreeNonce,
  vaultTreeRoot,
  onOpenExplorerDeleteDialog,
  onMoveExplorerItemsToFolder,
  onExplorerNewNote,
  onExplorerNewFolder,
  onExplorerRenameRow,
}: {
  treeRootLabel: string;
  /** Caminho da entrada raiz da árvore (`openclaw-root`, `vault-root`, …). */
  treeRootPath: string;
  treeChildren: TreeEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  expandedPaths: Set<string>;
  onToggleDir: (path: string) => void;
  folderSearch: { path: string; query: string } | null;
  onFolderSearchChange: (v: { path: string; query: string } | null) => void;
  bookmarks: VaultBookmark[];
  onOpenBookmark: (b: VaultBookmark) => void;
  onRemoveBookmark: (b: VaultBookmark) => void;
  revealTarget: { type: "file"; docId: string } | { type: "folder"; path: string } | null;
  onRevealHandled: () => void;
  onExplorerCommand: (cmd: ExplorerCommand) => void;
  vaultMetas: VaultMeta[];
  activeVaultId: string;
  activeVaultName: string;
  vaultPathTooltip: string;
  vaultStatsLine: string;
  onSelectVault: (id: string) => void;
  onOpenManageVaults: () => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (m: SidebarMode) => void;
  treeSortOrder: TreeSortOrder;
  onCycleSort: () => void;
  onQuickNewNote: () => void;
  onQuickNewFolder: () => void;
  onCollapseAllFolders: () => void;
  onCollapseSidebar: () => void;
  explorerInlineRename: ExplorerInlineRenameState;
  onExplorerRenameDraftChange: (draft: string) => void;
  onExplorerRenameCommit: () => void;
  onExplorerRenameCancel: () => void;
  skipExplorerRenameBlurCommitRef: MutableRefObject<boolean>;
  explorerTreeNonce: number;
  vaultTreeRoot: TreeEntry;
  onOpenExplorerDeleteDialog: (items: ExplorerItemRef[]) => void;
  onMoveExplorerItemsToFolder: (targetParentPath: string, items: ExplorerItemRef[]) => void;
  onExplorerNewNote: () => void;
  onExplorerNewFolder: () => void;
  onExplorerRenameRow: (row: ExplorerVisibleRow) => void;
}) {
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");

  const baseEntries = folderSearch
    ? (getChildrenAtPath(treeChildren, folderSearch.path, treeRootPath) ?? [])
    : treeChildren;
  const displayEntries = folderSearch?.query.trim()
    ? filterEntriesByNameQuery(baseEntries, folderSearch.query)
    : baseEntries;
  const listParentPath = folderSearch?.path ?? treeRootPath;

  const sortedEntries = useMemo(
    () => sortTreeEntries(displayEntries, treeSortOrder),
    [displayEntries, treeSortOrder],
  );

  const explorerFlatRows = useMemo(
    () => flattenVisibleExplorerRows(sortedEntries, expandedPaths, listParentPath),
    [sortedEntries, expandedPaths, listParentPath],
  );

  const explorerFlatIndexByKey = useMemo(() => {
    const m = new Map<string, number>();
    explorerFlatRows.forEach((r, i) => m.set(explorerRowKey(r), i));
    return m;
  }, [explorerFlatRows]);

  const [explorerSelKeys, setExplorerSelKeys] = useState(() => new Set<string>());
  const [explorerAnchorIdx, setExplorerAnchorIdx] = useState<number | null>(null);
  const [explorerFocusIdx, setExplorerFocusIdx] = useState<number | null>(null);
  const [explorerDragOverPath, setExplorerDragOverPath] = useState<string | null>(null);
  /** Alguns navegadores não listam MIME custom no `dragover`; o ref cobre o arrasto interno. */
  const explorerInternalDragActiveRef = useRef(false);

  useEffect(() => {
    setExplorerSelKeys(new Set());
    setExplorerAnchorIdx(null);
    setExplorerFocusIdx(null);
    setExplorerDragOverPath(null);
  }, [explorerTreeNonce]);

  useEffect(() => {
    const onEnd = () => {
      explorerInternalDragActiveRef.current = false;
      setExplorerDragOverPath(null);
    };
    window.addEventListener("dragend", onEnd);
    return () => window.removeEventListener("dragend", onEnd);
  }, []);

  const isVaultExplorerDragDataTransfer = useCallback((dt: DataTransfer) => {
    if (explorerInternalDragActiveRef.current) return true;
    return Array.from(dt.types).includes(VAULT_EXPLORER_DRAG_MIME);
  }, []);

  const handleExplorerRowPointerDown = useCallback(
    (e: PointerEvent, row: ExplorerVisibleRow) => {
      if (e.button !== 0) return;
      const idx = explorerFlatIndexByKey.get(explorerRowKey(row));
      if (idx === undefined) return;
      const k = explorerRowKey(row);
      if (e.shiftKey && explorerAnchorIdx !== null) {
        const a = Math.min(explorerAnchorIdx, idx);
        const b = Math.max(explorerAnchorIdx, idx);
        const next = new Set<string>();
        for (let i = a; i <= b; i++) next.add(explorerRowKey(explorerFlatRows[i]!));
        setExplorerSelKeys(next);
        setExplorerFocusIdx(idx);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        setExplorerSelKeys((prev) => {
          const n = new Set(prev);
          if (n.has(k)) n.delete(k);
          else n.add(k);
          return n;
        });
        setExplorerAnchorIdx(idx);
        setExplorerFocusIdx(idx);
        return;
      }
      setExplorerSelKeys(new Set([k]));
      setExplorerAnchorIdx(idx);
      setExplorerFocusIdx(idx);
    },
    [explorerAnchorIdx, explorerFlatIndexByKey, explorerFlatRows],
  );

  const handleExplorerDragStart = useCallback(
    (e: DragEvent, row: ExplorerVisibleRow) => {
      explorerInternalDragActiveRef.current = true;
      setExplorerFocusIdx(null);
      const refs = explorerRefsForDragRow(row, explorerSelKeys, explorerFlatRows);
      const payload = JSON.stringify(refs);
      e.dataTransfer.setData(VAULT_EXPLORER_DRAG_MIME, payload);
      // Alguns navegadores só liberam o drop se existir tipo “text/plain”.
      e.dataTransfer.setData("text/plain", payload);
      e.dataTransfer.effectAllowed = "move";
    },
    [explorerSelKeys, explorerFlatRows],
  );

  const handleFolderDragOver = useCallback(
    (e: DragEvent, path: string) => {
      if (!isVaultExplorerDragDataTransfer(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setExplorerDragOverPath(path);
    },
    [isVaultExplorerDragDataTransfer],
  );

  const handleFolderDrop = useCallback(
    (e: DragEvent, path: string) => {
      e.preventDefault();
      e.stopPropagation();
      setExplorerDragOverPath(null);
      const refs = parseExplorerDragPayload(e.dataTransfer);
      if (!refs?.length) return;
      onMoveExplorerItemsToFolder(path, refs);
    },
    [onMoveExplorerItemsToFolder],
  );

  const handleExplorerPaneDragOver = useCallback(
    (e: DragEvent) => {
      if (!isVaultExplorerDragDataTransfer(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const el = e.target as HTMLElement | null;
      // Só mantém destaque na linha da pasta; na bolha isso roda depois e limpa sobre arquivos/área vazia.
      if (!el?.closest?.("[data-explorer-folder-drop-target]")) {
        setExplorerDragOverPath(null);
      }
    },
    [isVaultExplorerDragDataTransfer],
  );

  const handleExplorerPaneDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setExplorerDragOverPath(null);
      const refs = parseExplorerDragPayload(e.dataTransfer);
      if (!refs?.length) return;
      onMoveExplorerItemsToFolder(listParentPath, refs);
    },
    [listParentPath, onMoveExplorerItemsToFolder],
  );

  const handleExplorerTreeKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (vaultTreeRoot.type !== "dir") return;
      const rows = explorerFlatRows;
      if (rows.length === 0) return;

      const renameEl = (e.target as HTMLElement).closest("[data-explorer-inline-rename]");
      if (renameEl) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;

      if (mod && key.toLowerCase() === "n") {
        e.preventDefault();
        if (e.shiftKey) onExplorerNewFolder();
        else onExplorerNewNote();
        return;
      }

      if (key === "F2") {
        e.preventDefault();
        let row: ExplorerVisibleRow | undefined;
        if (explorerFocusIdx !== null) row = rows[explorerFocusIdx];
        else if (explorerSelKeys.size === 1) {
          const only = [...explorerSelKeys][0];
          row = rows.find((r) => explorerRowKey(r) === only);
        } else if (selectedId) {
          row = rows.find((r) => r.kind === "file" && r.docId === selectedId);
        }
        if (row) onExplorerRenameRow(row);
        return;
      }

      if (key === "Delete" || key === "Backspace") {
        e.preventDefault();
        let refs: ExplorerItemRef[];
        if (explorerSelKeys.size > 0) {
          refs = rows.filter((r) => explorerSelKeys.has(explorerRowKey(r))).map(rowToItemRef);
        } else if (explorerFocusIdx !== null) {
          const r = rows[explorerFocusIdx];
          refs = r ? [rowToItemRef(r)] : [];
        } else if (selectedId) {
          refs = [{ kind: "file", docId: selectedId }];
        } else {
          return;
        }
        const filtered = filterTopLevelExplorerRefs(vaultTreeRoot, refs);
        if (filtered.length) onOpenExplorerDeleteDialog(filtered);
        return;
      }

      if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
        e.preventDefault();
        let next: number;
        if (key === "Home") next = 0;
        else if (key === "End") next = rows.length - 1;
        else if (key === "ArrowDown") {
          const cur = explorerFocusIdx ?? -1;
          next = Math.min(cur + 1, rows.length - 1);
        } else {
          const cur = explorerFocusIdx ?? rows.length;
          next = Math.max(cur - 1, 0);
        }
        if (next < 0 || next >= rows.length) return;

        setExplorerFocusIdx(next);
        if (e.shiftKey && explorerAnchorIdx !== null) {
          const a = Math.min(explorerAnchorIdx, next);
          const b = Math.max(explorerAnchorIdx, next);
          const ns = new Set<string>();
          for (let i = a; i <= b; i++) ns.add(explorerRowKey(rows[i]!));
          setExplorerSelKeys(ns);
        } else {
          setExplorerAnchorIdx(next);
          setExplorerSelKeys(new Set([explorerRowKey(rows[next]!)]));
        }
        return;
      }

      if (key === "Enter") {
        const row = explorerFocusIdx !== null ? rows[explorerFocusIdx] : undefined;
        if (!row) return;
        e.preventDefault();
        if (row.kind === "file") onSelect(row.docId);
        else onToggleDir(row.path);
      }
    },
    [
      vaultTreeRoot,
      explorerFlatRows,
      explorerFocusIdx,
      explorerAnchorIdx,
      explorerSelKeys,
      selectedId,
      onExplorerNewNote,
      onExplorerNewFolder,
      onExplorerRenameRow,
      onOpenExplorerDeleteDialog,
      onSelect,
      onToggleDir,
    ],
  );

  const searchHits = useMemo(() => {
    const q = sidebarSearchQuery.trim().toLowerCase();
    const all = flattenTreeDocs(treeChildren);
    if (!q) return all;
    return all.filter(
      (f) => f.label.toLowerCase().includes(q) || f.docId.toLowerCase().includes(q),
    );
  }, [treeChildren, sidebarSearchQuery]);

  const sortTooltip =
    treeSortOrder === "default"
      ? "Ordenar: pastas primeiro, A–Z (clique para alternar)"
      : treeSortOrder === "name"
        ? "Ordenar: nome A–Z"
        : "Ordenar: nome Z–A";

  useLayoutEffect(() => {
    if (!revealTarget) return;
    const root = treeScrollRef.current;
    if (!root) {
      onRevealHandled();
      return;
    }
    const sel =
      revealTarget.type === "file"
        ? `[data-tree-doc="${CSS.escape(revealTarget.docId)}"]`
        : `[data-tree-dir="${CSS.escape(revealTarget.path)}"]`;
    const el = root.querySelector(sel);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    onRevealHandled();
  }, [revealTarget, onRevealHandled]);

  const iconBtn =
    "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <div className="flex w-[200px] shrink-0 flex-col border-r border-border bg-sidebar/30">
      <div className="flex shrink-0 items-center justify-center gap-0.5 border-b border-border px-1 py-1">
        <button
          type="button"
          className={cn(iconBtn, sidebarMode === "files" && "bg-muted text-foreground")}
          title="Explorador de arquivos"
          aria-label="Explorador de arquivos"
          aria-pressed={sidebarMode === "files"}
          onClick={() => onSidebarModeChange("files")}
        >
          <Folder className="size-4" />
        </button>
        <button
          type="button"
          className={cn(iconBtn, sidebarMode === "search" && "bg-muted text-foreground")}
          title="Buscar no cofre"
          aria-label="Buscar no cofre"
          aria-pressed={sidebarMode === "search"}
          onClick={() => onSidebarModeChange("search")}
        >
          <Search className="size-4" />
        </button>
        <button
          type="button"
          className={cn(iconBtn, sidebarMode === "bookmarks" && "bg-muted text-foreground")}
          title="Marcadores"
          aria-label="Marcadores"
          aria-pressed={sidebarMode === "bookmarks"}
          onClick={() => onSidebarModeChange("bookmarks")}
        >
          <Bookmark className="size-4" />
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-0.5 border-b border-border px-1 py-1">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={iconBtn}
            title="Nova nota"
            aria-label="Nova nota"
            onClick={onQuickNewNote}
          >
            <SquarePen className="size-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
            title="Nova pasta"
            aria-label="Nova pasta"
            onClick={onQuickNewFolder}
          >
            <FolderPlus className="size-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
            title={sortTooltip}
            aria-label={sortTooltip}
            onClick={onCycleSort}
          >
            <ArrowDownAZ className="size-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
            title="Recolher todas as pastas"
            aria-label="Recolher todas as pastas"
            onClick={onCollapseAllFolders}
          >
            <ChevronsDownUp className="size-4" />
          </button>
        </div>
        <button
          type="button"
          className={iconBtn}
          title="Ocultar barra lateral"
          aria-label="Ocultar barra lateral"
          onClick={onCollapseSidebar}
        >
          <X className="size-4" />
        </button>
      </div>

      {sidebarMode === "search" && (
        <div className="shrink-0 border-b border-border px-2 py-1.5">
          <input
            type="search"
            value={sidebarSearchQuery}
            onChange={(e) => setSidebarSearchQuery(e.target.value)}
            placeholder="Buscar no cofre…"
            className="w-full rounded border border-border bg-background px-1.5 py-1 font-mono text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          />
        </div>
      )}

      {sidebarMode === "files" && folderSearch && (
        <div className="shrink-0 border-b border-border px-2 py-1.5">
          <div className="mb-1 flex items-center justify-between gap-1">
            <span
              className="truncate font-mono text-[9px] text-muted-foreground"
              title={folderSearch.path}
            >
              Busca em {folderSearch.path.split("/").pop() ?? folderSearch.path}
            </span>
            <button
              type="button"
              className="shrink-0 font-mono text-[9px] text-primary hover:underline"
              onClick={() => onFolderSearchChange(null)}
            >
              Voltar
            </button>
          </div>
          <input
            type="search"
            value={folderSearch.query}
            onChange={(e) => onFolderSearchChange({ ...folderSearch, query: e.target.value })}
            placeholder="Filtrar nome…"
            className="w-full rounded border border-border bg-background px-1.5 py-1 font-mono text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          />
        </div>
      )}

      <div ref={treeScrollRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {sidebarMode === "files" && (
          <VaultExplorerContextMenu
            target={{ kind: "pane", parentTreePath: listParentPath, label: treeRootLabel }}
            onCommand={onExplorerCommand}
          >
            <div className="flex min-h-[min(40vh,14rem)] flex-col">
              <p
                className="mb-1 truncate px-1 font-mono text-[10px] text-muted-foreground/60"
                title={treeRootLabel}
              >
                {treeRootLabel}
              </p>
              <div
                role="tree"
                tabIndex={0}
                aria-label="Árvore do cofre"
                onKeyDown={handleExplorerTreeKeyDown}
                onDragOver={handleExplorerPaneDragOver}
                onDrop={handleExplorerPaneDrop}
                className="min-h-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <nav className="min-h-0" aria-label="workspace tree">
                  <VaultExplorerTreeView
                    entries={sortedEntries}
                    parentDirPath={listParentPath}
                    depth={0}
                    expandedPaths={expandedPaths}
                    onToggleDir={onToggleDir}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onExplorerCommand={onExplorerCommand}
                    inlineRename={explorerInlineRename}
                    onRenameDraftChange={onExplorerRenameDraftChange}
                    onRenameCommit={onExplorerRenameCommit}
                    onRenameCancel={onExplorerRenameCancel}
                    skipRenameBlurCommitRef={skipExplorerRenameBlurCommitRef}
                    explorerSelKeys={explorerSelKeys}
                    explorerFocusIdx={explorerFocusIdx}
                    flatIndexByKey={explorerFlatIndexByKey}
                    explorerDragOverPath={explorerDragOverPath}
                    onExplorerRowPointerDown={handleExplorerRowPointerDown}
                    onExplorerDragStart={handleExplorerDragStart}
                    onFolderDragOver={handleFolderDragOver}
                    onFolderDrop={handleFolderDrop}
                    onExplorerRenameRow={onExplorerRenameRow}
                    renameRowClass={EXPLORER_INLINE_RENAME_ROW_CLASS}
                    renameInputClass={EXPLORER_INLINE_RENAME_INPUT_CLASS}
                  />
                </nav>
              </div>
            </div>
          </VaultExplorerContextMenu>
        )}

        {sidebarMode === "search" && (
          <ul className="space-y-0.5" aria-label="Resultados da busca">
            {searchHits.length === 0 ? (
              <li className="px-1 py-2 font-mono text-[10px] italic text-muted-foreground/60">
                Nenhum arquivo
              </li>
            ) : (
              searchHits.map((f) => (
                <li key={f.docId}>
                  <button
                    type="button"
                    onClick={() => onSelect(f.docId)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition-colors",
                      selectedId === f.docId
                        ? "bg-primary/12 font-medium text-primary"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-muted-foreground/35"
                      aria-hidden
                    />
                    <span className="min-w-0 truncate">{f.label}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {sidebarMode === "bookmarks" && (
          <>
            <p className="mb-1 px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
              Marcadores
            </p>
            {bookmarks.length === 0 ? (
              <p className="px-1 py-2 font-mono text-[10px] italic text-muted-foreground/50">
                Nenhum marcador. Use o menu de contexto em um arquivo ou pasta.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {bookmarks.map((b) => (
                  <li
                    key={b.kind === "file" ? `f-${b.docId}` : `d-${b.path}`}
                    className="flex items-center gap-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenBookmark(b)}
                      className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left font-mono text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                      title={b.kind === "file" ? b.docId : b.path}
                    >
                      {b.label}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded px-0.5 font-mono text-[10px] text-muted-foreground/50 hover:text-destructive"
                      aria-label="Remover marcador"
                      onClick={() => onRemoveBookmark(b)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <VaultSidebarFooter
        vaults={vaultMetas}
        activeId={activeVaultId}
        activeName={activeVaultName}
        pathTooltip={vaultPathTooltip}
        statsLine={vaultStatsLine}
        onSelectVault={onSelectVault}
        onOpenManageVaults={onOpenManageVaults}
      />
    </div>
  );
}
