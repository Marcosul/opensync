import {
  DOCS,
  OPENCLAW_TREE_ROOT,
  mockDocToMarkdown,
  type TreeEntry,
} from "@/components/marketing/openclaw-workspace-mock";

import { cloneTreeEntry, ensureMissionMdFile } from "@/components/app/vault-tree-ops";

export const VAULT_METAS_KEY = "opensync-vault-metas";
export const VAULT_ACTIVE_KEY = "opensync-vault-active-id";
export const PENDING_AGENT_PROJECT_KEY = "opensync-pending-agent-project";
export const PENDING_ACTIVE_VAULT_KEY = "opensync-pending-active-vault-id";

export function writePendingActiveVaultId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_ACTIVE_VAULT_KEY, id);
  } catch {
    /* ignore */
  }
}

export function peekPendingActiveVaultId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(PENDING_ACTIVE_VAULT_KEY);
  } catch {
    return null;
  }
}

export function clearPendingActiveVaultId(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_ACTIVE_VAULT_KEY);
  } catch {
    /* ignore */
  }
}

export type PendingAgentProject = {
  vaultName: string;
  projectType: "single_agent" | "agent_squad";
  squadMission?: string;
};

export function writePendingAgentProject(data: PendingAgentProject): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_AGENT_PROJECT_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function readAndConsumePendingAgentProject(): PendingAgentProject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_AGENT_PROJECT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_AGENT_PROJECT_KEY);
    const p = JSON.parse(raw) as PendingAgentProject;
    if (!p || typeof p.vaultName !== "string") return null;
    if (p.projectType !== "single_agent" && p.projectType !== "agent_squad") return null;
    return p;
  } catch {
    return null;
  }
}

export function applyMissionMarkdownToSnapshot(
  snap: VaultSnapshotV1,
  parentTreePath: string,
  markdown: string,
): VaultSnapshotV1 {
  const r = ensureMissionMdFile(snap.tree, parentTreePath);
  if (!r.ok) return snap;
  return {
    ...snap,
    tree: r.root,
    noteContents: { ...snap.noteContents, [r.docId]: markdown },
  };
}

export const VAULT_SNAPSHOT_KEY_PREFIX = "opensync-vault-snapshot-";

export function vaultSnapshotKey(vaultId: string): string {
  return `${VAULT_SNAPSHOT_KEY_PREFIX}${vaultId}`;
}

export type ViewMode = "graph" | "editor";

export type VaultUiState = {
  viewMode: ViewMode;
  openTabs: string[];
  activeTabId: string;
};

export type VaultBookmark =
  | { kind: "file"; docId: string; label: string }
  | { kind: "folder"; path: string; label: string };

export type VaultMeta = {
  id: string;
  name: string;
  pathLabel: string;
  kind: "openclaw" | "blank";
  /** Cofre ligado ao perfil (Supabase); nao remover só pelo explorador. */
  managedByProfile?: boolean;
  /** false = cofre do agente (nao apagar pelo explorador). true = pode apagar (vazio salvo / local). */
  deletable?: boolean;
  /** Arvore preenchida a partir de SSH (VPS) ou Git API (lazy). */
  remoteSync?: "ssh" | "git";
};

export type VaultSnapshotV1 = {
  v: 1;
  tree: TreeEntry;
  noteContents: Record<string, string>;
  expandedPaths: string[];
  bookmarks: VaultBookmark[];
  ui: VaultUiState;
};

export const initialVaultUi: VaultUiState = {
  viewMode: "editor",
  openTabs: ["AGENTS.md"],
  activeTabId: "AGENTS.md",
};

const LEGACY_MOCK_VAULT_IDS = new Set([
  "vault-openclaw",
  "vault-second-brain",
  "vault-docs",
]);

/** Snapshot neutro quando não há cofre selecionado (só UI; não persiste em snapshot). */
export function emptyVaultPlaceholderSnapshot(): VaultSnapshotV1 {
  return {
    v: 1,
    tree: { type: "dir", name: "vault", path: "vault-root", children: [] },
    noteContents: {},
    expandedPaths: [],
    bookmarks: [],
    ui: { viewMode: "editor", openTabs: [], activeTabId: "" },
  };
}

function stripLegacyLocalBrowser(metas: VaultMeta[]): VaultMeta[] {
  return metas.filter((m) => m.id !== "local-browser");
}

