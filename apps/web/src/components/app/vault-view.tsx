"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowDownAZ,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  CloudUpload,
  Columns,
  FileCode2,
  Folder,
  FolderPlus,
  GitBranch,
  MoreVertical,
  PanelLeft,
  Plus,
  Search,
  SquarePen,
  Tag,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { apiRequest } from "@/api/rest/generic";
import {
  applyMissionMarkdownToSnapshot,
  clearPendingActiveVaultId,
  countTreeStats,
  getHydrationSafeVaultBoot,
  loadSnapshotWithSshBridge,
  peekPendingActiveVaultId,
  readActiveVaultId,
  readAndConsumePendingAgentProject,
  clearActiveVaultId,
  readVaultMetas,
  saveSnapshot,
  vaultSnapshotKey,
  emptyVaultPlaceholderSnapshot,
  writeActiveVaultId,
  writeVaultMetas,
  type VaultBookmark,
  type VaultMeta,
  type VaultSnapshotV1,
  type VaultUiState,
  type ViewMode,
} from "@/components/app/vault-persistence";
import { VaultManageDialog, VaultSidebarFooter } from "@/components/app/vault-switcher";
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
import { VaultNoteEditor } from "@/components/app/vault-note-editor";
import {
  addBaseToParent,
  addCanvasToParent,
  addFolderToParent,
  addNoteToParent,
  collectDocIdsFromTree,
  deleteExplorerItems,
  duplicateFile,
  extractWikilinks,
  filterTopLevelExplorerRefs,
  filterEntriesByNameQuery,
  findAncestorDirPathsForDoc,
  findDir,
  findFileNameForDocId,
  getChildrenAtPath,
  moveDirectory,
  moveExplorerItemsToParent,
  moveFile,
  renameDirectory,
  renameFile,
  VAULT_EXPLORER_DRAG_MIME,
  type ExplorerItemRef,
} from "@/components/app/vault-tree-ops";
import {
  DOCS,
  OPENCLAW_ROOT_LABEL,
  OPENCLAW_TREE_ROOT,
  findDocBreadcrumbFromEntries,
  mockDocToMarkdown,
  type MockDoc,
  type TreeEntry,
} from "@/components/marketing/openclaw-workspace-mock";
import {
  fetchVaultGitBlob,
  fetchVaultGitTree,
} from "@/lib/vault-git-client";
import {
  GIT_LAZY_PLACEHOLDER_DOC_ID,
  gitTreePathsToVaultSnapshot,
  isGitLazyVaultTree,
} from "@/lib/vault-git-tree-import";
import {
  flattenVaultTreeToSyncFiles,
  isBackendSyncVaultId,
  usesLazyGitRemote,
} from "@/lib/vault-sync-flatten";
import { cn } from "@/lib/utils";

const DOC_BY_ID = Object.fromEntries(DOCS.map((d) => [d.id, d])) as Record<string, MockDoc>;

function treePathAncestors(path: string): string[] {
  const out: string[] = [];
  let p = path;
  while (true) {
    const i = p.lastIndexOf("/");
    if (i <= 0) break;
    p = p.slice(0, i);
    out.push(p);
  }
  return out.reverse();
}

function noteMarkdown(docId: string, noteContents: Record<string, string>): string {
  return (
    noteContents[docId] ??
    (DOC_BY_ID[docId] ? mockDocToMarkdown(DOC_BY_ID[docId]) : "")
  );
}

type GNode = {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  index?: number;
  degree: number;
};
type GLink = { source: string | GNode; target: string | GNode };

function buildGraphFromVault(tree: TreeEntry, noteContents: Record<string, string>) {
  const rootChildren = tree.type === "dir" ? tree.children : [];
  const ids = new Set(collectDocIdsFromTree(rootChildren));
  const linkMap = new Map<string, Set<string>>();

  for (const id of [...ids]) {
    const md = noteMarkdown(id, noteContents);
    for (const t of extractWikilinks(md)) {
      if (!linkMap.has(id)) linkMap.set(id, new Set());
      linkMap.get(id)!.add(t);
    }
  }

  for (const tgts of linkMap.values()) {
    for (const t of tgts) ids.add(t);
  }

  const degreeMap: Record<string, number> = {};
  for (const id of ids) degreeMap[id] = 0;
  for (const [src, tgts] of linkMap) {
    for (const t of tgts) {
      if (ids.has(t)) {
        degreeMap[src] = (degreeMap[src] ?? 0) + 1;
        degreeMap[t] = (degreeMap[t] ?? 0) + 1;
      }
    }
  }

  const nodes: GNode[] = [...ids].map((id) => ({ id, degree: degreeMap[id] ?? 0 }));
  const links: GLink[] = [];
  for (const [src, tgts] of linkMap) {
    for (const t of tgts) {
      if (ids.has(t)) links.push({ source: src, target: t });
    }
  }
  return { nodes, links };
}

function computeTopTags(tree: TreeEntry, noteContents: Record<string, string>): [string, number][] {
  const rootChildren = tree.type === "dir" ? tree.children : [];
  const counts: Record<string, number> = {};
  for (const id of collectDocIdsFromTree(rootChildren)) {
    const md = noteMarkdown(id, noteContents);
    for (const t of extractWikilinks(md)) {
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14);
}

function applyNoteContentsDocPrefixMigration(
  prev: Record<string, string>,
  from: string,
  to: string
): Record<string, string> {
  if (from === to || from === "") return prev;
  const next = { ...prev };
  for (const key of Object.keys(prev)) {
    if (key.startsWith(from)) {
      const nk = to + key.slice(from.length);
      next[nk] = next[key]!;
      delete next[key];
    }
  }
  return next;
}

function buildDocIdRemapFromPrefixes(from: string, to: string, ids: readonly string[]): Record<string, string> {
  const m: Record<string, string> = {};
  if (from === to || from === "") return m;
  for (const id of ids) {
    if (id.startsWith(from)) m[id] = to + id.slice(from.length);
  }
  return m;
}

type SidebarMode = "files" | "search" | "bookmarks";
type TreeSortOrder = "default" | "name" | "name-desc";

function compareTreeEntries(a: TreeEntry, b: TreeEntry): number {
  const aDir = a.type === "dir" ? 0 : 1;
  const bDir = b.type === "dir" ? 0 : 1;
  if (aDir !== bDir) return aDir - bDir;
  return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
}

function sortTreeEntries(entries: TreeEntry[], order: TreeSortOrder): TreeEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (order === "default") return compareTreeEntries(a, b);
    if (order === "name") return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    return b.name.localeCompare(a.name, "pt-BR", { sensitivity: "base" });
  });
  return sorted.map((e) =>
    e.type === "dir" ? { ...e, children: sortTreeEntries(e.children, order) } : e
  );
}

/** Linhas visíveis na ordem do explorador (respeita expand/collapse). */
function flattenVisibleExplorerRows(
  entries: TreeEntry[],
  expandedPaths: Set<string>,
  parentTreePath: string
): ExplorerVisibleRow[] {
  const out: ExplorerVisibleRow[] = [];
  for (const e of entries) {
    if (e.type === "dir") {
      out.push({ kind: "folder", path: e.path, name: e.name });
      if (expandedPaths.has(e.path)) {
        out.push(...flattenVisibleExplorerRows(e.children, expandedPaths, e.path));
      }
    } else if (e.type === "file" && "docId" in e && !("disabled" in e && e.disabled)) {
      out.push({ kind: "file", docId: e.docId, name: e.name, parentTreePath });
    }
  }
  return out;
}

function flattenTreeDocs(entries: TreeEntry[], prefix = ""): { docId: string; label: string }[] {
  const out: { docId: string; label: string }[] = [];
  for (const e of entries) {
    if (e.type === "dir") {
      out.push(...flattenTreeDocs(e.children, `${prefix}${e.name}/`));
    } else if (e.type === "file" && "docId" in e) {
      out.push({ docId: e.docId, label: `${prefix}${e.name}` });
    }
  }
  return out;
}

const vaultChromeMenuItemClass = cn(
  "flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
  "text-foreground data-highlighted:bg-muted"
);

