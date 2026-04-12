"use client";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/** Separador de ficheiro com botão fechar. */
export function FileTab({
  fileId,
  active,
  onSelect,
  onClose,
}: {
  fileId: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const shortName = fileId.includes("/") ? fileId.split("/").pop() ?? fileId : fileId;

  return (
    <div
      className={cn(
        "flex max-w-[min(200px,40vw)] shrink-0 items-stretch rounded-md border font-mono text-xs transition-colors",
        active
          ? "border-sidebar-border/60 bg-sidebar-accent text-sidebar-accent-foreground"
          : "border-transparent bg-transparent text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate px-2 py-1 text-left"
        title={fileId}
      >
        {shortName}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="flex shrink-0 items-center justify-center rounded-r-md px-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
        aria-label={`Fechar ${fileId}`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
