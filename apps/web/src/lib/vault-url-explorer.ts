import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";

type DirRoot = Extract<TreeEntry, { type: "dir" }>;

/**
 * Caminho relativo à raiz do explorador (ex.: `notas/foo` para `git-vault-root/notas/foo`).
 */
export function explorerRelativePath(explorerRoot: DirRoot, entryPath: string): string | null {
  if (entryPath === explorerRoot.path) return "";
  const prefix = `${explorerRoot.path}/`;
  if (!entryPath.startsWith(prefix)) return null;
  return entryPath.slice(prefix.length);
}

/**
 * Resolve `folder=notas/sub` para o `path` interno da árvore (`TreeEntry.path`).
 */
export function findDirTreePathByRelativePath(
  explorerRoot: TreeEntry,
  relativePath: string
): string | null {
  if (explorerRoot.type !== "dir") return null;
  const rootDir: DirRoot = explorerRoot;
  const norm = relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (norm === "") return rootDir.path;

  function walk(entries: TreeEntry[]): string | null {
    for (const e of entries) {
      if (e.type !== "dir") continue;
      const rel = explorerRelativePath(rootDir, e.path);
      if (rel === norm) return e.path;
      const deeper = walk(e.children);
      if (deeper) return deeper;
    }
    return null;
  }
  return walk(rootDir.children);
}
