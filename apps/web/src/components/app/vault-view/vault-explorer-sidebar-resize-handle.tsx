"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

import {
  clampExplorerSidebarWidth,
  EXPLORER_SIDEBAR_MAX_WIDTH,
  EXPLORER_SIDEBAR_MIN_WIDTH,
} from "@/lib/client-ui-settings";
import { cn } from "@/lib/utils";

type VaultExplorerSidebarResizeHandleProps = {
  /** Largura atual do painel (à esquerda deste handle). */
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  /** Chamado ao soltar o ponteiro com a largura final. */
  onResizeEnd: (width: number) => void;
};

export function VaultExplorerSidebarResizeHandle({
  sidebarWidth,
  onSidebarWidthChange,
  onResizeEnd,
}: VaultExplorerSidebarResizeHandleProps) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      onSidebarWidthChange(clampExplorerSidebarWidth(drag.startWidth + delta));
    },
    [onSidebarWidthChange],
  );

  const endDrag = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      const finalWidth = clampExplorerSidebarWidth(drag.startWidth + delta);
      dragRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onResizeEnd(finalWidth);
    },
    [onPointerMove, onResizeEnd],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    [endDrag, onPointerMove, sidebarWidth],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={EXPLORER_SIDEBAR_MIN_WIDTH}
      aria-valuemax={EXPLORER_SIDEBAR_MAX_WIDTH}
      aria-valuenow={sidebarWidth}
      title="Redimensionar explorador"
      onPointerDown={onPointerDown}
      className={cn(
        "group relative z-[1] w-1 shrink-0 cursor-col-resize touch-none select-none",
        "after:absolute after:inset-y-0 after:-left-1 after:right-0 after:w-3",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-px bg-border",
          "group-hover:bg-primary/50 group-active:bg-primary",
        )}
        aria-hidden
      />
    </div>
  );
}
