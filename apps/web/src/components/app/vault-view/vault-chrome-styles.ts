import { cn } from "@/lib/utils";

/** Item de menu dropdown na barra do editor/grafo. */
export const vaultChromeMenuItemClass = cn(
  "flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
  "text-foreground data-highlighted:bg-muted",
);

/** Estilos da linha de renomeação inline no explorador. */
export const EXPLORER_INLINE_RENAME_ROW_CLASS =
  "flex w-full items-center gap-1 rounded-md bg-muted/40 px-1 py-0.5";

export const EXPLORER_INLINE_RENAME_INPUT_CLASS =
  "min-w-0 flex-1 rounded-sm bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none selection:bg-muted focus-visible:ring-0 dark:bg-transparent";