function VaultExplorerDeleteConfirmDialog({
  open,
  title,
  message,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onCancel}
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        role="alertdialog"
        aria-labelledby="vault-explorer-delete-title"
        aria-describedby="vault-explorer-delete-desc"
      >
        <h2 id="vault-explorer-delete-title" className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p id="vault-explorer-delete-desc" className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
          {message}
        </p>
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
            Apagar
          </button>
        </div>
      </div>
    </div>
  );
}

type VaultUiAction =
  | { type: "open"; id: string }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "closeMany"; ids: string[] }
  | { type: "replaceDoc"; from: string; to: string }
  | { type: "remapDocIds"; map: Record<string, string> }
  | { type: "reset"; state: VaultUiState }
  | { type: "showGraph" };

function vaultUiReducer(state: VaultUiState, action: VaultUiAction): VaultUiState {
  switch (action.type) {
    case "open": {
      const openTabs = state.openTabs.includes(action.id)
        ? state.openTabs
        : [...state.openTabs, action.id];
      return {
        ...state,
        viewMode: "editor",
        openTabs,
        activeTabId: action.id,
      };
    }
    case "activate": {
      if (!state.openTabs.includes(action.id)) return state;
      return { ...state, viewMode: "editor", activeTabId: action.id };
    }
    case "close": {
      const idx = state.openTabs.indexOf(action.id);
      if (idx === -1) return state;
      const openTabs = state.openTabs.filter((t) => t !== action.id);
      let activeTabId = state.activeTabId;
      if (activeTabId === action.id) {
        activeTabId =
          openTabs.length === 0
            ? ""
            : (openTabs[Math.max(0, idx - 1)] ?? openTabs[0]);
      }
      const viewMode: ViewMode = openTabs.length === 0 ? "graph" : state.viewMode;
      return { ...state, openTabs, activeTabId, viewMode };
    }
    case "closeMany": {
      const drop = new Set(action.ids);
      const openTabs = state.openTabs.filter((t) => !drop.has(t));
      let activeTabId = state.activeTabId;
      if (drop.has(activeTabId)) {
        const idx = state.openTabs.indexOf(activeTabId);
        activeTabId =
          openTabs.length === 0
            ? ""
            : (openTabs[Math.max(0, idx - 1)] ?? openTabs[0] ?? "");
      }
      const viewMode: ViewMode = openTabs.length === 0 ? "graph" : state.viewMode;
      return { ...state, openTabs, activeTabId, viewMode };
    }
    case "replaceDoc": {
      const openTabs = [...new Set(state.openTabs.map((t) => (t === action.from ? action.to : t)))];
      const activeTabId = state.activeTabId === action.from ? action.to : state.activeTabId;
      return { ...state, openTabs, activeTabId };
    }
    case "remapDocIds": {
      const map = action.map;
      if (Object.keys(map).length === 0) return state;
      const openTabs = [...new Set(state.openTabs.map((t) => map[t] ?? t))];
      const activeTabId = map[state.activeTabId] ?? state.activeTabId;
      const safeActive = openTabs.includes(activeTabId) ? activeTabId : (openTabs[0] ?? "");
      return { ...state, openTabs, activeTabId: safeActive };
    }
    case "reset":
      return action.state;
    case "showGraph":
      return { ...state, viewMode: "graph" };
    default:
      return state;
  }
}

const EXPLORER_INLINE_RENAME_ROW_CLASS =
  "flex w-full items-center gap-1 rounded-md border border-border bg-muted/40 px-1 py-0.5 shadow-sm";
const EXPLORER_INLINE_RENAME_INPUT_CLASS =
  "min-w-0 flex-1 rounded-sm border border-border/80 bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none selection:bg-muted focus-visible:ring-1 focus-visible:ring-border dark:bg-background";

