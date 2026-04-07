import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";
import type { VaultSnapshotV1 } from "@/components/app/vault-persistence";
import { initialVaultUi } from "@/components/app/vault-persistence";

const ROOT_PATH = "ssh-vault-root";

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

function collectExpandedPaths(node: TreeEntry, depth: number, out: Set<string>): void {
  if (node.type !== "dir") return;
  if (depth <= 2) out.add(node.path);
  for (const c of node.children) {
    if (c.type === "dir") collectExpandedPaths(c, depth + 1, out);
  }
}

const EMPTY_HINT_DOC = ".opensync-remote-placeholder.md";

/**
 * Converte mapa relativo path -> conteudo UTF-8 num snapshot do explorador.
 */
export function remoteTextFilesToVaultSnapshot(files: Record<string, string>): VaultSnapshotV1 {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) {
    const nk = k.replace(/^\//, "").replace(/\\/g, "/").trim();
    if (nk) normalized[nk] = v;
  }

  const paths = Object.keys(normalized).sort();

  const root: DirNode = {
    type: "dir",
    name: "remote",
    path: ROOT_PATH,
    children: [],
  };

  const noteContents: Record<string, string> = {};

  if (paths.length === 0) {
    const hint =
      "# Pasta remota\n\nNenhum ficheiro de texto foi importado (pasta vazia, limite atingido ou apenas binarios). Verifique o caminho no servidor e tente atualizar.\n";
    root.children.push({ type: "file", name: ".opensync-remote-placeholder.md", docId: EMPTY_HINT_DOC });
    noteContents[EMPTY_HINT_DOC] = hint;
    sortTree(root);
    return {
      v: 1,
      tree: root,
      noteContents,
      expandedPaths: [ROOT_PATH],
      bookmarks: [],
      ui: {
        ...initialVaultUi,
        openTabs: [EMPTY_HINT_DOC],
        activeTabId: EMPTY_HINT_DOC,
      },
    };
  }

  for (const rel of paths) {
    const parts = rel.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    insertFile(root, parts, rel);
    noteContents[rel] = normalized[rel] ?? "";
  }

  sortTree(root);

  const expandedPaths = new Set<string>([ROOT_PATH]);
  collectExpandedPaths(root, 0, expandedPaths);

  const mdFirst = paths.find((p) => /\.(md|mdx)$/i.test(p));
  const openTab = mdFirst ?? paths[0] ?? "";

  return {
    v: 1,
    tree: root,
    noteContents,
    expandedPaths: [...expandedPaths],
    bookmarks: [],
    ui: {
      ...initialVaultUi,
      openTabs: openTab ? [openTab] : [],
      activeTabId: openTab || initialVaultUi.activeTabId,
    },
  };
}
