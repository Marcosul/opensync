import {
  docIdForFileInParent,
  docIdPrefixFromDirPath,
} from "@/components/app/vault-tree-ops";
import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";

/**
 * Pastas vazias não existem em Git sem um ficheiro; `.gitkeep` mantém-as visíveis no Gitea.
 */
function ensureEmptyDirMarkers(dirPath: string, out: Record<string, string>) {
  const base = docIdPrefixFromDirPath(dirPath).replace(/\/$/, "");
  if (base) {
    const key = `${base}/.gitkeep`;
    if (out[key] === undefined) out[key] = "";
  }
}

function walk(
  parentTreePath: string,
  entries: TreeEntry[],
  out: Record<string, string>,
  noteContents: Record<string, string>,
) {
  for (const e of entries) {
    if (e.type === "dir") {
      if (e.children.length === 0) {
        ensureEmptyDirMarkers(e.path, out);
      }
      walk(e.path, e.children, out, noteContents);
    } else {
      if ("disabled" in e && e.disabled) continue;
      if (!("docId" in e)) continue;
      const syncPath = docIdForFileInParent(parentTreePath, e.name);
      out[syncPath] = noteContents[e.docId] ?? "";
    }
  }
}

/**
 * Mapa relativo docId -> conteúdo UTF-8 para envio ao backend / Gitea.
 */
export function flattenVaultTreeToSyncFiles(
  tree: TreeEntry,
  noteContents: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (tree.type !== "dir") return out;
  walk(tree.path, tree.children, out, noteContents);
  return out;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Vault persistido no Nest (tem repo Gitea) vs cofre só local no browser. */
export function isBackendSyncVaultId(vaultId: string): boolean {
  return UUID_RE.test(vaultId.trim());
}