export function openclawSnapshot(): VaultSnapshotV1 {
  const noteContents: Record<string, string> = {};
  for (const d of DOCS) noteContents[d.id] = mockDocToMarkdown(d);
  return {
    v: 1,
    tree: cloneTreeEntry(OPENCLAW_TREE_ROOT),
    noteContents,
    expandedPaths: ["openclaw/workspace", "openclaw/workspace/memory"],
    bookmarks: [],
    ui: initialVaultUi,
  };
}

export function blankVaultSnapshot(): VaultSnapshotV1 {
  const tree: TreeEntry = {
    type: "dir",
    name: "vault",
    path: "vault-root",
    children: [{ type: "file", name: "Bem-vindo.md", docId: "Bem-vindo.md" }],
  };
  return {
    v: 1,
    tree,
    noteContents: {
      "Bem-vindo.md": "# Bem-vindo\n\nCofre vazio. Crie notas pelo menu de contexto.\n",
    },
    expandedPaths: ["vault-root"],
    bookmarks: [],
    ui: {
      viewMode: "editor",
      openTabs: ["Bem-vindo.md"],
      activeTabId: "Bem-vindo.md",
    },
  };
}

export function defaultSnapshotForMeta(meta: VaultMeta | undefined): VaultSnapshotV1 {
  if (!meta || meta.kind === "openclaw") return openclawSnapshot();
  return blankVaultSnapshot();
}

/**
 * Mesmo boot que o SSR usa (sem localStorage). O primeiro render no cliente deve
 * coincidir com o HTML do servidor para evitar erro de hidratação.
 */
export function getHydrationSafeVaultBoot(): {
  metas: VaultMeta[];
  id: string;
  snap: VaultSnapshotV1;
} {
  return {
    metas: [],
    id: "",
    snap: emptyVaultPlaceholderSnapshot(),
  };
}

function migrateLegacyVaultMetas(parsed: VaultMeta[]): VaultMeta[] {
  if (parsed.some((m) => LEGACY_MOCK_VAULT_IDS.has(m.id))) {
    writeVaultMetas([]);
    return [];
  }
  return stripLegacyLocalBrowser(parsed);
}

export function readVaultMetas(): VaultMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VAULT_METAS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cleaned = migrateLegacyVaultMetas(parsed as VaultMeta[]);
    const stripped = stripLegacyLocalBrowser(cleaned);
    if (stripped.length !== cleaned.length) {
      writeVaultMetas(stripped);
    }
    return stripped;
  } catch {
    return [];
  }
}

export function writeVaultMetas(metas: VaultMeta[]): void {
  try {
    localStorage.setItem(VAULT_METAS_KEY, JSON.stringify(metas));
  } catch {
    /* ignore */
  }
}

export function readActiveVaultId(metas: VaultMeta[]): string {
  if (typeof window === "undefined") return metas[0]?.id ?? "";
  if (metas.length === 0) {
    try {
      localStorage.removeItem(VAULT_ACTIVE_KEY);
    } catch {
      /* ignore */
    }
    return "";
  }
  try {
    const id = localStorage.getItem(VAULT_ACTIVE_KEY);
    if (id && metas.some((m) => m.id === id)) return id;
  } catch {
    /* ignore */
  }
  return metas[0]?.id ?? "";
}