export function VaultView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const ssrBoot = useMemo(() => getHydrationSafeVaultBoot(), []);

  const [vaultMetas, setVaultMetas] = useState<VaultMeta[]>(() => ssrBoot.metas);
  const [activeVaultId, setActiveVaultId] = useState(() => ssrBoot.id);
  const [manageVaultsOpen, setManageVaultsOpen] = useState(false);

  const [ui, dispatchUi] = useReducer(vaultUiReducer, ssrBoot.snap.ui);
  const [treeRoot, setTreeRoot] = useState<TreeEntry>(() => ssrBoot.snap.tree);
  const [noteContents, setNoteContents] = useState<Record<string, string>>(
    () => ({ ...ssrBoot.snap.noteContents })
  );
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(ssrBoot.snap.expandedPaths)
  );
  const [folderSearch, setFolderSearch] = useState<{ path: string; query: string } | null>(null);
  const [revealTarget, setRevealTarget] = useState<
    { type: "file"; docId: string } | { type: "folder"; path: string } | null
  >(null);
  const [bookmarks, setBookmarks] = useState<VaultBookmark[]>(() => [...ssrBoot.snap.bookmarks]);
  const [explorerInlineRename, setExplorerInlineRename] = useState<ExplorerInlineRenameState>(null);
  const [explorerDeleteItems, setExplorerDeleteItems] = useState<ExplorerItemRef[] | null>(null);
  const [explorerTreeNonce, setExplorerTreeNonce] = useState(0);
  const [giteaSyncStatus, setGiteaSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "error"
  >("idle");
  const [blobLoadingDocId, setBlobLoadingDocId] = useState<string | null>(null);
  const [blobLoadError, setBlobLoadError] = useState<string | null>(null);

  const activeVaultMeta = useMemo(
    () => vaultMetas.find((m) => m.id === activeVaultId),
    [vaultMetas, activeVaultId]
  );

  const treeRootRef = useRef(treeRoot);
  const noteContentsRef = useRef(noteContents);
  treeRootRef.current = treeRoot;
  noteContentsRef.current = noteContents;

  const syncAbortRef = useRef<AbortController | null>(null);
  const gitTreeAbortRef = useRef<AbortController | null>(null);

  const runVaultGiteaSync = useCallback(async (vaultId: string) => {
    if (!isBackendSyncVaultId(vaultId)) return;
    syncAbortRef.current?.abort();
    const ac = new AbortController();
    syncAbortRef.current = ac;
    setGiteaSyncStatus("syncing");
    try {
      let mergedContents = { ...noteContentsRef.current };
      if (isGitLazyVaultTree(treeRootRef.current)) {
        const { entries } = await fetchVaultGitTree(vaultId, { signal: ac.signal });
        if (ac.signal.aborted) return;
        const paths = entries.map((e) => e.path);
        const concurrency = 8;
        for (let i = 0; i < paths.length; i += concurrency) {
          if (ac.signal.aborted) return;
          const chunk = paths.slice(i, i + concurrency);
          await Promise.all(
            chunk.map(async (p) => {
              if (mergedContents[p] !== undefined) return;
              try {
                const { content } = await fetchVaultGitBlob(vaultId, p, {
                  signal: ac.signal,
                });
                mergedContents[p] = content;
              } catch {
                mergedContents[p] = "";
              }
            }),
          );
        }
        noteContentsRef.current = mergedContents;
        setNoteContents(mergedContents);
      }
      const files = flattenVaultTreeToSyncFiles(
        treeRootRef.current,
        noteContentsRef.current,
      );
      await apiRequest<{ ok: boolean; commitHash: string }>(
        `/api/vaults/${encodeURIComponent(vaultId)}/sync`,
        {
          method: "POST",
          body: { files },
          signal: ac.signal,
        },
      );
      if (ac.signal.aborted) return;
      setGiteaSyncStatus("synced");
    } catch (err) {
      if (ac.signal.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setGiteaSyncStatus("error");
    }
  }, []);

  const scheduleGitTreeRefresh = useCallback(
    (vaultId: string, meta: VaultMeta | undefined) => {
      if (!usesLazyGitRemote(vaultId, meta)) return;
      gitTreeAbortRef.current?.abort();
      const ac = new AbortController();
      gitTreeAbortRef.current = ac;
      void (async () => {
        try {
          const data = await fetchVaultGitTree(vaultId, { signal: ac.signal });
          if (ac.signal.aborted) return;
          const next = gitTreePathsToVaultSnapshot(data.entries.map((e) => e.path));
          setTreeRoot(next.tree);
          setNoteContents({});
          setExpandedPaths(new Set(next.expandedPaths));
          setBookmarks([]);
          dispatchUi({ type: "reset", state: next.ui });
        } catch {
          /* mantem snapshot local */
        }
      })();
    },
    []
  );

  useLayoutEffect(() => {
    const metas = readVaultMetas();
    const id = readActiveVaultId(metas);
    const meta = metas.find((m) => m.id === id);
    const snap =
      !id && metas.length === 0
        ? emptyVaultPlaceholderSnapshot()
        : loadSnapshotWithSshBridge(id, meta);
    setVaultMetas(metas);
    setActiveVaultId(id);
    setTreeRoot(snap.tree);
    setNoteContents({ ...snap.noteContents });
    setExpandedPaths(new Set(snap.expandedPaths));
    setBookmarks([...snap.bookmarks]);
    dispatchUi({ type: "reset", state: snap.ui });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let metas = readVaultMetas();
      let activeId = readActiveVaultId(metas);

      try {
        const { vaults, scope } = await apiRequest<{
          vaults: VaultMeta[];
          scope: "guest" | "user";
        }>("/api/vaults/list");
        if (cancelled) return;

        if (scope === "user") {
          metas = vaults;
          writeVaultMetas(vaults);
          activeId = readActiveVaultId(vaults);
          const preferredId = peekPendingActiveVaultId();
          if (preferredId && vaults.some((m) => m.id === preferredId)) {
            activeId = preferredId;
            clearPendingActiveVaultId();
          }
          writeActiveVaultId(activeId);
          setVaultMetas(vaults);
          setActiveVaultId(activeId);
          if (vaults.length === 0) {
            clearActiveVaultId();
            const emptySnap = emptyVaultPlaceholderSnapshot();
            setTreeRoot(emptySnap.tree);
            setNoteContents({ ...emptySnap.noteContents });
            setExpandedPaths(new Set(emptySnap.expandedPaths));
            setBookmarks([...emptySnap.bookmarks]);
            dispatchUi({ type: "reset", state: emptySnap.ui });
          } else {
            const meta = vaults.find((m) => m.id === activeId);
            const snap = loadSnapshotWithSshBridge(activeId, meta);
            setTreeRoot(snap.tree);
            setNoteContents({ ...snap.noteContents });
            setExpandedPaths(new Set(snap.expandedPaths));
            setBookmarks([...snap.bookmarks]);
            dispatchUi({ type: "reset", state: snap.ui });
            scheduleGitTreeRefresh(activeId, meta);
          }
        }
      } catch {
        /* mantem estado inicial (localStorage / migracao) */
      }

      if (cancelled) return;
      const pending = readAndConsumePendingAgentProject();
      if (pending?.projectType === "agent_squad" && pending.squadMission?.trim()) {
        const meta = metas.find((m) => m.id === activeId);
        if (meta && activeId) {
          const parentPath = meta.kind === "openclaw" ? "openclaw/workspace" : "vault-root";
          const snap = loadSnapshotWithSshBridge(activeId, meta);
          const md = `# Missão da equipe — ${pending.vaultName}\n\n${pending.squadMission.trim()}\n`;
          const next = applyMissionMarkdownToSnapshot(snap, parentPath, md);
          saveSnapshot(activeId, next);
          setTreeRoot(next.tree);
          setNoteContents((prev) => ({ ...prev, ...next.noteContents }));
          setExpandedPaths((p) => {
            const n = new Set(p);
            n.add(parentPath);
            for (const anc of treePathAncestors(parentPath)) {
              n.add(anc);
            }
            return n;
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scheduleGitTreeRefresh]);

  useEffect(() => {
    if (!activeVaultId) return;
    const snap: VaultSnapshotV1 = {
      v: 1,
      tree: treeRoot,
      noteContents,
      expandedPaths: [...expandedPaths],
      bookmarks,
      ui,
    };
    saveSnapshot(activeVaultId, snap);
  }, [activeVaultId, treeRoot, noteContents, expandedPaths, bookmarks, ui]);

  useEffect(() => {
    if (!isBackendSyncVaultId(activeVaultId)) {
      syncAbortRef.current?.abort();
      setGiteaSyncStatus("idle");
      return;
    }
    if (usesLazyGitRemote(activeVaultId, activeVaultMeta)) {
      syncAbortRef.current?.abort();
      setGiteaSyncStatus("idle");
      return;
    }
    const t = window.setTimeout(() => {
      void runVaultGiteaSync(activeVaultId);
    }, 3000);
    return () => window.clearTimeout(t);
  }, [treeRoot, noteContents, activeVaultId, activeVaultMeta, runVaultGiteaSync]);

  useEffect(() => {
    return () => {
      syncAbortRef.current?.abort();
      gitTreeAbortRef.current?.abort();
    };
  }, []);

  const switchVault = useCallback(
    (nextId: string) => {
      if (!nextId || nextId === activeVaultId) return;
      if (activeVaultId) {
        const fromSnap: VaultSnapshotV1 = {
          v: 1,
          tree: treeRoot,
          noteContents,
          expandedPaths: [...expandedPaths],
          bookmarks,
          ui,
        };
        saveSnapshot(activeVaultId, fromSnap);
      }
      const nextMeta = vaultMetas.find((m) => m.id === nextId);
      const snap = loadSnapshotWithSshBridge(nextId, nextMeta);
      setActiveVaultId(nextId);
      writeActiveVaultId(nextId);
      setTreeRoot(snap.tree);
      setNoteContents({ ...snap.noteContents });
      setExpandedPaths(new Set(snap.expandedPaths));
      setBookmarks([...snap.bookmarks]);
      dispatchUi({ type: "reset", state: snap.ui });
      setFolderSearch(null);
      setRevealTarget(null);
      setBlobLoadError(null);
      setBlobLoadingDocId(null);
      scheduleGitTreeRefresh(nextId, nextMeta);
    },
    [
      activeVaultId,
      treeRoot,
      noteContents,
      expandedPaths,
      bookmarks,
      ui,
      vaultMetas,
      scheduleGitTreeRefresh,
    ]
  );

  const removeVault = useCallback(
    async (id: string) => {
      const target = vaultMetas.find((m) => m.id === id);
      if (target?.managedByProfile) {
        try {
          await apiRequest<{ ok: boolean }>("/api/vaults/unlink-agent-vault", {
            method: "POST",
            body: { vaultId: id },
          });
        } catch {
          window.alert(
            "Nao foi possivel remover o vault ligado ao agente (servidor ou perfil). Tente de novo.",
          );
          return;
        }
      } else if (isBackendSyncVaultId(id)) {
        try {
          await apiRequest(`/api/vaults/saved?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
        } catch {
          window.alert("Nao foi possivel remover este vault no servidor.");
          return;
        }
      }
      const nextMetas = vaultMetas.filter((m) => m.id !== id);
      writeVaultMetas(nextMetas);
      setVaultMetas(nextMetas);
      try {
        localStorage.removeItem(vaultSnapshotKey(id));
      } catch {
        /* ignore */
      }

      if (id === activeVaultId) {
        const nextId = nextMetas[0]?.id ?? "";
        const nextMeta = nextMetas[0];
        setActiveVaultId(nextId);
        writeActiveVaultId(nextId);
        if (!nextId) {
          clearActiveVaultId();
          const emptySnap = emptyVaultPlaceholderSnapshot();
          setTreeRoot(emptySnap.tree);
          setNoteContents({ ...emptySnap.noteContents });
          setExpandedPaths(new Set(emptySnap.expandedPaths));
          setBookmarks([...emptySnap.bookmarks]);
          dispatchUi({ type: "reset", state: emptySnap.ui });
        } else {
          const snap = loadSnapshotWithSshBridge(nextId, nextMeta);
          setTreeRoot(snap.tree);
          setNoteContents({ ...snap.noteContents });
          setExpandedPaths(new Set(snap.expandedPaths));
          setBookmarks([...snap.bookmarks]);
          dispatchUi({ type: "reset", state: snap.ui });
          setBlobLoadError(null);
          setBlobLoadingDocId(null);
          scheduleGitTreeRefresh(nextId, nextMeta);
        }
        setFolderSearch(null);
        setRevealTarget(null);
      }
    },
    [vaultMetas, activeVaultId, scheduleGitTreeRefresh]
  );

  useEffect(() => {
    const vid = searchParams.get("vault");
    if (!vid) return;
    if (!vaultMetas.some((m) => m.id === vid)) return;
    if (vid === activeVaultId) {
      router.replace("/vault", { scroll: false });
      return;
    }
    switchVault(vid);
    router.replace("/vault", { scroll: false });
  }, [searchParams, vaultMetas, activeVaultId, switchVault, router]);

  const treeChildren = treeRoot.type === "dir" ? treeRoot.children : [];
  const treeStats = useMemo(() => countTreeStats(treeChildren), [treeChildren]);
  const rootExplorerLabel =
    activeVaultMeta?.kind === "openclaw" ? OPENCLAW_ROOT_LABEL : (activeVaultMeta?.pathLabel ?? "~");
  const graphData = useMemo(
    () => buildGraphFromVault(treeRoot, noteContents),
    [treeRoot, noteContents]
  );
  const topTags = useMemo(
    () => computeTopTags(treeRoot, noteContents),
    [treeRoot, noteContents]
  );

  const { viewMode, openTabs, activeTabId } = ui;
  const activeDoc = activeTabId ? DOC_BY_ID[activeTabId] : undefined;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("files");
  const [treeSortOrder, setTreeSortOrder] = useState<TreeSortOrder>("default");
  const [histPast, setHistPast] = useState<string[]>([]);
  const [histFuture, setHistFuture] = useState<string[]>([]);
  const [editorSourceMode, setEditorSourceMode] = useState(false);

  useEffect(() => {
    setHistPast([]);
    setHistFuture([]);
  }, [activeVaultId]);

  useEffect(() => {
    setEditorSourceMode(false);
  }, [activeTabId]);

  useEffect(() => {
    setExplorerInlineRename(null);
  }, [activeVaultId]);

  const defaultNewItemParent = useMemo(() => {
    if (treeRoot.type !== "dir") return "openclaw-root";
    if (activeVaultMeta?.kind === "openclaw") {
      if (findDir(treeRoot.children, "openclaw/workspace")) return "openclaw/workspace";
    }
    return treeRoot.path;
  }, [treeRoot, activeVaultMeta?.kind]);

  const browseSelectFile = useCallback(
    (id: string) => {
      if (id !== activeTabId && activeTabId) {
        setHistPast((p) => [...p, activeTabId]);
        setHistFuture([]);
      }
      dispatchUi({ type: "open", id });
    },
    [activeTabId]
  );

  useEffect(() => {
    if (!activeTabId) return;
    if (
      !usesLazyGitRemote(activeVaultId, activeVaultMeta) ||
      DOC_BY_ID[activeTabId] ||
      activeTabId === GIT_LAZY_PLACEHOLDER_DOC_ID
    ) {
      return;
    }
    if (noteContentsRef.current[activeTabId] !== undefined) return;

    setBlobLoadError(null);
    setBlobLoadingDocId(activeTabId);
    let cancelled = false;
    void (async () => {
      try {
        const { content } = await fetchVaultGitBlob(activeVaultId, activeTabId);
        if (cancelled) return;
        setNoteContents((prev) => ({ ...prev, [activeTabId]: content }));
      } catch {
        if (!cancelled) {
          setBlobLoadError("Nao foi possivel carregar o ficheiro.");
        }
      } finally {
        if (!cancelled) {
          setBlobLoadingDocId((cur) => (cur === activeTabId ? null : cur));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTabId, activeVaultId, activeVaultMeta]);

  const migrateDocPrefixes = useCallback(
    (from: string, to: string) => {
      if (from === to) return;
      setNoteContents((prev) => applyNoteContentsDocPrefixMigration(prev, from, to));
      const openIds = [...new Set([...openTabs, activeTabId].filter(Boolean))];
      const map = buildDocIdRemapFromPrefixes(from, to, openIds);
      if (Object.keys(map).length > 0) dispatchUi({ type: "remapDocIds", map });
    },
    [openTabs, activeTabId]
  );

  const explorerRenameSessionRef = useRef(explorerInlineRename);
  explorerRenameSessionRef.current = explorerInlineRename;

  const commitExplorerInlineRename = useCallback(() => {
    const session = explorerRenameSessionRef.current;
    if (!session) return;
    const trimmed = session.draft.trim();
    if (!trimmed) {
      setExplorerInlineRename(null);
      return;
    }
    if (trimmed === session.initialName) {
      setExplorerInlineRename(null);
      return;
    }
    if (session.kind === "file") {
      const r = renameFile(treeRoot, session.docId, trimmed);
      if (!r.ok) {
        window.alert(r.reason);
        return;
      }
      setTreeRoot(r.root);
      if (r.newDocId && r.newDocId !== session.docId) {
        setNoteContents((prev) => {
          const next = { ...prev };
          const v = next[session.docId];
          if (v !== undefined) {
            delete next[session.docId];
            next[r.newDocId!] = v;
          }
          return next;
        });
        dispatchUi({ type: "replaceDoc", from: session.docId, to: r.newDocId });
      }
    } else {
      const r = renameDirectory(treeRoot, session.treePath, trimmed);
      if (!r.ok) {
        window.alert(r.reason);
        return;
      }
      setTreeRoot(r.root);
      migrateDocPrefixes(r.docPrefixFrom, r.docPrefixTo);
    }
    setExplorerInlineRename(null);
  }, [treeRoot, migrateDocPrefixes]);

  const cancelExplorerInlineRename = useCallback(() => setExplorerInlineRename(null), []);

  const setExplorerRenameDraft = useCallback((draft: string) => {
    setExplorerInlineRename((prev) => (prev ? { ...prev, draft } : null));
  }, []);

  const skipExplorerRenameBlurCommitRef = useRef(false);

  const explorerRenameTargetKey = useMemo(() => {
    if (!explorerInlineRename) return null;
    return explorerInlineRename.kind === "file"
      ? `f:${explorerInlineRename.parentTreePath}:${explorerInlineRename.docId}`
      : `d:${explorerInlineRename.treePath}`;
  }, [explorerInlineRename]);

  /** Evita commit no blur disparado ao fechar o menu de contexto / restauração de foco. */
  useEffect(() => {
    if (explorerRenameTargetKey === null) return;
    skipExplorerRenameBlurCommitRef.current = true;
    let cancelled = false;
    const id1 = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        skipExplorerRenameBlurCommitRef.current = false;
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id1);
    };
  }, [explorerRenameTargetKey]);

  const openExplorerInlineRename = useCallback((session: NonNullable<ExplorerInlineRenameState>) => {
    queueMicrotask(() => setExplorerInlineRename(session));
  }, []);

  const bumpExplorerTree = useCallback(() => setExplorerTreeNonce((n) => n + 1), []);

  const openExplorerDeleteDialog = useCallback((items: ExplorerItemRef[]) => {
    if (items.length === 0) return;
    setExplorerDeleteItems(items);
  }, []);

  const performExplorerMoveToFolder = useCallback(
    (targetParentPath: string, items: ExplorerItemRef[]) => {
      if (treeRoot.type !== "dir") return;
      const r = moveExplorerItemsToParent(treeRoot, items, targetParentPath);
      if (!r.ok) {
        window.alert(r.reason);
        return;
      }
      setTreeRoot(r.root);
      for (const { from, to } of r.prefixMigrations) {
        migrateDocPrefixes(from, to);
      }
      for (const { from, to } of r.docIdReplacements) {
        setNoteContents((prev) => {
          const next = { ...prev };
          const v = next[from];
          if (v !== undefined) {
            delete next[from];
            next[to] = v;
          }
          return next;
        });
        dispatchUi({ type: "replaceDoc", from, to });
      }
      bumpExplorerTree();
    },
    [treeRoot, migrateDocPrefixes, bumpExplorerTree]
  );

  const confirmExplorerDeleteFromDialog = useCallback(() => {
    if (!explorerDeleteItems || treeRoot.type !== "dir") return;
    const r = deleteExplorerItems(treeRoot, explorerDeleteItems);
    if (!r.ok) {
      window.alert(r.reason);
      return;
    }
    setTreeRoot(r.root);
    dispatchUi({ type: "closeMany", ids: r.closedDocIds });
    setNoteContents((prev) => {
      const next = { ...prev };
      for (const id of r.closedDocIds) delete next[id];
      return next;
    });
    setExplorerDeleteItems(null);
    bumpExplorerTree();
  }, [explorerDeleteItems, treeRoot, bumpExplorerTree]);

  const explorerDeleteDialogCopy = useMemo(() => {
    if (!explorerDeleteItems?.length) return { title: "", body: "" };
    const n = explorerDeleteItems.length;
    const title = n === 1 ? "Apagar item?" : `Apagar ${n} itens?`;
    const lines: string[] = [];
    for (const it of explorerDeleteItems.slice(0, 10)) {
      if (it.kind === "file") {
        const name = findFileNameForDocId(treeChildren, it.docId) ?? it.docId;
        lines.push(`• ${name}`);
      } else {
        const d = findDir(treeChildren, it.path);
        lines.push(`• ${d?.name ?? it.path}`);
      }
    }
    if (n > 10) lines.push(`… e mais ${n - 10}`);
    const body = `${lines.join("\n")}\n\nEsta ação não pode ser desfeita.`;
    return { title, body };
  }, [explorerDeleteItems, treeChildren]);

  const goNavBack = useCallback(() => {
    if (histPast.length === 0) return;
    const prev = histPast[histPast.length - 1];
    setHistPast((p) => p.slice(0, -1));
    if (activeTabId) setHistFuture((f) => [activeTabId, ...f]);
    dispatchUi({ type: "open", id: prev });
  }, [histPast, activeTabId]);

  const goNavForward = useCallback(() => {
    if (histFuture.length === 0) return;
    const next = histFuture[0];
    setHistFuture((f) => f.slice(1));
    if (activeTabId) setHistPast((p) => [...p, activeTabId]);
    dispatchUi({ type: "open", id: next });
  }, [histFuture, activeTabId]);

  const cycleTreeSort = useCallback(() => {
    setTreeSortOrder((o) => (o === "default" ? "name" : o === "name" ? "name-desc" : "default"));
  }, []);

  const selectFile = useCallback((id: string) => {
    dispatchUi({ type: "open", id });
  }, []);

  const closeTab = useCallback((id: string) => {
    dispatchUi({ type: "close", id });
  }, []);

  const activateTab = useCallback((id: string) => {
    dispatchUi({ type: "activate", id });
  }, []);

  const openGraph = useCallback(() => {
    dispatchUi({ type: "showGraph" });
  }, []);

  const graphHighlightId = activeTabId || null;

  const editorBreadcrumb = useMemo(
    () => findDocBreadcrumbFromEntries(treeChildren, activeTabId || ""),
    [treeChildren, activeTabId]
  );
  const editorBreadcrumbLabel = editorBreadcrumb.join(" / ");

  const handleExplorerCommand = useCallback(
    (cmd: ExplorerCommand) => {
      if (!activeVaultId || treeRoot.type !== "dir") return;

      switch (cmd.type) {
        case "new-note": {
          const r = addNoteToParent(treeRoot, cmd.parentTreePath);
          if (!r.ok) {
            window.alert(r.reason);
            return;
          }
          setTreeRoot(r.root);
          const title = r.fileName.replace(/\.md$/i, "");
          const body = `# ${title}\n\n`;
          setNoteContents((prev) => ({ ...prev, [r.docId]: body }));
          browseSelectFile(r.docId);
          setExpandedPaths((p) => new Set([...p, cmd.parentTreePath]));
          break;
        }
        case "new-folder": {
          const r = addFolderToParent(treeRoot, cmd.parentTreePath);
          if (!r.ok) {
            window.alert(r.reason);
            return;
          }
          setTreeRoot(r.root);
          setExpandedPaths((p) => new Set([...p, cmd.parentTreePath, r.path]));
          break;
        }
        case "new-canvas": {
          const r = addCanvasToParent(treeRoot, cmd.parentTreePath);
          if (!r.ok) {
            window.alert(r.reason);
            return;
          }
          setTreeRoot(r.root);
          const body = '{\n  "nodes": [],\n  "edges": []\n}\n';
          setNoteContents((prev) => ({ ...prev, [r.docId]: body }));
          browseSelectFile(r.docId);
          setExpandedPaths((p) => new Set([...p, cmd.parentTreePath]));
          break;
        }
        case "new-base": {
          const r = addBaseToParent(treeRoot, cmd.parentTreePath);
          if (!r.ok) {
            window.alert(r.reason);
            return;
          }
          setTreeRoot(r.root);
          setNoteContents((prev) => ({ ...prev, [r.docId]: "{}\n" }));
          browseSelectFile(r.docId);
          setExpandedPaths((p) => new Set([...p, cmd.parentTreePath]));
          break;
        }
        case "duplicate": {
          const r = duplicateFile(treeRoot, cmd.docId);
          if (!r.ok) {
            window.alert(r.reason);
            return;
          }
          setTreeRoot(r.root);
          const src = noteMarkdown(cmd.docId, noteContents);
          const copyId = r.newDocId;
          if (!copyId) break;
          setNoteContents((prev) => ({ ...prev, [copyId]: src }));
          browseSelectFile(copyId);
          break;
        }
        case "move-file": {
          const dest = window.prompt(
            "Caminho da pasta de destino (ex.: openclaw/workspace/skills):",
            "openclaw/workspace"
          );
          if (dest === null || !dest.trim()) return;
          const targetPath = dest.trim();
          const destExists =
            treeRoot.type === "dir" && targetPath === treeRoot.path
              ? true
              : findDir(treeRoot.children, targetPath) != null;
          if (!destExists) {
            window.alert("Pasta não encontrada. Use um caminho como openclaw/workspace/memory.");
            return;
          }
          const r = moveFile(treeRoot, cmd.docId, targetPath);
          if (!r.ok) {
            window.alert(r.reason);
            return;
          }
          setTreeRoot(r.root);
          if (r.newDocId && r.newDocId !== cmd.docId) {
            setNoteContents((prev) => {
              const next = { ...prev };
              const v = next[cmd.docId];
              if (v !== undefined) {
                delete next[cmd.docId];
                next[r.newDocId!] = v;
              }
              return next;
            });
            dispatchUi({ type: "replaceDoc", from: cmd.docId, to: r.newDocId });
          }
          break;
        }
        case "move-folder": {
          const dest = window.prompt(
            "Caminho da pasta pai de destino (ex.: openclaw/workspace):",
            "openclaw/workspace"
          );
          if (dest === null || !dest.trim()) return;
          const targetPath = dest.trim();
          const destFolderExists =
            treeRoot.type === "dir" && targetPath === treeRoot.path
              ? true
              : findDir(treeRoot.children, targetPath) != null;
          if (!destFolderExists) {
            window.alert("Pasta de destino não encontrada.");
            return;
          }
          const r = moveDirectory(treeRoot, cmd.treePath, targetPath);
          if (!r.ok) {
            window.alert(r.reason);
            return;
          }
          setTreeRoot(r.root);
          migrateDocPrefixes(r.docPrefixFrom, r.docPrefixTo);
          break;
        }
        case "search-in-folder": {
          setFolderSearch({ path: cmd.treePath, query: "" });
          setExpandedPaths((p) => new Set([...p, ...treePathAncestors(cmd.treePath), cmd.treePath]));
          break;
        }
        case "bookmark": {
          const t = cmd.target;
          if (t.kind === "pane") return;
          if (t.kind === "file") {
            const b: VaultBookmark = { kind: "file", docId: t.docId, label: t.name };
            setBookmarks((prev) => {
              if (prev.some((x) => x.kind === "file" && x.docId === t.docId)) return prev;
              return [...prev, b];
            });
          } else {
            const b: VaultBookmark = { kind: "folder", path: t.treePath, label: t.name };
            setBookmarks((prev) => {
              if (prev.some((x) => x.kind === "folder" && x.path === t.treePath)) return prev;
              return [...prev, b];
            });
          }
          break;
        }
        case "show-in-folder": {
          const t = cmd.target;
          if (t.kind === "pane") return;
          if (t.kind === "file") {
            setRevealTarget({ type: "file", docId: t.docId });
            const anc = findAncestorDirPathsForDoc(treeChildren, t.docId);
            setExpandedPaths((p) => new Set([...p, ...anc]));
          } else {
            setRevealTarget({ type: "folder", path: t.treePath });
            setExpandedPaths((p) => new Set([...p, ...treePathAncestors(t.treePath), t.treePath]));
          }
          setFolderSearch(null);
          break;
        }
        case "rename": {
          const t = cmd.target;
          if (t.kind === "pane") return;
          if (t.kind === "file") {
            openExplorerInlineRename({
              kind: "file",
              docId: t.docId,
              parentTreePath: t.parentTreePath,
              draft: t.name,
              initialName: t.name,
            });
          } else {
            openExplorerInlineRename({
              kind: "folder",
              treePath: t.treePath,
              draft: t.name,
              initialName: t.name,
            });
          }
          break;
        }
        case "delete": {
          const t = cmd.target;
          if (t.kind === "pane") return;
          if (t.kind === "file") {
            openExplorerDeleteDialog([{ kind: "file", docId: t.docId }]);
          } else {
            openExplorerDeleteDialog([{ kind: "folder", path: t.treePath }]);
          }
          break;
        }
        default:
          break;
      }
    },
    [
      activeVaultId,
      treeRoot,
      noteContents,
      treeChildren,
      browseSelectFile,
      migrateDocPrefixes,
      openExplorerDeleteDialog,
      openExplorerInlineRename,
    ]
  );

  const clearRevealTarget = useCallback(() => setRevealTarget(null), []);

  const quickNewNoteFromToolbar = useCallback(() => {
    handleExplorerCommand({ type: "new-note", parentTreePath: defaultNewItemParent });
  }, [handleExplorerCommand, defaultNewItemParent]);

  const quickNewFolderFromToolbar = useCallback(() => {
    handleExplorerCommand({ type: "new-folder", parentTreePath: defaultNewItemParent });
  }, [handleExplorerCommand, defaultNewItemParent]);

  const collapseAllFolders = useCallback(() => setExpandedPaths(new Set()), []);

  const vaultStatsLine = `${treeStats.files} arquivos, ${treeStats.folders} pastas`;
  const noVault = vaultMetas.length === 0;

  return (
    <>
      <div className="flex h-full overflow-hidden">
        {sidebarCollapsed ? (
          <div className="flex w-8 shrink-0 flex-col border-r border-border bg-sidebar/30 py-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="mx-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Mostrar explorador de arquivos"
              aria-label="Mostrar explorador de arquivos"
            >
              <PanelLeft className="size-4" />
            </button>
          </div>
        ) : (
          <FileTree
            treeRootLabel={rootExplorerLabel}
            treeRootPath={treeRoot.type === "dir" ? treeRoot.path : "openclaw-root"}
            treeChildren={treeChildren}
            selectedId={activeTabId || null}
            onSelect={browseSelectFile}
            expandedPaths={expandedPaths}
            onToggleDir={(path) =>
              setExpandedPaths((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              })
            }
            folderSearch={folderSearch}
            onFolderSearchChange={setFolderSearch}
            bookmarks={bookmarks}
            onOpenBookmark={(b) => {
              if (b.kind === "file") browseSelectFile(b.docId);
              else {
                setFolderSearch(null);
                setRevealTarget({ type: "folder", path: b.path });
                setExpandedPaths((p) => new Set([...p, ...treePathAncestors(b.path), b.path]));
              }
            }}
            onRemoveBookmark={(b) => {
              setBookmarks((prev) =>
                prev.filter((x) =>
                  b.kind === "file"
                    ? !(x.kind === "file" && x.docId === b.docId)
                    : !(x.kind === "folder" && x.path === b.path)
                )
              );
            }}
            revealTarget={revealTarget}
            onRevealHandled={clearRevealTarget}
            onExplorerCommand={handleExplorerCommand}
            vaultMetas={vaultMetas}
            activeVaultId={activeVaultId}
            activeVaultName={activeVaultMeta?.name ?? "cofre"}
            vaultPathTooltip={activeVaultMeta?.pathLabel ?? ""}
            vaultStatsLine={vaultStatsLine}
            onSelectVault={switchVault}
            onOpenManageVaults={() => setManageVaultsOpen(true)}
            sidebarMode={sidebarMode}
            onSidebarModeChange={setSidebarMode}
            treeSortOrder={treeSortOrder}
            onCycleSort={cycleTreeSort}
            onQuickNewNote={quickNewNoteFromToolbar}
            onQuickNewFolder={quickNewFolderFromToolbar}
            onCollapseAllFolders={collapseAllFolders}
            onCollapseSidebar={() => setSidebarCollapsed(true)}
            explorerInlineRename={explorerInlineRename}
            onExplorerRenameDraftChange={setExplorerRenameDraft}
            onExplorerRenameCommit={commitExplorerInlineRename}
            onExplorerRenameCancel={cancelExplorerInlineRename}
            skipExplorerRenameBlurCommitRef={skipExplorerRenameBlurCommitRef}
            explorerTreeNonce={explorerTreeNonce}
            vaultTreeRoot={treeRoot}
            onOpenExplorerDeleteDialog={openExplorerDeleteDialog}
            onMoveExplorerItemsToFolder={performExplorerMoveToFolder}
            onExplorerNewNote={() =>
              handleExplorerCommand({ type: "new-note", parentTreePath: defaultNewItemParent })
            }
            onExplorerNewFolder={() =>
              handleExplorerCommand({ type: "new-folder", parentTreePath: defaultNewItemParent })
            }
            onExplorerRenameRow={(row) => {
              if (row.kind === "file") {
                openExplorerInlineRename({
                  kind: "file",
                  docId: row.docId,
                  parentTreePath: row.parentTreePath,
                  draft: row.name,
                  initialName: row.name,
                });
              } else {
                openExplorerInlineRename({
                  kind: "folder",
                  treePath: row.path,
                  draft: row.name,
                  initialName: row.name,
                });
              }
            }}
          />
        )}

      {noVault ? (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto bg-background px-6 py-12 text-center">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Nenhum cofre</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Crie um cofre para guardar notas, ligar ao agente e sincronizar com o servidor.
          </p>
          <Link
            href="/vaults/new"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Criar primeiro cofre
          </Link>
        </div>
      ) : (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border bg-card/30 px-1">
          <TabButton active={viewMode === "graph"} onClick={openGraph}>
            <GitBranch className="size-3.5" />
            Grafo
          </TabButton>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:thin]">
            {openTabs.map((id) => (
              <FileTab
                key={id}
                fileId={id}
                active={viewMode === "editor" && activeTabId === id}
                onSelect={() => activateTab(id)}
                onClose={() => closeTab(id)}
              />
            ))}
          </div>
          <button
            type="button"
            title="Nova nota (nova aba)"
            onClick={quickNewNoteFromToolbar}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Nova aba"
          >
            <Plus className="size-4" />
          </button>
          <Menu.Root>
            <Menu.Trigger className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground data-popup-open:bg-muted">
              <ChevronDown className="size-4" aria-label="Lista de abas" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="z-[210] outline-none" side="bottom" align="end" sideOffset={4}>
                <Menu.Popup
                  className={cn(
                    "min-w-[200px] origin-[var(--transform-origin)] rounded-lg border border-border bg-card py-1 shadow-lg",
                    "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
                  )}
                >
                  {openTabs.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma aba</div>
                  ) : (
                    openTabs.map((id) => (
                      <Menu.Item
                        key={id}
                        className={vaultChromeMenuItemClass}
                        onClick={() => activateTab(id)}
                      >
                        <span className="min-w-0 truncate font-mono text-xs">{id}</span>
                        {id === activeTabId && <Check className="ml-auto size-3.5 shrink-0" aria-hidden />}
                      </Menu.Item>
                    ))
                  )}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <button
            type="button"
            disabled
            title="Dividir editor (em breve)"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-40"
            aria-label="Dividir editor"
          >
            <Columns className="size-4" />
          </button>
          {isBackendSyncVaultId(activeVaultId) ? (
            <div className="ml-0.5 flex shrink-0 border-l border-border/60 pl-1.5">
              <button
                type="button"
                title={
                  giteaSyncStatus === "syncing"
                    ? "A sincronizar com o Gitea…"
                    : giteaSyncStatus === "synced"
                      ? "Sincronizado com o Gitea"
                      : giteaSyncStatus === "error"
                        ? "Erro ao sincronizar — clique para tentar de novo"
                        : `Sincronizar com o Gitea${activeVaultMeta?.pathLabel ? ` (${activeVaultMeta.pathLabel})` : ""}`
                }
                onClick={() => void runVaultGiteaSync(activeVaultId)}
                disabled={giteaSyncStatus === "syncing"}
                aria-label={
                  giteaSyncStatus === "syncing"
                    ? "A sincronizar com o Gitea"
                    : giteaSyncStatus === "synced"
                      ? "Sincronizado — clique para sincronizar de novo"
                      : giteaSyncStatus === "error"
                        ? "Erro na sincronização — clique para tentar de novo"
                        : "Sincronizar agora com o Gitea"
                }
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md transition-all duration-200",
                  giteaSyncStatus === "idle" &&
                    "text-muted-foreground hover:bg-muted hover:text-foreground",
                  giteaSyncStatus === "syncing" &&
                    "cursor-wait text-sky-600 ring-2 ring-sky-500/45 motion-safe:animate-pulse dark:text-sky-400 dark:ring-sky-400/40 disabled:opacity-100",
                  giteaSyncStatus === "synced" &&
                    "text-emerald-600 shadow-[0_0_10px_-2px_rgba(16,185,129,0.55)] hover:bg-emerald-500/10 dark:text-emerald-400 dark:shadow-[0_0_12px_-2px_rgba(52,211,153,0.4)]",
                  giteaSyncStatus === "error" &&
                    "text-destructive ring-2 ring-destructive/40 hover:bg-destructive/10 motion-safe:animate-pulse",
                )}
              >
                <CloudUpload
                  className={cn(
                    "size-4",
                    giteaSyncStatus === "syncing" && "motion-safe:scale-110",
                  )}
                />
              </button>
            </div>
          ) : null}
        </div>

        {viewMode === "editor" && activeTabId ? (
          <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border bg-card/20 px-1">
            <button
              type="button"
              disabled={histPast.length === 0}
              onClick={goNavBack}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              title="Voltar"
              aria-label="Voltar"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              disabled={histFuture.length === 0}
              onClick={goNavForward}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              title="Avançar"
              aria-label="Avançar"
            >
              <ChevronRight className="size-4" />
            </button>
            <span
              className="min-w-0 flex-1 truncate text-center font-mono text-[10px] text-muted-foreground sm:text-[11px]"
              title={editorBreadcrumbLabel}
            >
              {editorBreadcrumbLabel}
            </span>
            <button
              type="button"
              disabled
              title="Modo leitura (em breve)"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-40"
              aria-label="Modo leitura"
            >
              <BookOpen className="size-4" />
            </button>
            <Menu.Root>
              <Menu.Trigger className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground data-popup-open:bg-muted">
                <MoreVertical className="size-4" aria-label="Mais opções" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner className="z-[210] outline-none" side="bottom" align="end" sideOffset={4}>
                  <Menu.Popup
                    className={cn(
                      "min-w-[180px] origin-[var(--transform-origin)] rounded-lg border border-border bg-card py-1 shadow-lg",
                      "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
                    )}
                  >
                    <Menu.Item className={vaultChromeMenuItemClass} onClick={() => quickNewNoteFromToolbar()}>
                      Nova nota
                    </Menu.Item>
                    <Menu.Item className={vaultChromeMenuItemClass} onClick={() => openGraph()}>
                      Abrir grafo
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            <button
              type="button"
              onClick={() => setEditorSourceMode((v) => !v)}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                editorSourceMode && "bg-muted text-foreground"
              )}
              title={editorSourceMode ? "Modo blocos" : "Modo fonte (Markdown)"}
              aria-pressed={editorSourceMode}
            >
              <FileCode2 className="size-4" />
            </button>
          </div>
        ) : null}

        {viewMode === "graph" ? (
          <FullGraph graph={graphData} onSelectFile={browseSelectFile} highlightId={graphHighlightId} />
        ) : openTabs.length === 0 || !activeTabId ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center font-mono text-sm text-muted-foreground">
            Nenhum arquivo aberto. Escolha um arquivo na árvore ou no grafo.
          </div>
        ) : usesLazyGitRemote(activeVaultId, activeVaultMeta) &&
          blobLoadingDocId === activeTabId ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            A carregar o ficheiro…
          </div>
        ) : usesLazyGitRemote(activeVaultId, activeVaultMeta) &&
          blobLoadError &&
          noteContents[activeTabId] === undefined ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
            {blobLoadError}
          </div>
        ) : (
          <VaultNoteEditor
            key={activeTabId}
            docId={activeTabId}
            value={
              noteContents[activeTabId] ??
              (activeDoc ? mockDocToMarkdown(activeDoc) : `# ${activeTabId}\n\n`)
            }
            onChange={(next) =>
              setNoteContents((prev) => ({ ...prev, [activeTabId]: next }))
            }
            breadcrumb={editorBreadcrumb}
            onSelectFile={browseSelectFile}
            hideTopChrome
            sourceMode={editorSourceMode}
            onSourceModeChange={setEditorSourceMode}
          />
        )}
      </div>
      )}

      <div className="flex w-[200px] shrink-0 flex-col border-l border-border bg-sidebar/30">
        {noVault ? (
          <div className="flex flex-1 items-center px-3 py-6 text-center font-mono text-[10px] leading-snug text-muted-foreground/70">
            Crie um cofre para ver backlinks e etiquetas aqui.
          </div>
        ) : viewMode === "graph" ? (
          <TagsPanel topTags={topTags} onSelect={browseSelectFile} />
        ) : openTabs.length === 0 || !activeTabId ? (
          <div className="flex flex-1 items-center px-3 py-4 font-mono text-[10px] text-muted-foreground/70">
            Abra um arquivo para ver backlinks.
          </div>
        ) : (
          <BacklinksPanel
            docId={activeTabId}
            treeChildren={treeChildren}
            noteContents={noteContents}
            onSelect={browseSelectFile}
          />
        )}
      </div>
    </div>

      <VaultManageDialog
        open={manageVaultsOpen}
        onClose={() => setManageVaultsOpen(false)}
        vaults={vaultMetas}
        activeId={activeVaultId}
        onSelectVault={(id) => switchVault(id)}
        onRemoveVault={removeVault}
      />
      <VaultExplorerDeleteConfirmDialog
        open={explorerDeleteItems !== null}
        title={explorerDeleteDialogCopy.title}
        message={explorerDeleteDialogCopy.body}
        onCancel={() => setExplorerDeleteItems(null)}
        onConfirm={confirmExplorerDeleteFromDialog}
      />
    </>
  );
}

