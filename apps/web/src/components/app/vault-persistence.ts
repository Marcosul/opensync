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

export function vaultSnapshotKey(vaultId: string): string {
  return `opensync-vault-snapshot-${vaultId}`;
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

/** Cofre apenas local quando ainda nao ha agente no perfil. */
export function defaultVaultMetas(): VaultMeta[] {
  return [
    {
      id: "local-browser",
      name: "Cofre local",
      pathLabel: "Somente neste navegador",
      kind: "blank",
      deletable: true,
    },
  ];
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
  const metas = defaultVaultMetas();
  const id = metas[0]?.id ?? "local-browser";
  const meta = metas.find((m) => m.id === id);
  return { metas, id, snap: defaultSnapshotForMeta(meta) };
}

function migrateLegacyVaultMetas(parsed: VaultMeta[]): VaultMeta[] {
  if (parsed.some((m) => LEGACY_MOCK_VAULT_IDS.has(m.id))) {
    const defs = defaultVaultMetas();
    writeVaultMetas(defs);
    return defs;
  }
  return parsed;
}

export function readVaultMetas(): VaultMeta[] {
  if (typeof window === "undefined") return defaultVaultMetas();
  try {
    const raw = localStorage.getItem(VAULT_METAS_KEY);
    if (!raw) {
      const defs = defaultVaultMetas();
      localStorage.setItem(VAULT_METAS_KEY, JSON.stringify(defs));
      return defs;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultVaultMetas();
    return migrateLegacyVaultMetas(parsed as VaultMeta[]);
  } catch {
    return defaultVaultMetas();
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
  if (typeof window === "undefined") return metas[0]?.id ?? "local-browser";
  try {
    const id = localStorage.getItem(VAULT_ACTIVE_KEY);
    if (id && metas.some((m) => m.id === id)) return id;
  } catch {
    /* ignore */
  }
  return metas[0]?.id ?? "local-browser";
}

export function writeActiveVaultId(id: string): void {
  try {
    localStorage.setItem(VAULT_ACTIVE_KEY, id);
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

export function saveSnapshot(vaultId: string, snap: VaultSnapshotV1): void {
  try {
    localStorage.setItem(vaultSnapshotKey(vaultId), JSON.stringify(snap));
  } catch {
    /* ignore */
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
