"use client";

import { Tag } from "lucide-react";

/** Painel lateral no modo grafo: destinos de wikilinks mais frequentes. */
export function TagsPanel({
  topTags,
  onSelect,
}: {
  topTags: [string, number][];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <Tag className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Links
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {topTags.map(([id, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-sidebar-accent/60"
          >
            <span className="min-w-0 truncate text-muted-foreground hover:text-foreground">
              {id.replace(".md", "")}
            </span>
            <span className="ml-2 shrink-0 tabular-nums text-muted-foreground/60">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