export function writeActiveVaultId(id: string): void {
  try {
    if (!id) {
      localStorage.removeItem(VAULT_ACTIVE_KEY);
      return;
    }
    localStorage.setItem(VAULT_ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearActiveVaultId(): void {
  try {
    localStorage.removeItem(VAULT_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Estados antigos vinham com aba de arquivo "aberta" mas viewMode no grafo — área central
 * ficava vazia (grade) e parecia que a nota não carregava. Com aba ativa, mostrar o editor.
 */
function normalizeLoadedUi(ui: VaultUiState): VaultUiState {
  if (
    ui.viewMode === "graph" &&
    ui.activeTabId &&
    ui.openTabs.includes(ui.activeTabId)
  ) {
    return { ...ui, viewMode: "editor" };
  }
  return ui;
}

export function loadSnapshot(vaultId: string, meta: VaultMeta | undefined): VaultSnapshotV1 {
  if (typeof window === "undefined") return defaultSnapshotForMeta(meta);
  try {
    const raw = localStorage.getItem(vaultSnapshotKey(vaultId));
    if (!raw) return defaultSnapshotForMeta(meta);
    const parsed = JSON.parse(raw) as VaultSnapshotV1;
    if (parsed?.v !== 1 || !parsed.tree || !parsed.ui) return defaultSnapshotForMeta(meta);
    return { ...parsed, ui: normalizeLoadedUi(parsed.ui) };
  } catch {
    return defaultSnapshotForMeta(meta);
  }
}

/** Le snapshot sem cair no default (para migracao). */
export function readSnapshotRaw(vaultId: string): VaultSnapshotV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(vaultSnapshotKey(vaultId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VaultSnapshotV1;
    if (parsed?.v !== 1 || !parsed.tree || !parsed.ui) return null;
    return { ...parsed, ui: normalizeLoadedUi(parsed.ui) };
  } catch {
    return null;
  }
}

/** Cofre em branco local (Bem-vindo.md), nao importacao SSH. */
export function isEmptyBrowserVaultSnapshot(snap: VaultSnapshotV1): boolean {
  const t = snap.tree;
  if (t.type !== "dir" || t.path !== "vault-root") return false;
  return (
    t.children.length === 1 &&
    t.children[0].type === "file" &&
    t.children[0].name === "Bem-vindo.md"
  );
}

function sshImportedSnapshotScore(snap: VaultSnapshotV1): number {
  if (snap.tree.type !== "dir" || snap.tree.path !== "ssh-vault-root") return -1;
  return Object.keys(snap.noteContents).length;
}

/**
 * Outra chave localStorage pode ter o import SSH (ex.: UUID) enquanto a lista do servidor
 * usa `profile-<userId>` se `backendVaultId` faltou no perfil.
 */
export function findBestSshImportedSnapshotVaultId(excludeVaultId: string): string | null {
  if (typeof window === "undefined") return null;
  let bestId: string | null = null;
  let bestScore = -1;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(VAULT_SNAPSHOT_KEY_PREFIX)) continue;
      const id = key.slice(VAULT_SNAPSHOT_KEY_PREFIX.length);
      if (id === excludeVaultId) continue;
      const raw = readSnapshotRaw(id);
      if (!raw) continue;
      const sc = sshImportedSnapshotScore(raw);
      if (sc > bestScore) {
        bestScore = sc;
        bestId = id;
      }
    }
  } catch {
    /* ignore */
  }
  return bestScore > 0 ? bestId : null;
}

/**
 * Carrega snapshot; se for cofre SSH mas o armazenamento local for o vazio (Bem-vindo),
 * tenta recuperar um snapshot `ssh-vault-root` noutra chave e grava no id atual.
 */
export function loadSnapshotWithSshBridge(vaultId: string, meta: VaultMeta | undefined): VaultSnapshotV1 {
  const snap = loadSnapshot(vaultId, meta);
  if (meta?.remoteSync !== "ssh" || !isEmptyBrowserVaultSnapshot(snap)) {
    return snap;
  }
  const donorId = findBestSshImportedSnapshotVaultId(vaultId);
  if (!donorId) return snap;
  const imported = readSnapshotRaw(donorId);
  if (!imported || imported.tree.type !== "dir" || imported.tree.path !== "ssh-vault-root") {
    return snap;
  }
  saveSnapshot(vaultId, imported);
  if (donorId !== vaultId) {
    try {
      localStorage.removeItem(vaultSnapshotKey(donorId));
    } catch {
      /* ignore */
    }
  }
  return imported;
}

export function saveSnapshot(vaultId: string, snap: VaultSnapshotV1): void {
  try {
    localStorage.setItem(vaultSnapshotKey(vaultId), JSON.stringify(snap));
  } catch (err) {
    console.error(
      "\x1b[33m[OpenSync]\x1b[0m \x1b[31mFalha ao gravar snapshot no localStorage (quota cheia ou dados demasiado grandes?)\x1b[0m",
      err,
    );
  }
}

export function countTreeStats(entries: TreeEntry[]): { files: number; folders: number } {
  let files = 0;
  let folders = 0;
  function walk(es: TreeEntry[]) {
    for (const e of es) {
      if (e.type === "dir") {
        folders += 1;
        walk(e.children);
      } else if (e.type === "file" && "docId" in e) {
        files += 1;
      }
    }
  }
  walk(entries);
  return { files, folders };
}
