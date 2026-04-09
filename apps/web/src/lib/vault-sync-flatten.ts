import {
  docIdForFileInParent,
  docIdPrefixFromDirPath,
} from "@/components/app/vault-tree-ops";
import type { VaultMeta, VaultSnapshotV1 } from "@/components/app/vault-persistence";
import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";
import {
  GIT_LAZY_PLACEHOLDER_DOC_ID,
  collectLazyGitRepoRelativePaths,
  isGitLazyVaultTree,
} from "@/lib/vault-git-tree-import";

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

/**
 * Explorador carrega arvore/conteudo via API Git (evita snapshot monolitico).
 * Vaults ligados ao perfil com import SSH mantem snapshot local completo.
 */
export function usesLazyGitRemote(vaultId: string, meta: VaultMeta | undefined): boolean {
  if (!isBackendSyncVaultId(vaultId)) return false;
  if (meta?.remoteSync === "ssh") return false;
  return true;
}

/**
 * No primeiro render, não usar texto guardado em localStorage para ficheiros do repo
 * Git (vem do Gitea via blob). Evita flash de conteúdo antigo antes do fetch.
 * Se a árvore ainda não é lazy Git, limpa tudo até `scheduleGitTreeRefresh` hidratar.
 */
export function initialNoteContentsForLazyGitVault(
  snap: VaultSnapshotV1,
  vaultId: string,
  meta: VaultMeta | undefined,
): Record<string, string> {
  if (!usesLazyGitRemote(vaultId, meta)) return { ...snap.noteContents };
  if (isGitLazyVaultTree(snap.tree)) {
    const paths = new Set(collectLazyGitRepoRelativePaths(snap.tree));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(snap.noteContents)) {
      if (paths.has(k) && k !== GIT_LAZY_PLACEHOLDER_DOC_ID) continue;
      out[k] = v;
    }
    return out;
  }
  return {};
}
