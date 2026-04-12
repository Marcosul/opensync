import type { ExplorerVisibleRow } from "@/components/app/vault-explorer-tree-view";
import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";

export type SidebarMode = "files" | "search" | "bookmarks";
export type TreeSortOrder = "default" | "name" | "name-desc";

function compareTreeEntries(a: TreeEntry, b: TreeEntry): number {
  const aDir = a.type === "dir" ? 0 : 1;
  const bDir = b.type === "dir" ? 0 : 1;
  if (aDir !== bDir) return aDir - bDir;
  return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
}

export function sortTreeEntries(entries: TreeEntry[], order: TreeSortOrder): TreeEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (order === "default") return compareTreeEntries(a, b);
    if (order === "name") return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    return b.name.localeCompare(a.name, "pt-BR", { sensitivity: "base" });
  });
  return sorted.map((e) =>
    e.type === "dir" ? { ...e, children: sortTreeEntries(e.children, order) } : e,
  );
}

/** Linhas visíveis na ordem do explorador (respeita expand/collapse). */
export function flattenVisibleExplorerRows(
  entries: TreeEntry[],
  expandedPaths: Set<string>,
  parentTreePath: string,
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

export function flattenTreeDocs(
  entries: TreeEntry[],
  prefix = "",
): { docId: string; label: string }[] {
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
