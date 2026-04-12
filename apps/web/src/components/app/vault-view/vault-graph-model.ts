/**
 * Modelo de grafo (nós + ligações) derivado da árvore e do markdown das notas.
 * Usado pelo painel grafo e por contagens de tags/links.
 */
import { collectDocIdsFromTree, extractWikilinks } from "@/components/app/vault-tree-ops";
import { mockDocToMarkdown, type TreeEntry } from "@/components/marketing/openclaw-workspace-mock";

import { DOC_BY_ID } from "./doc-registry";

export type GNode = {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  index?: number;
  degree: number;
};

export type GLink = { source: string | GNode; target: string | GNode };

export function noteMarkdown(docId: string, noteContents: Record<string, string>): string {
  return (
    noteContents[docId] ??
    (DOC_BY_ID[docId] ? mockDocToMarkdown(DOC_BY_ID[docId]) : "")
  );
}

export function buildGraphFromVault(tree: TreeEntry, noteContents: Record<string, string>) {
  const rootChildren = tree.type === "dir" ? tree.children : [];
  const ids = new Set(collectDocIdsFromTree(rootChildren));
  const linkMap = new Map<string, Set<string>>();

  for (const id of [...ids]) {
    const md = noteMarkdown(id, noteContents);
    for (const t of extractWikilinks(md)) {
      if (!linkMap.has(id)) linkMap.set(id, new Set());
      linkMap.get(id)!.add(t);
    }
  }

  for (const tgts of linkMap.values()) {
    for (const t of tgts) ids.add(t);
  }

  const degreeMap: Record<string, number> = {};
  for (const id of ids) degreeMap[id] = 0;
  for (const [src, tgts] of linkMap) {
    for (const t of tgts) {
      if (ids.has(t)) {
        degreeMap[src] = (degreeMap[src] ?? 0) + 1;
        degreeMap[t] = (degreeMap[t] ?? 0) + 1;
      }
    }
  }

  const nodes: GNode[] = [...ids].map((id) => ({ id, degree: degreeMap[id] ?? 0 }));
  const links: GLink[] = [];
  for (const [src, tgts] of linkMap) {
    for (const t of tgts) {
      if (ids.has(t)) links.push({ source: src, target: t });
    }
  }
  return { nodes, links };
}

export function computeTopTags(
  tree: TreeEntry,
  noteContents: Record<string, string>,
): [string, number][] {
  const rootChildren = tree.type === "dir" ? tree.children : [];
  const counts: Record<string, number> = {};
  for (const id of collectDocIdsFromTree(rootChildren)) {
    const md = noteMarkdown(id, noteContents);
    for (const t of extractWikilinks(md)) {
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14);
}