// ─── File tab (com fechar) ─────────────────────────────────────────────────

function FileTab({
  fileId,
  active,
  onSelect,
  onClose,
}: {
  fileId: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const shortName = fileId.includes("/") ? fileId.split("/").pop() ?? fileId : fileId;

  return (
    <div
      className={cn(
        "flex max-w-[min(200px,40vw)] shrink-0 items-stretch rounded-md border font-mono text-xs transition-colors",
        active
          ? "border-sidebar-border/60 bg-sidebar-accent text-sidebar-accent-foreground"
          : "border-transparent bg-transparent text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate px-2 py-1 text-left"
        title={fileId}
      >
        {shortName}
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
    </div>
  );
}

// ─── Tab button ────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ─── Full-screen graph (main Obsidian view) ────────────────────────────────

function FullGraph({
  graph,
  onSelectFile,
  highlightId,
}: {
  graph: { nodes: GNode[]; links: GLink[] };
  onSelectFile: (id: string) => void;
  highlightId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [renderNodes, setRenderNodes] = useState<GNode[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Force simulation
  useEffect(() => {
    const { w, h } = size;
    const simNodes = graph.nodes.map((n) => ({ ...n }));
    const simLinks = graph.links.map((l) => ({ ...l }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = (forceSimulation as any)(simNodes)
      .force("charge", (forceManyBody as any)().strength(-120))
      .force(
        "link",
        (forceLink as any)(simLinks)
          .id((n: GNode) => n.id)
          .distance(60)
          .strength(0.7)
      )
      .force("center", (forceCenter as any)(w / 2, h / 2))
      .force("collide", (forceCollide as any)().radius((n: GNode) => nodeRadius(n) + 4))
      .alpha(1)
      .alphaDecay(0.03);

    sim.on("tick", () => {
      setRenderNodes(
        simNodes.map((n: GNode) => ({
          ...n,
          x: Math.max(16, Math.min(w - 16, n.x ?? w / 2)),
          y: Math.max(16, Math.min(h - 16, n.y ?? h / 2)),
        }))
      );
    });

    return () => sim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, graph]);

  // Zoom & pan
  useEffect(() => {
    const svgEl = svgRef.current;
    const layerEl = layerRef.current;
    if (!svgEl || !layerEl) return;
    const svgSel = select(svgEl);
    const layerSel = select(layerEl);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const z = (zoom as any)()
      .scaleExtent([0.15, 6])
      .filter((e: Event & { type: string; button?: number }) => {
        if (e.type === "wheel") return true;
        const t = e.target as Element | null;
        if (t?.closest?.("[data-node]")) return false;
        return !(e as MouseEvent).button;
      })
      .on("zoom", (e: { transform: { toString(): string } }) => {
        layerSel.attr("transform", e.transform.toString());
      });

    svgSel.call(z);
    svgSel.call(z.transform, zoomIdentity);
    return () => svgSel.on(".zoom", null);
  }, [size]);

  const nodeById = useMemo(() => {
    const m = new Map<string, GNode>();
    for (const n of renderNodes) m.set(n.id, n);
    return m;
  }, [renderNodes]);

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-background">
      {/* Subtle grid background */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.03]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="cursor-grab touch-none active:cursor-grabbing"
        role="img"
        aria-label="Grafo de arquivos"
      >
        <g ref={layerRef}>
          {/* Links */}
          {graph.links.map((link, i) => {
            const srcId = typeof link.source === "string" ? link.source : link.source.id;
            const tgtId = typeof link.target === "string" ? link.target : link.target.id;
            const src = nodeById.get(srcId);
            const tgt = nodeById.get(tgtId);
            if (!src || !tgt) return null;
            const isHighlighted =
              (highlightId !== null &&
                (srcId === highlightId || tgtId === highlightId)) ||
              srcId === hoverId ||
              tgtId === hoverId;
            return (
              <line
                key={`${srcId}-${tgtId}-${i}`}
                x1={src.x ?? 0}
                y1={src.y ?? 0}
                x2={tgt.x ?? 0}
                y2={tgt.y ?? 0}
                stroke={isHighlighted ? "hsl(160 68% 37%)" : "hsl(160 15% 70%)"}
                strokeWidth={isHighlighted ? 1.5 : 0.8}
                opacity={isHighlighted ? 0.9 : 0.35}
              />
            );
          })}

          {/* Nodes */}
          {renderNodes.map((node) => {
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const r = nodeRadius(node);
            const isSelected = highlightId !== null && node.id === highlightId;
            const isHovered = node.id === hoverId;
            const label = shortLabel(node.id);

            return (
              <g
                key={node.id}
                data-node
                transform={`translate(${x},${y})`}
                role="button"
                tabIndex={0}
                aria-label={`Abrir ${node.id}`}
                onClick={() => onSelectFile(node.id)}
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() => setHoverId(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectFile(node.id);
                  }
                }}
                className="cursor-pointer outline-none"
              >
                <title>{node.id}</title>
                {(isSelected || isHovered) && (
                  <circle r={r + 5} fill="hsl(160 68% 37%)" opacity="0.15" />
                )}
                <circle
                  r={r}
                  fill={
                    isSelected
                      ? "hsl(160 68% 37%)"
                      : isHovered
                        ? "hsl(160 50% 50%)"
                        : "hsl(160 20% 55%)"
                  }
                  stroke={isSelected ? "hsl(160 68% 32%)" : "none"}
                  strokeWidth={1.5}
                />
                {(r >= 5.5 || isSelected || isHovered) && (
                  <text
                    y={r + 9}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                    fontSize={isSelected ? 8 : 7}
                    fontWeight={isSelected ? "600" : "400"}
                    fill={isSelected ? "hsl(160 68% 32%)" : "hsl(160 10% 42%)"}
                    className="pointer-events-none select-none font-mono"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Tooltip hint */}
      {hoverId && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs text-foreground shadow-sm">
          {hoverId}
        </div>
      )}
    </div>
  );
}

function nodeRadius(n: GNode): number {
  const d = n.degree ?? 0;
  if (d >= 6) return 9;
  if (d >= 4) return 7;
  if (d >= 2) return 5.5;
  return 4;
}

function shortLabel(id: string): string {
  const base = id.replace(".md", "").replace("memory/", "📅 ");
  return base.length > 14 ? base.slice(0, 13) + "…" : base;
}

// ─── Tags panel (graph mode right sidebar) ─────────────────────────────────

function TagsPanel({
  topTags,
  onSelect,
}: {
  topTags: [string, number][];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <Tag className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Links
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {topTags.map(([id, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-sidebar-accent/60"
          >
            <span className="min-w-0 truncate text-muted-foreground hover:text-foreground">
              {id.replace(".md", "")}
            </span>
            <span className="ml-2 shrink-0 tabular-nums text-muted-foreground/60">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Backlinks panel (editor mode right sidebar) ───────────────────────────

function BacklinksPanel({
  docId,
  treeChildren,
  noteContents,
  onSelect,
}: {
  docId: string;
  treeChildren: TreeEntry[];
  noteContents: Record<string, string>;
  onSelect: (id: string) => void;
}) {
  const needle = `[[${docId}]]`;
  const backlinks = useMemo(() => {
    const ids = collectDocIdsFromTree(treeChildren).filter((id) => id !== docId);
    return ids.filter((id) => noteMarkdown(id, noteContents).includes(needle));
  }, [docId, treeChildren, noteContents, needle]);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Backlinks ({backlinks.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {backlinks.length === 0 ? (
          <p className="px-1 py-2 font-mono text-[10px] italic text-muted-foreground/50">
            Nenhum backlink
          </p>
        ) : (
          <ul className="space-y-0.5">
            {backlinks.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                  <span className="min-w-0 truncate">{id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── File tree ─────────────────────────────────────────────────────────────

function FileTree({
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
    [displayEntries, treeSortOrder]
  );

  const explorerFlatRows = useMemo(
    () => flattenVisibleExplorerRows(sortedEntries, expandedPaths, listParentPath),
    [sortedEntries, expandedPaths, listParentPath]
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
    [explorerAnchorIdx, explorerFlatIndexByKey, explorerFlatRows]
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
    [explorerSelKeys, explorerFlatRows]
  );

  const handleFolderDragOver = useCallback(
    (e: DragEvent, path: string) => {
      if (!isVaultExplorerDragDataTransfer(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setExplorerDragOverPath(path);
    },
    [isVaultExplorerDragDataTransfer]
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
    [onMoveExplorerItemsToFolder]
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
    [isVaultExplorerDragDataTransfer]
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
    [listParentPath, onMoveExplorerItemsToFolder]
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
    ]
  );

  const searchHits = useMemo(() => {
    const q = sidebarSearchQuery.trim().toLowerCase();
    const all = flattenTreeDocs(treeChildren);
    if (!q) return all;
    return all.filter(
      (f) => f.label.toLowerCase().includes(q) || f.docId.toLowerCase().includes(q)
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

  const iconBtn = "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";

  if (vaultMetas.length === 0) {
    return (
      <div className="flex w-[200px] shrink-0 flex-col border-r border-border bg-sidebar/30">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-3 py-8 text-center">
          <p className="text-xs text-muted-foreground">
            Nenhum cofre. Crie um para guardar notas e sincronizar com o servidor.
          </p>
          <Link
            href="/vaults/new"
            className="inline-flex w-full max-w-[11rem] items-center justify-center rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Criar primeiro cofre
          </Link>
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
            <span className="truncate font-mono text-[9px] text-muted-foreground" title={folderSearch.path}>
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
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                    )}
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/35" aria-hidden />
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

