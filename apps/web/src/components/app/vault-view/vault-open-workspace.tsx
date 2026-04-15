"use client";

/**
 * Estado principal do cofre aberto: snapshot local, URL, sync Gitea/Git lazy, editor e explorador.
 * Componente grande de propósito — a lógica está agrupada por secções; subsistemas extraídos para `./`.
 */

import { Menu } from "@base-ui/react/menu";
import {
  Check,
  ChevronDown,
  FileCode2,
  Link2,
  ListX,
  Loader2,
  MoreVertical,
  PanelLeft,
  Plus,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/api/rest/generic";
import {
  applyMissionMarkdownToSnapshot,
  countTreeStats,
  loadSnapshotWithSshBridge,
  readAndConsumePendingAgentProject,
  saveSnapshot,
  writeActiveVaultId,
  type VaultBookmark,
  type VaultMeta,
  type VaultSnapshotV1,
  type VaultUiState,
} from "@/components/app/vault-persistence";
import { VaultManageDialog } from "@/components/app/vault-switcher";
import type { ExplorerCommand } from "@/components/app/vault-explorer-context-menu";
import type { ExplorerInlineRenameState } from "@/components/app/vault-explorer-tree-view";
import { VaultNoteEditor } from "@/components/app/vault-note-editor";
import {
  addBaseToParent,
  addCanvasToParent,
  addFolderToParent,
  addNoteToParent,
  collectDocIdsFromTree,
  deleteExplorerItems,
  duplicateFile,
  findAncestorDirPathsForDoc,
  findDir,
  findFileNameForDocId,
  getParentTreePathForDoc,
  moveDirectory,
  moveExplorerItemsToParent,
  moveFile,
  pruneExpandedPathsToTree,
  renameDirectory,
  renameFile,
  type ExplorerItemRef,
} from "@/components/app/vault-tree-ops";
import {
  OPENCLAW_ROOT_LABEL,
  mockDocToMarkdown,
  type TreeEntry,
} from "@/components/marketing/openclaw-workspace-mock";
import { fetchVaultGitBlob, fetchVaultGitTree } from "@/lib/vault-git-client";
import {
  fetchVaultGitBlobQueryFn,
  LAZY_GIT_BLOB_GC_MS,
  LAZY_GIT_BLOB_STALE_MS,
  vaultGitBlobQueryKey,
  vaultGitBlobQueryKeyRoot,
} from "@/lib/vault-git-blob-query";
import {
  GIT_LAZY_PLACEHOLDER_DOC_ID,
  collectLazyGitRepoRelativePaths,
  gitTreePathsToVaultSnapshot,
  isGitKeepMarkerPath,
  isGitLazyVaultTree,
  mergeLazyGitNoteContentsAfterRemoteTree,
} from "@/lib/vault-git-tree-import";
import {
  flattenVaultTreeToSyncFiles,
  initialNoteContentsForLazyGitVault,
  isBackendSyncVaultId,
  usesLazyGitRemote,
} from "@/lib/vault-sync-flatten";
import { isVaultPlainTextDocId } from "@/lib/vault-doc-kind";
import {
  defaultClientUiSettings,
  loadClientUiSettings,
  patchClientUiSettings,
} from "@/lib/client-ui-settings";
import { findDirTreePathByRelativePath } from "@/lib/vault-url-explorer";
import { cn } from "@/lib/utils";

import { BacklinksPanel } from "./vault-backlinks-panel";
import { VaultBacklinksResizeHandle } from "./vault-backlinks-resize-handle";
import { DOC_BY_ID } from "./doc-registry";
import {
  LAZY_OPEN_TAB_PREFETCH_CONCURRENCY,
  LAZY_OPEN_TAB_PREFETCH_MAX,
  prefetchLazyGitVaultBlobs,
} from "./prefetch-lazy-git-vault-blobs";
import { buildGraphFromVault, computeTopTags, noteMarkdown } from "./vault-graph-model";
import {
  applyNoteContentsDocPrefixMigration,
  buildDocIdRemapFromPrefixes,
} from "./note-contents-migration";
import { treePathAncestors } from "./vault-path-utils";
import type { VaultPageQueryState } from "./vault-page-query-types";
import { vaultChromeMenuItemClass } from "./vault-chrome-styles";
import { VaultExplorerDeleteConfirmDialog } from "./vault-explorer-delete-dialog";
import { FileTab } from "./vault-file-tab";
import { VaultExplorerSidebarResizeHandle } from "./vault-explorer-sidebar-resize-handle";
import { FileTree } from "./vault-file-tree";
import { FullGraph } from "./vault-full-graph";
import { TagsPanel } from "./vault-tags-panel";
import { mergeVaultUiAfterGitTreeRefresh, vaultUiReducer } from "./vault-ui-reducer";
import type { SidebarMode, TreeSortOrder } from "./explorer-tree-utils";
import { vaultDocBreadcrumb } from "./vault-doc-breadcrumb";

/** Deteção de novas revisões no servidor (ex.: OpenSync Ubuntu) sem depender de sync manual na web. */
const LAZY_VAULT_REMOTE_TAIL_POLL_MS = 5000;
/** Evita o indicador "a sincronizar" em pushes rápidos (menos piscar na barra). */
const GITEA_SYNC_UI_SPIN_DELAY_MS = 280;

export type VaultOpenWorkspaceProps = {
  vaultId: string;
  activeVaultMeta: VaultMeta;
  vaultMetas: VaultMeta[];
  vaultPageQuery: VaultPageQueryState;
  setVaultPageQuery: (updates: Partial<VaultPageQueryState>) => void | Promise<unknown>;
  onActiveVaultIdChange: (id: string) => void;
  removeVault: (id: string) => Promise<void>;
};

export function VaultOpenWorkspace({
  vaultId,
  activeVaultMeta,
  vaultMetas,
  vaultPageQuery,
  setVaultPageQuery,
  onActiveVaultIdChange,
  removeVault,
}: VaultOpenWorkspaceProps) {
  const router = useRouter();

  type PendingPrefixMigration = { from: string; to: string };
  const applyPrefixMigrationsToContents = useCallback(
    (
      source: Record<string, string>,
      migrations: readonly PendingPrefixMigration[],
    ): Record<string, string> => {
      if (migrations.length === 0) return source;
      const next: Record<string, string> = {};
      for (const [docId, content] of Object.entries(source)) {
        let mappedDocId = docId;
        for (const { from, to } of migrations) {
          if (!from || from === to) continue;
          if (mappedDocId.startsWith(from)) {
            mappedDocId = `${to}${mappedDocId.slice(from.length)}`;
          }
        }
        next[mappedDocId] = content;
      }
      return next;
    },
    [],
  );
  const [manageVaultsOpen, setManageVaultsOpen] = useState(false);
  const [contentVisible, setContentVisible] = useState(
    () =>
      !vaultPageQuery.file &&
      !vaultPageQuery.folder &&
      vaultPageQuery.view !== "graph",
  );
  const [urlSyncReady, setUrlSyncReady] = useState(
    () =>
      !vaultPageQuery.file &&
      !vaultPageQuery.folder &&
      vaultPageQuery.view !== "graph",
  );

  const bootSnapRef = useRef<VaultSnapshotV1 | null>(null);
  if (bootSnapRef.current === null) {
    bootSnapRef.current = loadSnapshotWithSshBridge(vaultId, activeVaultMeta);
  }
  const bootSnap = bootSnapRef.current;

  const [ui, dispatchUi] = useReducer(vaultUiReducer, bootSnap.ui);
  const uiLatestRef = useRef<VaultUiState>(ui);
  uiLatestRef.current = ui;

  const [treeRoot, setTreeRoot] = useState<TreeEntry>(() => bootSnap.tree);
  const [noteContents, setNoteContents] = useState<Record<string, string>>(() =>
    initialNoteContentsForLazyGitVault(bootSnap, vaultId, activeVaultMeta),
  );
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(bootSnap.expandedPaths),
  );
  const [folderSearch, setFolderSearch] = useState<{ path: string; query: string } | null>(null);
  const [revealTarget, setRevealTarget] = useState<
    { type: "file"; docId: string } | { type: "folder"; path: string } | null
  >(null);
  const [bookmarks, setBookmarks] = useState<VaultBookmark[]>(() => [...bootSnap.bookmarks]);
  const [explorerInlineRename, setExplorerInlineRename] = useState<ExplorerInlineRenameState>(null);
  const [explorerDeleteItems, setExplorerDeleteItems] = useState<ExplorerItemRef[] | null>(null);
  const [explorerTreeNonce, setExplorerTreeNonce] = useState(0);
  const [giteaSyncStatus, setGiteaSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "error"
  >("idle");
  const [lazyGitQueryEpoch, setLazyGitQueryEpoch] = useState(0);
  /** Cofre Nest+snapshot local (SSH): incrementa só com edições / mutações locais — agenda sync Gitea. */
  const [fullSnapshotDirtyEpoch, setFullSnapshotDirtyEpoch] = useState(0);
  const queryClient = useQueryClient();
  const [lastGiteaCommitHash, setLastGiteaCommitHash] = useState<string | null>(null);
  const [giteaSyncError, setGiteaSyncError] = useState<string | null>(null);


  const treeRootRef = useRef(treeRoot);
  const noteContentsRef = useRef(noteContents);
  treeRootRef.current = treeRoot;
  noteContentsRef.current = noteContents;

  const syncAbortRef = useRef<AbortController | null>(null);
  const gitTreeAbortRef = useRef<AbortController | null>(null);
  /** IDs de timer do browser (compatível com tipos DOM vs Node). */
  const giteaSyncDebounceRef = useRef<number | null>(null);
  /** Marca o início do ciclo dirty para forçar sync mesmo durante digitação contínua. */
  const syncDirtyStartAtRef = useRef<number | null>(null);
  /** Apenas para vault Git lazy: notas gravadas em localStorage (reduz quota). */
  const lazyGitDirtyDocIdsRef = useRef<Set<string>>(new Set());
  /** Último `noteContents` fundido gravado em LS (lazy); evita ler o snapshot a cada tecla e preserva chaves não-dirty. */
  const lazyPersistedNoteContentsRef = useRef<Record<string, string>>({ ...bootSnap.noteContents });
  const lastBlobFetchRef = useRef<{ tab: string; commit: string | null } | null>(null);
  /** Commit (12 chars) dos blobs lazy já alinhados com `noteContents` — evita refetch ao trocar de separador. */
  const lazyGitBlobsSnapshotCommitRef = useRef<string | null>(null);
  /** Último commit com o qual `mergeLazyGitNoteContentsAfterRemoteTree` foi aplicado (evict só quando muda). */
  const lastLazyGitTreeCommitShortRef = useRef<string | null>(null);
  const pendingPrefixMigrationsRef = useRef<PendingPrefixMigration[]>([]);
  /** Git lazy: mudanças na árvore sem `docId` em `lazyGitDirtyDocIdsRef` (ex.: pasta nova vazia). */
  const lazyGitTreeDirtyRef = useRef(false);

  const activeVaultMetaRef = useRef(activeVaultMeta);
  activeVaultMetaRef.current = activeVaultMeta;
  const vaultIdRef = useRef(vaultId);
  vaultIdRef.current = vaultId;
  const prevVaultIdForBlobQueriesRef = useRef(vaultId);

  /** Referência estável do meta do vault — evita `scheduleGitTreeRefresh` a cada render do pai. */
  const lazyVaultProfileKey = useMemo(
    () =>
      `${activeVaultMeta.id}|${activeVaultMeta.kind}|${activeVaultMeta.remoteSync ?? "git"}|${activeVaultMeta.managedByProfile ? "1" : "0"}`,
    [
      activeVaultMeta.id,
      activeVaultMeta.kind,
      activeVaultMeta.remoteSync,
      activeVaultMeta.managedByProfile,
    ],
  );

  /** Último `commitHash` da API já reflectido em `lastGiteaCommitHash` (evita polls duplicados). */
  const remoteTailPollSeenRef = useRef<string | null>(null);

  const markLazyGitDirtyDoc = useCallback((docId: string) => {
    if (usesLazyGitRemote(vaultIdRef.current, activeVaultMetaRef.current)) {
      lazyGitDirtyDocIdsRef.current.add(docId);
      setLazyGitQueryEpoch((n) => n + 1);
    }
  }, []);

  const bumpLazyGitTreeDirtyForPush = useCallback(() => {
    if (!usesLazyGitRemote(vaultIdRef.current, activeVaultMetaRef.current)) return;
    lazyGitTreeDirtyRef.current = true;
    setLazyGitQueryEpoch((n) => n + 1);
  }, []);

  const bumpFullSnapshotDirtyForPush = useCallback(() => {
    if (!isBackendSyncVaultId(vaultIdRef.current)) return;
    if (usesLazyGitRemote(vaultIdRef.current, activeVaultMetaRef.current)) return;
    setFullSnapshotDirtyEpoch((e) => e + 1);
  }, []);

  const hasPendingRemoteSync = useCallback(
    (targetVaultId: string, targetMeta: VaultMeta | undefined) => {
      if (!isBackendSyncVaultId(targetVaultId)) return false;
      if (usesLazyGitRemote(targetVaultId, targetMeta)) {
        return lazyGitDirtyDocIdsRef.current.size > 0 || lazyGitTreeDirtyRef.current;
      }
      return fullSnapshotDirtyEpoch > 0;
    },
    [fullSnapshotDirtyEpoch],
  );

  const refreshGitTreeAfterSync = useCallback((vaultId: string) => {
    gitTreeAbortRef.current?.abort();
    const ac = new AbortController();
    gitTreeAbortRef.current = ac;
    void (async () => {
      try {
        const data = await fetchVaultGitTree(vaultId, { signal: ac.signal });
        if (ac.signal.aborted) return;
        const remotePaths = data.entries.map((e) => e.path);
        const remoteTail = data.commitHash.trim();
        const prevRoot = treeRootRef.current;
        const localPaths = isGitLazyVaultTree(prevRoot)
          ? collectLazyGitRepoRelativePaths(prevRoot)
          : [];
        const unionPaths = [...new Set([...remotePaths, ...localPaths])];
        const pathsForSnapshot =
          unionPaths.length > 0 ? unionPaths : remotePaths.length > 0 ? remotePaths : [];
        const next = gitTreePathsToVaultSnapshot(pathsForSnapshot);
        const allowed = new Set(
          pathsForSnapshot.length > 0 ? pathsForSnapshot : remotePaths,
        );
        if (allowed.size === 0) {
          allowed.add(GIT_LAZY_PLACEHOLDER_DOC_ID);
        }
        const evictRemoteCachedBodies =
          lastLazyGitTreeCommitShortRef.current !== null &&
          remoteTail !== lastLazyGitTreeCommitShortRef.current;
        setLastGiteaCommitHash(remoteTail);
        remoteTailPollSeenRef.current = remoteTail;
        setTreeRoot(next.tree);
        setExpandedPaths((prev) => pruneExpandedPathsToTree(next.tree, prev));
        setNoteContents((prev) => {
          const merged = mergeLazyGitNoteContentsAfterRemoteTree(
            prev,
            next.noteContents,
            remotePaths,
            allowed,
            lazyGitDirtyDocIdsRef.current,
            evictRemoteCachedBodies,
          );
          noteContentsRef.current = merged;
          lazyPersistedNoteContentsRef.current = merged;
          return merged;
        });
        lastLazyGitTreeCommitShortRef.current = remoteTail;
        lastBlobFetchRef.current = null;
        lazyGitBlobsSnapshotCommitRef.current = null;
        lazyGitDirtyDocIdsRef.current.clear();
        await prefetchLazyGitVaultBlobs(vaultId, remotePaths, ac.signal, {
          queryClient,
          noteContentsRef,
          lazyGitDirtyDocIdsRef,
          setNoteContents,
          uiLatestRef,
          lastBlobFetchRef,
          blobsSnapshotCommitRef: lazyGitBlobsSnapshotCommitRef,
          commitShort: remoteTail,
        });
      } catch {
        /* arvore local mantem-se; commit ja veio do push */
      }
    })();
  }, [queryClient]);

  const runVaultGiteaSync = useCallback(
    async (vaultId: string) => {
      if (!isBackendSyncVaultId(vaultId)) return;
      syncAbortRef.current?.abort();
      const ac = new AbortController();
      syncAbortRef.current = ac;
      let spinUiTimer: ReturnType<typeof setTimeout> | undefined;
      spinUiTimer = setTimeout(() => {
        if (!ac.signal.aborted) setGiteaSyncStatus("syncing");
      }, GITEA_SYNC_UI_SPIN_DELAY_MS);
      setGiteaSyncError(null);
      try {
        const mergedContents = { ...noteContentsRef.current };
        if (isGitLazyVaultTree(treeRootRef.current)) {
          const { entries } = await fetchVaultGitTree(vaultId, { signal: ac.signal });
          if (ac.signal.aborted) return;
          const paths = entries
            .map((e) => e.path)
            .filter((p) => !isGitKeepMarkerPath(p));
          const concurrency = 8;
          for (let i = 0; i < paths.length; i += concurrency) {
            if (ac.signal.aborted) return;
            const chunk = paths.slice(i, i + concurrency);
            await Promise.all(
              chunk.map(async (p) => {
                if (mergedContents[p] !== undefined) return;
                const { content } = await fetchVaultGitBlob(vaultId, p, {
                  signal: ac.signal,
                });
                mergedContents[p] = content;
              }),
            );
          }
          if (pendingPrefixMigrationsRef.current.length > 0) {
            const remapped = applyPrefixMigrationsToContents(
              mergedContents,
              pendingPrefixMigrationsRef.current,
            );
            Object.keys(mergedContents).forEach((k) => delete mergedContents[k]);
            Object.assign(mergedContents, remapped);
          }
          noteContentsRef.current = mergedContents;
          setNoteContents(mergedContents);
        }
        const files = flattenVaultTreeToSyncFiles(
          treeRootRef.current,
          noteContentsRef.current,
        );
        const { commitHash } = await apiRequest<{ ok: boolean; commitHash: string }>(
          `/api/vaults/${encodeURIComponent(vaultId)}/sync`,
          {
            method: "POST",
            body: { files },
            signal: ac.signal,
          },
        );
        if (ac.signal.aborted) return;
        setGiteaSyncStatus("synced");
        const remoteTail = commitHash.trim();
        setLastGiteaCommitHash(remoteTail);
        remoteTailPollSeenRef.current = remoteTail;
        pendingPrefixMigrationsRef.current = [];
        lazyGitDirtyDocIdsRef.current.clear();
        lazyGitTreeDirtyRef.current = false;
        syncDirtyStartAtRef.current = null;
        if (!usesLazyGitRemote(vaultId, activeVaultMetaRef.current)) {
          setFullSnapshotDirtyEpoch(0);
        }
        if (isGitLazyVaultTree(treeRootRef.current)) {
          refreshGitTreeAfterSync(vaultId);
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setGiteaSyncStatus("error");
        setGiteaSyncError(err instanceof Error ? err.message : "Falha ao sincronizar");
        syncDirtyStartAtRef.current = null;
      } finally {
        if (spinUiTimer) clearTimeout(spinUiTimer);
      }
    },
    [refreshGitTreeAfterSync, applyPrefixMigrationsToContents],
  );

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
          const remoteTail = data.commitHash.trim();
          setLastGiteaCommitHash(remoteTail);
          remoteTailPollSeenRef.current = remoteTail;
          const remotePaths = data.entries.map((e) => e.path);
          const remoteSet = new Set(remotePaths);
          const prevRoot = treeRootRef.current;
          const localPaths = isGitLazyVaultTree(prevRoot)
            ? collectLazyGitRepoRelativePaths(prevRoot)
            : [];
          /** Paths só na árvore local (ex.: snapshot em LS) não existem no Postgres → blob 404. Manter só extra local com alterações por sincronizar. */
          const extraLocalDirtyOnly = localPaths.filter(
            (p) => !remoteSet.has(p) && lazyGitDirtyDocIdsRef.current.has(p),
          );
          const unionPaths = [...new Set([...remotePaths, ...extraLocalDirtyOnly])];
          const pathsForSnapshot =
            unionPaths.length > 0 ? unionPaths : remotePaths.length > 0 ? remotePaths : [];
          const next = gitTreePathsToVaultSnapshot(pathsForSnapshot);
          const allowed = new Set(
            pathsForSnapshot.length > 0 ? pathsForSnapshot : remotePaths,
          );
          if (allowed.size === 0) {
            allowed.add(GIT_LAZY_PLACEHOLDER_DOC_ID);
          }
          const evictRemoteCachedBodies =
            lastLazyGitTreeCommitShortRef.current !== null &&
            remoteTail !== lastLazyGitTreeCommitShortRef.current;
          setTreeRoot(next.tree);
          setNoteContents((prev) => {
            const merged = mergeLazyGitNoteContentsAfterRemoteTree(
              prev,
              next.noteContents,
              remotePaths,
              allowed,
              lazyGitDirtyDocIdsRef.current,
              evictRemoteCachedBodies,
            );
            noteContentsRef.current = merged;
            lazyPersistedNoteContentsRef.current = merged;
            return merged;
          });
          lastLazyGitTreeCommitShortRef.current = remoteTail;
          lastBlobFetchRef.current = null;
          lazyGitBlobsSnapshotCommitRef.current = null;
          setExpandedPaths((prev) => pruneExpandedPathsToTree(next.tree, prev));
          setBookmarks([]);
          const mergedUi = mergeVaultUiAfterGitTreeRefresh(
            uiLatestRef.current,
            next.ui,
            next.tree,
          );
          dispatchUi({ type: "reset", state: mergedUi });
          await prefetchLazyGitVaultBlobs(vaultId, remotePaths, ac.signal, {
            queryClient,
            noteContentsRef,
            lazyGitDirtyDocIdsRef,
            setNoteContents,
            uiLatestRef,
            lastBlobFetchRef,
            blobsSnapshotCommitRef: lazyGitBlobsSnapshotCommitRef,
            commitShort: remoteTail,
          });
        } catch {
          /* mantem snapshot local */
        }
      })();
    },
    [queryClient],
  );
  useEffect(() => {
    const pending = readAndConsumePendingAgentProject();
    if (pending?.projectType !== "agent_squad" || !pending.squadMission?.trim()) return;
    const parentPath =
      activeVaultMeta.kind === "openclaw" ? "openclaw/workspace" : "vault-root";
    const snap = loadSnapshotWithSshBridge(vaultId, activeVaultMeta);
    const md = `# Missão da equipe — ${pending.vaultName}\n\n${pending.squadMission.trim()}\n`;
    const next = applyMissionMarkdownToSnapshot(snap, parentPath, md);
    saveSnapshot(vaultId, next);
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
    if (isBackendSyncVaultId(vaultId)) {
      if (usesLazyGitRemote(vaultId, activeVaultMeta)) {
        bumpLazyGitTreeDirtyForPush();
      } else {
        bumpFullSnapshotDirtyForPush();
      }
    }
  }, [vaultId, activeVaultMeta, bumpLazyGitTreeDirtyForPush, bumpFullSnapshotDirtyForPush]);

  useEffect(() => {
    scheduleGitTreeRefresh(vaultId, activeVaultMeta);
  }, [vaultId, lazyVaultProfileKey, scheduleGitTreeRefresh, activeVaultMeta]);

  useEffect(() => {
    remoteTailPollSeenRef.current = null;
  }, [vaultId]);

  useEffect(() => {
    if (!usesLazyGitRemote(vaultId, activeVaultMeta)) return;
    let cancelled = false;

    const pollRemoteTail = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (cancelled) return;
      try {
        const data = await fetchVaultGitTree(vaultId);
        if (cancelled) return;
        const tail = data.commitHash.trim();
        if (!tail || tail === remoteTailPollSeenRef.current) return;
        remoteTailPollSeenRef.current = tail;
        setLastGiteaCommitHash(tail);
      } catch {
        /* offline / throttling */
      }
    };

    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void pollRemoteTail();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    const id = window.setInterval(pollRemoteTail, LAZY_VAULT_REMOTE_TAIL_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [vaultId, lazyVaultProfileKey, activeVaultMeta]);



  useEffect(() => {
    if (!vaultId) return;
    const lazy = usesLazyGitRemote(vaultId, activeVaultMeta);
    const dirty = lazyGitDirtyDocIdsRef.current;
    let noteContentsToPersist = noteContents;
    if (lazy) {
      const dirtyMap = Object.fromEntries(
        [...dirty]
          .filter((id) => noteContents[id] !== undefined)
          .map((id) => [id, noteContents[id] as string]),
      );
      /**
       * Com alterações pendentes: fundir dirty no último LS. Sem dirty (ex.: após sync): gravar o estado em memória
       * para não ficar um snapshot desatualizado em relação a `noteContents`.
       */
      noteContentsToPersist =
        dirty.size > 0 ? { ...lazyPersistedNoteContentsRef.current, ...dirtyMap } : noteContents;
    }
    const snap: VaultSnapshotV1 = {
      v: 1,
      tree: treeRoot,
      noteContents: noteContentsToPersist,
      expandedPaths: [...expandedPaths],
      bookmarks,
      ui,
    };
    saveSnapshot(vaultId, snap);
    lazyPersistedNoteContentsRef.current = noteContentsToPersist;
  }, [
    vaultId,
    activeVaultMeta,
    treeRoot,
    noteContents,
    expandedPaths,
    bookmarks,
    ui,
  ]);

  useEffect(() => {
    const prevVault = prevVaultIdForBlobQueriesRef.current;
    if (prevVault !== vaultId) {
      queryClient.removeQueries({
        queryKey: [...vaultGitBlobQueryKeyRoot, prevVault],
      });
      prevVaultIdForBlobQueriesRef.current = vaultId;
    }
    lazyPersistedNoteContentsRef.current = {
      ...loadSnapshotWithSshBridge(vaultId, activeVaultMeta).noteContents,
    };
    lazyGitDirtyDocIdsRef.current.clear();
    lazyGitTreeDirtyRef.current = false;
    setFullSnapshotDirtyEpoch(0);
    lastBlobFetchRef.current = null;
    lazyGitBlobsSnapshotCommitRef.current = null;
    lastLazyGitTreeCommitShortRef.current = null;
    setLastGiteaCommitHash(null);
    setGiteaSyncError(null);
  }, [vaultId, activeVaultMeta, queryClient]);

  useEffect(() => {
    if (!isBackendSyncVaultId(vaultId)) {
      if (giteaSyncDebounceRef.current) {
        window.clearTimeout(giteaSyncDebounceRef.current);
        giteaSyncDebounceRef.current = null;
      }
      syncDirtyStartAtRef.current = null;
      syncAbortRef.current?.abort();
      setGiteaSyncStatus("idle");
      return;
    }
    const lazy = usesLazyGitRemote(vaultId, activeVaultMeta);
    if (lazy) {
      if (lazyGitDirtyDocIdsRef.current.size === 0 && !lazyGitTreeDirtyRef.current) {
        if (giteaSyncDebounceRef.current) {
          window.clearTimeout(giteaSyncDebounceRef.current);
          giteaSyncDebounceRef.current = null;
        }
        syncDirtyStartAtRef.current = null;
        return;
      }
    } else if (fullSnapshotDirtyEpoch === 0) {
      if (giteaSyncDebounceRef.current) {
        window.clearTimeout(giteaSyncDebounceRef.current);
        giteaSyncDebounceRef.current = null;
      }
      syncDirtyStartAtRef.current = null;
      return;
    }
    const now = Date.now();
    if (syncDirtyStartAtRef.current === null) {
      syncDirtyStartAtRef.current = now;
    }
    const elapsedMs = now - syncDirtyStartAtRef.current;
    /**
     * Sync suave:
     * - curto quando há pausa na digitação;
     * - com limite máximo para não adiar indefinidamente enquanto o utilizador continua a escrever.
     */
    const idleDelayMs = lazy ? 1600 : 1100;
    const maxWaitMs = lazy ? 8000 : 5000;
    const timeUntilForcedMs = Math.max(250, maxWaitMs - elapsedMs);
    const delayMs = Math.min(idleDelayMs, timeUntilForcedMs);
    if (giteaSyncDebounceRef.current) {
      window.clearTimeout(giteaSyncDebounceRef.current);
    }
    giteaSyncDebounceRef.current = window.setTimeout(() => {
      giteaSyncDebounceRef.current = null;
      void runVaultGiteaSync(vaultId);
    }, delayMs);
    return () => {
      if (giteaSyncDebounceRef.current) {
        window.clearTimeout(giteaSyncDebounceRef.current);
        giteaSyncDebounceRef.current = null;
      }
    };
  }, [lazyGitQueryEpoch, fullSnapshotDirtyEpoch, vaultId, activeVaultMeta, runVaultGiteaSync]);

  useEffect(() => {
    const flushNow = () => {
      if (!hasPendingRemoteSync(vaultIdRef.current, activeVaultMetaRef.current)) return;
      if (giteaSyncDebounceRef.current) {
        window.clearTimeout(giteaSyncDebounceRef.current);
        giteaSyncDebounceRef.current = null;
      }
      void runVaultGiteaSync(vaultIdRef.current);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushNow();
      }
    };

    window.addEventListener("pagehide", flushNow);
    window.addEventListener("beforeunload", flushNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("beforeunload", flushNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasPendingRemoteSync, runVaultGiteaSync]);

  useEffect(() => {
    return () => {
      syncAbortRef.current?.abort();
      gitTreeAbortRef.current?.abort();
    };
  }, []);

  const switchVault = useCallback(
    (nextId: string) => {
      if (!nextId || nextId === vaultId) return;
      if (vaultId) {
        const fromSnap: VaultSnapshotV1 = {
          v: 1,
          tree: treeRoot,
          noteContents,
          expandedPaths: [...expandedPaths],
          bookmarks,
          ui,
        };
        saveSnapshot(vaultId, fromSnap);
      }
      writeActiveVaultId(nextId);
      onActiveVaultIdChange(nextId);
    },
    [vaultId, treeRoot, noteContents, expandedPaths, bookmarks, ui, onActiveVaultIdChange]
  );


  const treeChildren = useMemo(
    () => (treeRoot.type === "dir" ? treeRoot.children : []),
    [treeRoot]
  );
  /** Conteúdo da árvore (não identidade); evita re-disparar sync URL↔UI quando só muda a referência do nó raiz. */
  const treeDocIdsKey = useMemo(
    () => [...collectDocIdsFromTree(treeChildren)].sort().join("\n"),
    [treeChildren]
  );
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
  const lazyGitRemote = usesLazyGitRemote(vaultId, activeVaultMeta);
  /** Docs de marketing em `DOC_BY_ID` só substituem o Git em vaults locais; com lazy-Git o blob do repo é a fonte (ex.: `openclaw.json` real). */
  const mockMarketingDocBlocksLazyGitBlob = (id: string | undefined | null) =>
    Boolean(id && DOC_BY_ID[id as string]) && !lazyGitRemote;
  const openTabsPrefetchSignature = useMemo(
    () => `${activeTabId ?? ""}\n${[...openTabs].sort().join("\n")}`,
    [activeTabId, openTabs]
  );

  const blobCommitKey =
    lastGiteaCommitHash && lastGiteaCommitHash.trim()
      ? lastGiteaCommitHash.trim()
      : "pending";

  const noteEditorRemountKey = useMemo(() => {
    if (!activeTabId) return "";
    if (!lazyGitRemote) return activeTabId;
    if (lazyGitDirtyDocIdsRef.current.has(activeTabId)) return activeTabId;
    return `${activeTabId}\0${blobCommitKey}`;
  }, [activeTabId, lazyGitRemote, blobCommitKey, lazyGitQueryEpoch]);

  const lazyActiveBlobQueryEnabled =
    Boolean(activeTabId) &&
    lazyGitRemote &&
    activeTabId != null &&
    !mockMarketingDocBlocksLazyGitBlob(activeTabId) &&
    activeTabId !== GIT_LAZY_PLACEHOLDER_DOC_ID &&
    !lazyGitDirtyDocIdsRef.current.has(activeTabId);

  const lazyBlobQuery = useQuery({
    queryKey: vaultGitBlobQueryKey(vaultId, activeTabId ?? "", blobCommitKey),
    queryFn: ({ signal }) => fetchVaultGitBlobQueryFn(vaultId, activeTabId!, signal),
    enabled: lazyActiveBlobQueryEnabled,
    staleTime: LAZY_GIT_BLOB_STALE_MS,
    gcTime: LAZY_GIT_BLOB_GC_MS,
    /** Evita o ecrã "A carregar…" em ficheiros vazios: o editor mostra-se já com texto vazio até o blob chegar. */
    placeholderData: "",
    retry: (failureCount, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (/404|Ficheiro nao encontrado|not found|NotFound/i.test(msg)) return false;
      return failureCount < 3;
    },
    retryDelay: (i) => Math.min(800 * 2 ** i, 5000),
  });

  useEffect(() => {
    if (!activeTabId || !lazyActiveBlobQueryEnabled) return;
    if (lazyGitDirtyDocIdsRef.current.has(activeTabId)) return;
    if (lazyBlobQuery.data === undefined) return;
    /** Só consolidar após o fetch: com `placeholderData: ""`, `data` pode ser `""` antes do texto real. */
    if (lazyBlobQuery.isFetching) return;
    const data = lazyBlobQuery.data;
    setNoteContents((prev) => {
      const cur = prev[activeTabId];
      if (cur === undefined) {
        const next = { ...prev, [activeTabId]: data };
        lazyPersistedNoteContentsRef.current = {
          ...lazyPersistedNoteContentsRef.current,
          [activeTabId]: data,
        };
        return next;
      }
      /** Nova revisão no servidor (ex.: agente Ubuntu) com o mesmo ficheiro aberto — fundir sem remontar o cofre inteiro. */
      if (cur !== data) {
        const next = { ...prev, [activeTabId]: data };
        lazyPersistedNoteContentsRef.current = {
          ...lazyPersistedNoteContentsRef.current,
          [activeTabId]: data,
        };
        return next;
      }
      return prev;
    });
  }, [
    activeTabId,
    lazyActiveBlobQueryEnabled,
    lazyBlobQuery.data,
    lazyBlobQuery.isFetching,
    blobCommitKey,
  ]);

  /** Com `placeholderData: ""` o query deixa de estar `pending` mas o fetch ainda corre — mostrar a carregar em vez do editor vazio com placeholder. */
  const lazyBlobUiLoading =
    lazyGitRemote &&
    Boolean(activeTabId) &&
    activeTabId != null &&
    !mockMarketingDocBlocksLazyGitBlob(activeTabId) &&
    activeTabId !== GIT_LAZY_PLACEHOLDER_DOC_ID &&
    !lazyGitDirtyDocIdsRef.current.has(activeTabId) &&
    noteContents[activeTabId] === undefined &&
    (lazyBlobQuery.isPending || lazyBlobQuery.isFetching);

  /**
   * Usar `error` (e não `isError` sozinho): durante retries o TanStack Query expõe o erro em
   * `failureReason` e só popula `error` após esgotar tentativas — evita flash de erro entre backoff e retry.
   */
  const lazyGitBlobFatalLoadError =
    activeTabId != null &&
    lazyGitRemote &&
    lazyActiveBlobQueryEnabled &&
    activeTabId !== GIT_LAZY_PLACEHOLDER_DOC_ID &&
    !mockMarketingDocBlocksLazyGitBlob(activeTabId) &&
    !lazyGitDirtyDocIdsRef.current.has(activeTabId) &&
    lazyBlobQuery.error != null &&
    !lazyBlobQuery.isFetching
      ? "Nao foi possivel carregar o ficheiro."
      : null;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [explorerSidebarWidth, setExplorerSidebarWidth] = useState(
    defaultClientUiSettings.sidebarWidth,
  );
  const [backlinksPanelOpen, setBacklinksPanelOpen] = useState(false);
  const [backlinksPanelWidth, setBacklinksPanelWidth] = useState(
    defaultClientUiSettings.backlinksPanelWidth,
  );
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("files");
  const [treeSortOrder, setTreeSortOrder] = useState<TreeSortOrder>("default");
  const [editorSourceMode, setEditorSourceMode] = useState(false);
  const prevEditorTabRef = useRef<string | undefined>(undefined);
  const editorSourceModeRef = useRef(editorSourceMode);
  editorSourceModeRef.current = editorSourceMode;

  useEffect(() => {
    prevEditorTabRef.current = undefined;
  }, [vaultId]);

  useEffect(() => {
    if (prevEditorTabRef.current === activeTabId) return;
    prevEditorTabRef.current = activeTabId;
    if (!activeTabId) return;
    if (isVaultPlainTextDocId(activeTabId)) {
      setEditorSourceMode(true);
      return;
    }
    if (editorSourceModeRef.current) setEditorSourceMode(false);
  }, [activeTabId]);

  useEffect(() => {
    setExplorerInlineRename(null);
  }, [vaultId]);

  useLayoutEffect(() => {
    const clientUi = loadClientUiSettings();
    setExplorerSidebarWidth(clientUi.sidebarWidth);
    setBacklinksPanelWidth(clientUi.backlinksPanelWidth);
  }, []);

  useEffect(() => {
    setBacklinksPanelOpen(false);
  }, [vaultId]);

  useEffect(() => {
    if (viewMode === "graph") setBacklinksPanelOpen(false);
  }, [viewMode]);

  const defaultNewItemParent = useMemo(() => {
    if (treeRoot.type !== "dir") return "openclaw-root";
    if (activeVaultMeta?.kind === "openclaw") {
      if (findDir(treeRoot.children, "openclaw/workspace")) return "openclaw/workspace";
    }
    return treeRoot.path;
  }, [treeRoot, activeVaultMeta?.kind]);

  const urlTargetKey = `${vaultId}|${vaultPageQuery.file ?? ""}|${vaultPageQuery.folder ?? ""}|${vaultPageQuery.view ?? ""}`;
  const appliedUrlTargetRef = useRef("");
  /** Dedupe de `open` vindo da URL (useLayoutEffect); reposto quando muda `?file=`. */
  const urlLayoutOpenDedupeRef = useRef("");
  const prevUrlFileParamForLayoutRef = useRef<string | null>(null);
  /** Ignora abertura pela URL no mesmo tick que `browseSelectFile`. */
  const skipVaultUrlOpenEffectRef = useRef(false);
  /** Evita `setVaultPageQuery` repetido enquanto nuqs ainda não refletiu o último push. */
  const lastUrlPushPayloadRef = useRef<{ f: string | null; v: string | null } | null>(null);

  const browseSelectFile = useCallback(
    (id: string) => {
      if (id === activeTabId && viewMode === "editor" && openTabs.includes(id)) {
        return;
      }
      skipVaultUrlOpenEffectRef.current = true;
      window.setTimeout(() => {
        skipVaultUrlOpenEffectRef.current = false;
      }, 0);
      dispatchUi({ type: "open", id });
      void setVaultPageQuery({ file: id, folder: null, view: null });
    },
    [activeTabId, viewMode, openTabs, setVaultPageQuery]
  );

  useEffect(() => {
    appliedUrlTargetRef.current = "";
    urlLayoutOpenDedupeRef.current = "";
    prevUrlFileParamForLayoutRef.current = null;
    lastUrlPushPayloadRef.current = null;
  }, [vaultId]);

  useLayoutEffect(() => {
    if (skipVaultUrlOpenEffectRef.current) return;
    const file = vaultPageQuery.file;
    if (!file) return;

    if (prevUrlFileParamForLayoutRef.current !== file) {
      urlLayoutOpenDedupeRef.current = "";
      prevUrlFileParamForLayoutRef.current = file;
    }

    const root = treeRootRef.current;
    const childrenForTree = root.type === "dir" ? root.children : [];
    if (!collectDocIdsFromTree(childrenForTree).includes(file)) return;

    const { activeTabId: curTab, viewMode: curView, openTabs: curOpen } = uiLatestRef.current;
    if (file === curTab && curView === "editor" && curOpen.includes(file)) {
      urlLayoutOpenDedupeRef.current = "";
      return;
    }

    const dedupe = `${vaultId}\0${file}`;
    if (urlLayoutOpenDedupeRef.current === dedupe) return;
    urlLayoutOpenDedupeRef.current = dedupe;
    dispatchUi({ type: "open", id: file });
  }, [vaultPageQuery.file, treeDocIdsKey, vaultId, dispatchUi]);

  useEffect(() => {
    if (skipVaultUrlOpenEffectRef.current) return;
    if (appliedUrlTargetRef.current === urlTargetKey) return;

    const file = vaultPageQuery.file;
    const folder = vaultPageQuery.folder;
    const viewGraph = vaultPageQuery.view === "graph";
    const root = treeRootRef.current;
    const childrenForTree = root.type === "dir" ? root.children : [];

    if (!file && !folder && !viewGraph) {
      appliedUrlTargetRef.current = urlTargetKey;
      setUrlSyncReady(true);
      return;
    }

    if (viewGraph && !file && !folder) {
      appliedUrlTargetRef.current = urlTargetKey;
      if (isBackendSyncVaultId(vaultId)) {
        router.replace(`/vault/${encodeURIComponent(vaultId)}/graph`);
      } else {
        dispatchUi({ type: "showGraph" });
      }
      setUrlSyncReady(true);
      return;
    }

    if (file) {
      const ids = collectDocIdsFromTree(childrenForTree);
      if (ids.includes(file)) {
        const expandForFile = () => {
          const paths = findAncestorDirPathsForDoc(childrenForTree, file);
          setExpandedPaths((prev) => {
            let changed = false;
            const next = new Set(prev);
            for (const p of paths) {
              if (!next.has(p)) {
                next.add(p);
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        };
        expandForFile();
        setUrlSyncReady(true);
        appliedUrlTargetRef.current = urlTargetKey;
      }
      return;
    }

    if (folder && root.type === "dir") {
      const treePath = findDirTreePathByRelativePath(root, folder);
      if (treePath) {
        appliedUrlTargetRef.current = urlTargetKey;
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          for (const anc of treePathAncestors(treePath)) {
            next.add(anc);
          }
          next.add(treePath);
          return next;
        });
        setRevealTarget({ type: "folder", path: treePath });
        dispatchUi({ type: "showGraph" });
        setUrlSyncReady(true);
      }
    }
  }, [urlTargetKey, treeDocIdsKey, dispatchUi, vaultId, router]);

  useEffect(() => {
    if (urlSyncReady) return;
    if (!vaultPageQuery.file && !vaultPageQuery.folder) return;
    const t = window.setTimeout(() => {
      setUrlSyncReady(true);
    }, 12000);
    return () => window.clearTimeout(t);
  }, [vaultPageQuery.file, vaultPageQuery.folder, urlSyncReady]);

  useEffect(() => {
    if (!urlSyncReady) return;

    const nextFile = viewMode === "graph" ? null : activeTabId || null;
    const nextView = viewMode === "graph" ? "graph" : null;

    const qFile = vaultPageQuery.file ?? null;
    const qView = vaultPageQuery.view ?? null;
    const qFolder = vaultPageQuery.folder ?? null;

    if (qFile === nextFile && qView === nextView && !qFolder) {
      lastUrlPushPayloadRef.current = null;
      return;
    }

    const payload = { f: nextFile, v: nextView };
    const last = lastUrlPushPayloadRef.current;
    if (last && last.f === payload.f && last.v === payload.v) {
      return;
    }
    lastUrlPushPayloadRef.current = payload;

    void setVaultPageQuery({
      file: nextFile,
      folder: null,
      view: nextView,
    });
  }, [
    urlSyncReady,
    viewMode,
    activeTabId,
    vaultPageQuery.file,
    vaultPageQuery.view,
    vaultPageQuery.folder,
    setVaultPageQuery,
  ]);

  useEffect(() => {
    if (!urlSyncReady) return;
    if (contentVisible) return;
    const raf = requestAnimationFrame(() => setContentVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [urlSyncReady, contentVisible]);

  useEffect(() => {
    if (!usesLazyGitRemote(vaultId, activeVaultMeta)) return;
    const commit = lastGiteaCommitHash;
    if (commit == null || commit === "") return;

    let cancelled = false;
    const commitKey = commit.trim();
    const priority = [...new Set([activeTabId, ...openTabs].filter(Boolean))] as string[];
    const candidates = priority.filter(
      (id) =>
        !mockMarketingDocBlocksLazyGitBlob(id) &&
        id !== GIT_LAZY_PLACEHOLDER_DOC_ID &&
        !lazyGitDirtyDocIdsRef.current.has(id) &&
        noteContentsRef.current[id] === undefined,
    );
    const batch = candidates.slice(0, LAZY_OPEN_TAB_PREFETCH_MAX);
    if (batch.length === 0) return;

    void (async () => {
      for (let i = 0; i < batch.length; i += LAZY_OPEN_TAB_PREFETCH_CONCURRENCY) {
        if (cancelled) return;
        const chunk = batch.slice(i, i + LAZY_OPEN_TAB_PREFETCH_CONCURRENCY);
        const updates: Record<string, string> = {};
        await Promise.all(
          chunk.map(async (docId) => {
            if (cancelled) return;
            if (noteContentsRef.current[docId] !== undefined) return;
            if (lazyGitDirtyDocIdsRef.current.has(docId)) return;
            try {
              const content = await queryClient.fetchQuery({
                queryKey: vaultGitBlobQueryKey(vaultId, docId, commitKey),
                queryFn: ({ signal }) => fetchVaultGitBlobQueryFn(vaultId, docId, signal),
                staleTime: LAZY_GIT_BLOB_STALE_MS,
              });
              updates[docId] = content;
            } catch {
              /* ignora um path */
            }
          }),
        );
        if (cancelled) return;
        if (Object.keys(updates).length === 0) continue;
        lazyGitBlobsSnapshotCommitRef.current = commitKey;
        setNoteContents((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(updates)) {
            if (lazyGitDirtyDocIdsRef.current.has(k)) continue;
            if (next[k] !== undefined) continue;
            next[k] = v;
          }
          noteContentsRef.current = next;
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vaultId, activeVaultMeta, lastGiteaCommitHash, openTabsPrefetchSignature, queryClient]);

  const migrateDocPrefixes = useCallback(
    (from: string, to: string) => {
      if (from === to) return;
      pendingPrefixMigrationsRef.current.push({ from, to });
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
        markLazyGitDirtyDoc(r.newDocId);
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
      } else {
        markLazyGitDirtyDoc(session.docId);
      }
      if (isBackendSyncVaultId(vaultId) && !usesLazyGitRemote(vaultId, activeVaultMeta)) {
        bumpFullSnapshotDirtyForPush();
      }
    } else {
      const r = renameDirectory(treeRoot, session.treePath, trimmed);
      if (!r.ok) {
        window.alert(r.reason);
        return;
      }
      setTreeRoot(r.root);
      migrateDocPrefixes(r.docPrefixFrom, r.docPrefixTo);
      if (usesLazyGitRemote(vaultId, activeVaultMeta)) {
        bumpLazyGitTreeDirtyForPush();
      } else if (isBackendSyncVaultId(vaultId)) {
        bumpFullSnapshotDirtyForPush();
      }
    }
    setExplorerInlineRename(null);
  }, [
    treeRoot,
    migrateDocPrefixes,
    markLazyGitDirtyDoc,
    vaultId,
    activeVaultMeta,
    bumpFullSnapshotDirtyForPush,
    bumpLazyGitTreeDirtyForPush,
  ]);

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
        markLazyGitDirtyDoc(to);
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
      if (usesLazyGitRemote(vaultId, activeVaultMeta)) {
        bumpLazyGitTreeDirtyForPush();
      } else if (isBackendSyncVaultId(vaultId)) {
        bumpFullSnapshotDirtyForPush();
      }
    },
    [
      treeRoot,
      migrateDocPrefixes,
      bumpExplorerTree,
      markLazyGitDirtyDoc,
      vaultId,
      activeVaultMeta,
      bumpLazyGitTreeDirtyForPush,
      bumpFullSnapshotDirtyForPush,
    ]
  );

  const confirmExplorerDeleteFromDialog = useCallback(() => {
    if (!explorerDeleteItems || treeRoot.type !== "dir") return;
    const r = deleteExplorerItems(treeRoot, explorerDeleteItems);
    if (!r.ok) {
      window.alert(r.reason);
      return;
    }
    setTreeRoot(r.root);
    skipVaultUrlOpenEffectRef.current = true;
    window.setTimeout(() => {
      skipVaultUrlOpenEffectRef.current = false;
    }, 0);
    dispatchUi({ type: "closeMany", ids: r.closedDocIds });
    setNoteContents((prev) => {
      const next = { ...prev };
      for (const id of r.closedDocIds) delete next[id];
      return next;
    });
    setExplorerDeleteItems(null);
    bumpExplorerTree();
    if (usesLazyGitRemote(vaultId, activeVaultMeta)) {
      bumpLazyGitTreeDirtyForPush();
    } else if (isBackendSyncVaultId(vaultId)) {
      bumpFullSnapshotDirtyForPush();
    }
  }, [
    explorerDeleteItems,
    treeRoot,
    bumpExplorerTree,
    vaultId,
    activeVaultMeta,
    bumpLazyGitTreeDirtyForPush,
    bumpFullSnapshotDirtyForPush,
  ]);

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

  const cycleTreeSort = useCallback(() => {
    setTreeSortOrder((o: TreeSortOrder) =>
      o === "default" ? "name" : o === "name" ? "name-desc" : "default",
    );
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      skipVaultUrlOpenEffectRef.current = true;
      window.setTimeout(() => {
        skipVaultUrlOpenEffectRef.current = false;
      }, 0);

      const { openTabs: tabs, activeTabId: cur, viewMode: vm } = uiLatestRef.current;
      const idx = tabs.indexOf(id);
      if (idx === -1) return;
      const nextOpenTabs = tabs.filter((t) => t !== id);
      let nextActiveTabId = cur;
      if (cur === id) {
        nextActiveTabId =
          nextOpenTabs.length === 0
            ? ""
            : (nextOpenTabs[Math.max(0, idx - 1)] ?? nextOpenTabs[0] ?? "");
      }
      const nextViewMode = nextOpenTabs.length === 0 ? "graph" : vm;

      const nextFile = nextViewMode === "graph" ? null : nextActiveTabId || null;
      const nextUrlView = nextViewMode === "graph" ? "graph" : null;

      dispatchUi({ type: "close", id });
      void setVaultPageQuery({ file: nextFile, folder: null, view: nextUrlView });
    },
    [setVaultPageQuery],
  );

  const closeAllTabs = useCallback(() => {
    if (openTabs.length === 0) return;
    skipVaultUrlOpenEffectRef.current = true;
    window.setTimeout(() => {
      skipVaultUrlOpenEffectRef.current = false;
    }, 0);
    dispatchUi({ type: "closeMany", ids: [...openTabs] });
    void setVaultPageQuery({ file: null, folder: null, view: "graph" });
  }, [openTabs, setVaultPageQuery]);

  const activateTab = useCallback((id: string) => {
    dispatchUi({ type: "activate", id });
  }, []);

  const openGraph = useCallback(() => {
    if (isBackendSyncVaultId(vaultId)) {
      router.push(`/vault/${encodeURIComponent(vaultId)}/graph`);
    } else {
      dispatchUi({ type: "showGraph" });
    }
  }, [vaultId, router]);

  const graphHighlightId = activeTabId || null;

  const editorBreadcrumb = useMemo(
    () => vaultDocBreadcrumb(treeChildren, activeTabId || ""),
    [treeChildren, activeTabId],
  );

  /** Evita mostrar atalhos do editor na barra de abas enquanto o blob lazy ainda não chegou. */
  const editorSubChromeLoading =
    usesLazyGitRemote(vaultId, activeVaultMeta) && lazyBlobUiLoading;

  const handleExplorerCommand = useCallback(
    (cmd: ExplorerCommand) => {
      if (!vaultId || treeRoot.type !== "dir") return;

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
          markLazyGitDirtyDoc(r.docId);
          setNoteContents((prev) => ({ ...prev, [r.docId]: body }));
          browseSelectFile(r.docId);
          setExpandedPaths((p) => new Set([...p, cmd.parentTreePath]));
          if (isBackendSyncVaultId(vaultId) && !usesLazyGitRemote(vaultId, activeVaultMeta)) {
            bumpFullSnapshotDirtyForPush();
          }
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
          if (usesLazyGitRemote(vaultId, activeVaultMeta)) {
            bumpLazyGitTreeDirtyForPush();
          } else if (isBackendSyncVaultId(vaultId)) {
            bumpFullSnapshotDirtyForPush();
          }
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
          markLazyGitDirtyDoc(r.docId);
          setNoteContents((prev) => ({ ...prev, [r.docId]: body }));
          browseSelectFile(r.docId);
          setExpandedPaths((p) => new Set([...p, cmd.parentTreePath]));
          if (isBackendSyncVaultId(vaultId) && !usesLazyGitRemote(vaultId, activeVaultMeta)) {
            bumpFullSnapshotDirtyForPush();
          }
          break;
        }
        case "new-base": {
          const r = addBaseToParent(treeRoot, cmd.parentTreePath);
          if (!r.ok) {
            window.alert(r.reason);
            return;
          }
          setTreeRoot(r.root);
          markLazyGitDirtyDoc(r.docId);
          setNoteContents((prev) => ({ ...prev, [r.docId]: "{}\n" }));
          browseSelectFile(r.docId);
          setExpandedPaths((p) => new Set([...p, cmd.parentTreePath]));
          if (isBackendSyncVaultId(vaultId) && !usesLazyGitRemote(vaultId, activeVaultMeta)) {
            bumpFullSnapshotDirtyForPush();
          }
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
          markLazyGitDirtyDoc(copyId);
          setNoteContents((prev) => ({ ...prev, [copyId]: src }));
          browseSelectFile(copyId);
          if (isBackendSyncVaultId(vaultId) && !usesLazyGitRemote(vaultId, activeVaultMeta)) {
            bumpFullSnapshotDirtyForPush();
          }
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
            markLazyGitDirtyDoc(r.newDocId);
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
          if (usesLazyGitRemote(vaultId, activeVaultMeta)) {
            if (!r.newDocId || r.newDocId === cmd.docId) {
              bumpLazyGitTreeDirtyForPush();
            }
          } else if (isBackendSyncVaultId(vaultId)) {
            bumpFullSnapshotDirtyForPush();
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
          if (usesLazyGitRemote(vaultId, activeVaultMeta)) {
            bumpLazyGitTreeDirtyForPush();
          } else if (isBackendSyncVaultId(vaultId)) {
            bumpFullSnapshotDirtyForPush();
          }
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
      vaultId,
      treeRoot,
      noteContents,
      treeChildren,
      browseSelectFile,
      migrateDocPrefixes,
      markLazyGitDirtyDoc,
      bumpFullSnapshotDirtyForPush,
      bumpLazyGitTreeDirtyForPush,
      activeVaultMeta,
      openExplorerDeleteDialog,
      openExplorerInlineRename,
    ]
  );

  const renameTabFromChrome = useCallback(
    (docId: string) => {
      if (!vaultId || treeRoot.type !== "dir") return;
      const parentTreePath = getParentTreePathForDoc(treeRoot, docId);
      const name = findFileNameForDocId(treeChildren, docId) ?? docId.split("/").pop() ?? docId;
      if (!parentTreePath) {
        window.alert("Não foi possível localizar o ficheiro na árvore.");
        return;
      }
      handleExplorerCommand({
        type: "rename",
        target: { kind: "file", docId, name, parentTreePath },
      });
    },
    [vaultId, treeRoot, treeChildren, handleExplorerCommand],
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
  return (
    <div className="relative h-full">
      {!contentVisible && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}
      <div
        className={cn(
          "flex h-full overflow-hidden transition-opacity duration-300",
          contentVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
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
            <div
              className="flex h-full shrink-0 flex-row border-r border-border bg-sidebar/30"
              style={{ width: explorerSidebarWidth }}
            >
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                  activeVaultId={vaultId}
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
                  giteaSyncSpinningDocId={
                    isBackendSyncVaultId(vaultId) && giteaSyncStatus === "syncing"
                      ? (activeTabId ?? null)
                      : undefined
                  }
                />
              </div>
              <VaultExplorerSidebarResizeHandle
                sidebarWidth={explorerSidebarWidth}
                onSidebarWidthChange={setExplorerSidebarWidth}
                onResizeEnd={(w) => {
                  setExplorerSidebarWidth(w);
                  patchClientUiSettings({ sidebarWidth: w });
                }}
              />
            </div>
        )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border bg-card/30 px-1">
          {isBackendSyncVaultId(vaultId) && (
            <Link
              href={`/vault/${encodeURIComponent(vaultId)}/graph`}
              title="Grafo do vault (API)"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
                "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
              )}
            >
              <Share2 className="size-3.5" />
              Grafo API
            </Link>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:thin]">
            {openTabs.map((id) => (
              <FileTab
                key={id}
                fileId={id}
                active={viewMode === "editor" && activeTabId === id}
                onSelect={() => activateTab(id)}
                onClose={() => closeTab(id)}
                onRename={() => renameTabFromChrome(id)}
                onCloseAllTabs={closeAllTabs}
              />
            ))}
          </div>
          {viewMode === "editor" ? (
            <button
              type="button"
              onClick={() => setBacklinksPanelOpen((o) => !o)}
              title={backlinksPanelOpen ? "Fechar painel de backlinks" : "Abrir painel de backlinks"}
              aria-expanded={backlinksPanelOpen}
              aria-controls="vault-backlinks-panel"
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs transition-colors",
                "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                backlinksPanelOpen && "bg-muted text-foreground",
              )}
            >
              <Link2 className="size-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Backlinks</span>
            </button>
          ) : null}
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
            title="Fechar todas as abas"
            onClick={closeAllTabs}
            disabled={openTabs.length === 0}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            aria-label="Fechar todas as abas"
          >
            <ListX className="size-4" />
          </button>
          {viewMode === "editor" && activeTabId && !editorSubChromeLoading ? (
            <div className="ml-0.5 flex shrink-0 items-center gap-0.5 border-l border-border/60 pl-1.5">
              <Menu.Root>
                <Menu.Trigger className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground data-popup-open:bg-muted">
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
              {!isVaultPlainTextDocId(activeTabId) ? (
                <button
                  type="button"
                  onClick={() => setEditorSourceMode((v) => !v)}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                    editorSourceMode && "bg-muted text-foreground",
                  )}
                  title={editorSourceMode ? "Modo blocos" : "Modo fonte (Markdown)"}
                  aria-pressed={editorSourceMode}
                >
                  <FileCode2 className="size-4" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {viewMode === "graph" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="min-h-0 flex-1">
              <FullGraph graph={graphData} onSelectFile={browseSelectFile} highlightId={graphHighlightId} />
            </div>
          </div>
        ) : openTabs.length === 0 || !activeTabId ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center font-mono text-sm text-muted-foreground">
            Nenhum arquivo aberto. Escolha um arquivo na árvore ou no grafo.
          </div>
        ) : usesLazyGitRemote(vaultId, activeVaultMeta) && lazyBlobUiLoading ? (
          <div className="min-h-0 flex-1 bg-background" aria-busy="true" />
        ) : usesLazyGitRemote(vaultId, activeVaultMeta) &&
          lazyGitBlobFatalLoadError &&
          noteContents[activeTabId] === undefined ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
            {lazyGitBlobFatalLoadError}
          </div>
        ) : isVaultPlainTextDocId(activeTabId) ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <VaultNoteEditor
              key={activeTabId}
              vaultId={vaultId}
              docId={activeTabId}
              plateEditorMountKey={noteEditorRemountKey || undefined}
              value={
                noteContents[activeTabId] ??
                (lazyActiveBlobQueryEnabled
                  ? lazyBlobQuery.data
                  : undefined) ??
                (activeDoc && mockMarketingDocBlocksLazyGitBlob(activeTabId)
                  ? mockDocToMarkdown(activeDoc)
                  : `# ${activeTabId}\n\n`)
              }
              onChange={(next) => {
                if (usesLazyGitRemote(vaultId, activeVaultMeta)) {
                  markLazyGitDirtyDoc(activeTabId);
                } else if (isBackendSyncVaultId(vaultId)) {
                  bumpFullSnapshotDirtyForPush();
                }
                setNoteContents((prev) => ({ ...prev, [activeTabId]: next }));
              }}
              breadcrumb={editorBreadcrumb}
              onSelectFile={browseSelectFile}
              hideTopChrome
              sourceMode={editorSourceMode}
              onSourceModeChange={setEditorSourceMode}
              plainTextDocument
            />
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <VaultNoteEditor
              key={activeTabId}
              vaultId={vaultId}
              docId={activeTabId}
              plateEditorMountKey={noteEditorRemountKey || undefined}
              value={
                noteContents[activeTabId] ??
                (lazyActiveBlobQueryEnabled
                  ? lazyBlobQuery.data
                  : undefined) ??
                (activeDoc && mockMarketingDocBlocksLazyGitBlob(activeTabId)
                  ? mockDocToMarkdown(activeDoc)
                  : `# ${activeTabId}\n\n`)
              }
              onChange={(next) => {
                if (usesLazyGitRemote(vaultId, activeVaultMeta)) {
                  markLazyGitDirtyDoc(activeTabId);
                } else if (isBackendSyncVaultId(vaultId)) {
                  bumpFullSnapshotDirtyForPush();
                }
                setNoteContents((prev) => ({ ...prev, [activeTabId]: next }));
              }}
              breadcrumb={editorBreadcrumb}
              onSelectFile={browseSelectFile}
              hideTopChrome
              sourceMode={editorSourceMode}
              onSourceModeChange={setEditorSourceMode}
              plainTextDocument={false}
              edgeToEdgeScroll
            />
          </div>
        )}
      </div>

      {viewMode === "graph" ? (
        <aside
          className="flex h-full min-h-0 w-[200px] shrink-0 flex-col overflow-hidden border-l border-border bg-sidebar/30"
          role="complementary"
          aria-label="Etiquetas"
        >
          <TagsPanel topTags={topTags} onSelect={browseSelectFile} />
        </aside>
      ) : null}
      {viewMode === "editor" && backlinksPanelOpen ? (
        <>
          <VaultBacklinksResizeHandle
            panelWidth={backlinksPanelWidth}
            onPanelWidthChange={setBacklinksPanelWidth}
            onResizeEnd={(w) => {
              setBacklinksPanelWidth(w);
              patchClientUiSettings({ backlinksPanelWidth: w });
            }}
          />
          <aside
            id="vault-backlinks-panel"
            className="flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-l border-border bg-sidebar/30"
            style={{ width: backlinksPanelWidth }}
            role="complementary"
            aria-label="Backlinks"
          >
            {openTabs.length === 0 || !activeTabId ? (
              <div className="flex flex-1 items-center px-3 py-4 font-mono text-[10px] text-muted-foreground/70">
                Abra um arquivo para ver backlinks.
              </div>
            ) : (
              <BacklinksPanel
                docId={activeTabId}
                treeChildren={treeChildren}
                noteContents={noteContents}
                onSelect={browseSelectFile}
                onRequestClose={() => setBacklinksPanelOpen(false)}
              />
            )}
          </aside>
        </>
      ) : null}
      </div>
      </div>

      <VaultManageDialog
        open={manageVaultsOpen}
        onClose={() => setManageVaultsOpen(false)}
        vaults={vaultMetas}
        activeId={vaultId}
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
    </div>
  );
}
