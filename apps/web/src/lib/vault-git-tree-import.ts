import type { VaultSnapshotV1 } from "@/components/app/vault-persistence";
import { initialVaultUi } from "@/components/app/vault-persistence";
import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";

const ROOT_PATH = "git-vault-root";

type DirNode = Extract<TreeEntry, { type: "dir" }>;

function ensureChildDir(parent: DirNode, name: string, treePath: string): DirNode {
  const existing = parent.children.find(
    (c): c is DirNode => c.type === "dir" && c.name === name,
  );
  if (existing) return existing;
  const dir: DirNode = { type: "dir", name, path: treePath, children: [] };
  parent.children.push(dir);
  return dir;
}

function insertFile(root: DirNode, parts: string[], docId: string): void {
  if (parts.length === 0) return;
  let parent = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    const treePath = `${parent.path}/${seg}`.replace(/\/+/g, "/");
    parent = ensureChildDir(parent, seg, treePath);
  }
  const fileName = parts[parts.length - 1];
  parent.children.push({ type: "file", name: fileName, docId });
}

function sortTree(node: TreeEntry): void {
  if (node.type !== "dir") return;
  node.children.sort((a, b) => {
    if (a.type === "dir" && b.type !== "dir") return -1;
    if (a.type !== "dir" && b.type === "dir") return 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

export const GIT_LAZY_PLACEHOLDER_DOC_ID = ".opensync-git-placeholder.md";

/**
 * Pastas vazias no Git precisam de um ficheiro; `.gitkeep` é só marcador no repo — não é nota.
 */
export function isGitKeepMarkerPath(rel: string): boolean {
  const n = rel.replace(/\\/g, "/").trim();
  if (!n) return false;
  return n === ".gitkeep" || n.endsWith("/.gitkeep");
}

/**
 * Arvore do explorador a partir da lista de paths do Git (conteudo carregado depois via blob).
 */
export function gitTreePathsToVaultSnapshot(paths: string[]): VaultSnapshotV1 {
  const normalized = [
    ...new Set(
      paths
        .map((p) => p.replace(/\\/g, "/").trim())
        .filter((p) => p.length > 0 && !isGitKeepMarkerPath(p)),
    ),
  ].sort();

  const root: DirNode = {
    type: "dir",
    name: "repo",
    path: ROOT_PATH,
    children: [],
  };

  if (normalized.length === 0) {
    const hint =
      "# Repositorio vazio\n\nAinda nao ha ficheiros no Gitea, ou o clone falhou. Faca push a partir da VPS ou sincronize a partir do OpenSync.\n";
    root.children.push({
      type: "file",
      name: ".opensync-git-placeholder.md",
      docId: GIT_LAZY_PLACEHOLDER_DOC_ID,
    });
    sortTree(root);
    return {
      v: 1,
      tree: root,
      noteContents: { [GIT_LAZY_PLACEHOLDER_DOC_ID]: hint },
      expandedPaths: [],
      bookmarks: [],
      ui: {
        ...initialVaultUi,
        openTabs: [GIT_LAZY_PLACEHOLDER_DOC_ID],
        activeTabId: GIT_LAZY_PLACEHOLDER_DOC_ID,
      },
    };
  }

  for (const rel of normalized) {
    const parts = rel.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    insertFile(root, parts, rel);
  }

  sortTree(root);

  const mdFirst = normalized.find((p) => /\.(md|mdx)$/i.test(p));
  const openTab = mdFirst ?? normalized[0] ?? "";

  return {
    v: 1,
    tree: root,
    noteContents: {},
    expandedPaths: [],
    bookmarks: [],
    ui: {
      ...initialVaultUi,
      openTabs: openTab ? [openTab] : [],
      activeTabId: openTab || initialVaultUi.activeTabId,
    },
  };
}

export function isGitLazyVaultTree(tree: TreeEntry): boolean {
  return tree.type === "dir" && tree.path === ROOT_PATH;
}

/** Caminhos relativos no repo (docIds) a partir da arvore lazy atual; exclui placeholder. */
/**
 * Depois de atualizar a árvore a partir do Gitea: não reutilizar texto em cache para
 * ficheiros que existem no remoto (localStorage ficaria desatualizado). Preserva só
 * rascunhos locais (`dirty`) e ficheiros que ainda não estão no remoto.
 */
export function mergeLazyGitNoteContentsAfterRemoteTree(
  prev: Record<string, string>,
  nextBaseNoteContents: Record<string, string>,
  remotePaths: readonly string[],
  allowed: ReadonlySet<string>,
  dirty: ReadonlySet<string>,
): Record<string, string> {
  const remote = new Set(remotePaths);
  const merged: Record<string, string> = { ...nextBaseNoteContents };
  for (const [k, v] of Object.entries(prev)) {
    if (!allowed.has(k)) continue;
    if (remote.has(k) && !dirty.has(k)) continue;
    merged[k] = v;
  }
  return merged;
}

export function collectLazyGitRepoRelativePaths(tree: TreeEntry): string[] {
  if (!isGitLazyVaultTree(tree) || tree.type !== "dir") return [];
  const out: string[] = [];
  function walk(entries: TreeEntry[]) {
    for (const e of entries) {
      if (e.type === "dir") walk(e.children);
      else if (
        "docId" in e &&
        e.docId !== GIT_LAZY_PLACEHOLDER_DOC_ID &&
        !isGitKeepMarkerPath(e.docId)
      ) {
        out.push(e.docId);
      }
    }
  }
  walk(tree.children);
  return out;
}
