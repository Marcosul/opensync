import {
  findDocBreadcrumbFromEntries,
  type TreeEntry,
} from "@/components/marketing/openclaw-workspace-mock";

/**
 * Breadcrumb estável para a barra do editor: se o doc ainda não está na árvore,
 * `findDocBreadcrumbFromEntries` devolve `[docId]` inteiro — partimos por `/` para não “piscar” um único blob.
 */
export function vaultDocBreadcrumb(treeChildren: TreeEntry[], docId: string): string[] {
  const found = findDocBreadcrumbFromEntries(treeChildren, docId);
  if (found.length === 1 && found[0] === docId && docId.includes("/")) {
    return docId.split("/");
  }
  return found;
}
