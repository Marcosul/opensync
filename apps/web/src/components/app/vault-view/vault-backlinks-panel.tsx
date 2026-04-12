"use client";

import { useMemo } from "react";

import { collectDocIdsFromTree } from "@/components/app/vault-tree-ops";
import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";

import { noteMarkdown } from "./vault-graph-model";

/** Painel lateral no modo editor: notas que referenciam o doc ativo (`[[docId]]`). */
export function BacklinksPanel({
  docId,
  treeChildren,
  noteContents,
  onSelect,
}: {
  docId: string;
  treeChildren: TreeEntry[];
  noteContents: Record<string, string>;
  onSelect: (id: string) => void;
}) {
  const needle = `[[${docId}]]`;
  const backlinks = useMemo(() => {
    const ids = collectDocIdsFromTree(treeChildren).filter((id) => id !== docId);
    return ids.filter((id) => noteMarkdown(id, noteContents).includes(needle));
  }, [docId, treeChildren, noteContents, needle]);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Backlinks ({backlinks.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {backlinks.length === 0 ? (
          <p className="px-1 py-2 font-mono text-[10px] italic text-muted-foreground/50">
            Nenhum backlink
          </p>
        ) : (
          <ul className="space-y-0.5">
            {backlinks.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                  <span className="min-w-0 truncate">{id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
