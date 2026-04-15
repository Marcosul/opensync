"use client";

import { insertVaultPlateTable } from "@/components/app/vault-plate-editor-kit";
import { toggleList } from "@platejs/list";
import { GripVertical } from "lucide-react";
import type { PlateEditor } from "platejs/react";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, Element, Range, Point } from "slate";
import { ReactEditor } from "slate-react";

import { cn } from "@/lib/utils";

export type SlashCommand = {
  id: string;
  label: string;
  hint?: string;
  run: (editor: PlateEditor) => void;
};

function isCollapsedAtEmptyBlockStart(editor: PlateEditor): boolean {
  const e = editor as unknown as import("slate").Editor;
  const { selection } = e;
  if (!selection || !Range.isCollapsed(selection)) return false;
  const block = Editor.above(e, {
    match: (n) => Element.isElement(n) && Editor.isBlock(e, n),
  });
  if (!block) return false;
  const [, path] = block;
  const start = Editor.start(e, path);
  if (!Point.equals(selection.anchor, start)) return false;
  return Editor.string(e, { anchor: start, focus: selection.anchor }) === "";
}

export function buildVaultSlashCommands(): SlashCommand[] {
  return [
    {
      id: "p",
      label: "Parágrafo",
      run: (editor) => {
        (editor.tf as { p?: { resetBlockType?: () => void } }).p?.resetBlockType?.();
      },
    },
    {
      id: "h1",
      label: "Título 1",
      run: (editor) => {
        (editor.tf as { h1?: { toggle: () => void } }).h1?.toggle();
      },
    },
    {
      id: "h2",
      label: "Título 2",
      run: (editor) => {
        (editor.tf as { h2?: { toggle: () => void } }).h2?.toggle();
      },
    },
    {
      id: "h3",
      label: "Título 3",
      run: (editor) => {
        (editor.tf as { h3?: { toggle: () => void } }).h3?.toggle();
      },
    },
    {
      id: "quote",
      label: "Citação",
      run: (editor) => {
        (editor.tf as { blockquote?: { toggle: () => void } }).blockquote?.toggle();
      },
    },
    {
      id: "ul",
      label: "Lista com marcadores",
      run: (editor) => {
        toggleList(editor, { listStyleType: "disc" });
      },
    },
    {
      id: "ol",
      label: "Lista numerada",
      run: (editor) => {
        toggleList(editor, { listStyleType: "decimal" });
      },
    },
    {
      id: "hr",
      label: "Linha horizontal",
      hint: "—",
      run: (editor) => {
        editor.tf.insertNodes(
          { type: "hr", children: [{ text: "" }] },
          { select: true },
        );
      },
    },
    {
      id: "table",
      label: "Tabela 3×3",
      run: (editor) => {
        insertVaultPlateTable(editor, { rowCount: 3, colCount: 3, header: true });
      },
    },
    {
      id: "code_block",
      label: "Bloco de código",
      hint: "```",
      run: (editor) => {
        const tf = editor.tf as { code_block?: { toggle: () => void } };
        tf.code_block?.toggle();
      },
    },
  ];
}

type SlashPopoverProps = {
  editor: PlateEditor;
  open: boolean;
  anchorRect: DOMRect | null;
  commands: SlashCommand[];
  onClose: () => void;
};

export function VaultPlateSlashPopover({
  editor,
  open,
  anchorRect,
  commands,
  onClose,
}: SlashPopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  activeIndexRef.current = activeIndex;

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      activeIndexRef.current = 0;
    }
  }, [open]);

  useEffect(() => {
    if (!open || commands.length === 0) return;
    const el = itemRefs.current[activeIndex];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex, open, commands.length]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) onClose();
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [open, onClose]);

  const run = useCallback(
    (cmd: SlashCommand) => {
      cmd.run(editor);
      queueMicrotask(() => {
        editor.tf.focus();
      });
      onClose();
    },
    [editor, onClose],
  );

  useEffect(() => {
    if (!open || commands.length === 0) return;

    const onWindowKeyDown = (e: globalThis.KeyboardEvent) => {
      const n = commands.length;
      if (n === 0) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        queueMicrotask(() => editor.tf.focus());
        return;
      }

      if (e.key === "PageDown" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.min(i + 1, n - 1));
        return;
      }

      if (e.key === "PageUp" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (e.key === "Home") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(0);
        return;
      }

      if (e.key === "End") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(n - 1);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const cmd = commands[activeIndexRef.current];
        if (cmd) run(cmd);
        return;
      }
    };

    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [open, commands, editor, onClose, run]);

  if (!open || !anchorRect || typeof document === "undefined") return null;

  const top = anchorRect.top + window.scrollY + anchorRect.height + 4;
  const left = Math.min(
    anchorRect.left + window.scrollX,
    window.scrollX + window.innerWidth - 280,
  );

  return createPortal(
    <div
      ref={rootRef}
      role="listbox"
      aria-label="Comandos rápidos"
      aria-activedescendant={commands[activeIndex] ? `vault-slash-${commands[activeIndex].id}` : undefined}
      tabIndex={-1}
      className="fixed z-[100] w-[min(100vw-1.5rem,17rem)] rounded-lg border border-border bg-popover p-1 text-sm shadow-xl outline-none"
      style={{ top, left }}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <GripVertical className="size-3.5 shrink-0" aria-hidden />
        Comandos
      </div>
      <ul className="max-h-[min(50vh,18rem)] overflow-y-auto py-0.5" role="presentation">
        {commands.map((cmd, index) => (
          <li key={cmd.id} role="presentation">
            <button
              id={`vault-slash-${cmd.id}`}
              type="button"
              role="option"
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              aria-selected={index === activeIndex}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs",
                "hover:bg-muted/80 focus:outline-none",
                index === activeIndex ? "bg-muted text-foreground" : "focus:bg-muted/80",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => run(cmd)}
            >
              <span className="text-foreground">{cmd.label}</span>
              {cmd.hint ? (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{cmd.hint}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}

export function tryOpenSlashMenu(
  editor: PlateEditor,
  e: KeyboardEvent,
  open: (rect: DOMRect) => void,
): boolean {
  if (e.key !== "/" || e.defaultPrevented) return false;
  if (!isCollapsedAtEmptyBlockStart(editor)) return false;
  e.preventDefault();
  const sel = editor.selection;
  if (!sel || !Range.isCollapsed(sel)) return false;
  try {
    const domRange = ReactEditor.toDOMRange(editor as unknown as Parameters<typeof ReactEditor.toDOMRange>[0], sel);
    open(domRange.getBoundingClientRect());
  } catch {
    open(new DOMRect(0, 0, 0, 0));
  }
  return true;
}
