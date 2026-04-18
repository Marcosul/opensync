"use client";

import { useIndentButton, useOutdentButton } from "@platejs/indent/react";
import { upsertLink } from "@platejs/link";
import { ListStyleType } from "@platejs/list";
import { useListToolbarButton, useListToolbarButtonState } from "@platejs/list/react";
import type { LucideIcon } from "lucide-react";
import {
  Bold,
  Braces,
  ChevronDown,
  Code,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Keyboard,
  Link2,
  List,
  ListOrdered,
  Minus,
  PaintBucket,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Underline,
} from "lucide-react";
import type { TElement } from "platejs";
import { KEYS } from "platejs";
import { useEditorRef, useEditorSelector } from "platejs/react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Editor } from "slate";

import { insertVaultPlateTable, setVaultBlockType } from "@/components/app/vault-plate-editor-kit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function removeMark(editor: ReturnType<typeof useEditorRef>, key: string) {
  Editor.removeMark(editor as unknown as Editor, key);
}

function ToolbarDivider() {
  return <span className="mx-0.5 hidden h-7 w-px shrink-0 bg-border/80 sm:inline-block" aria-hidden />;
}

function ToolbarIconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(pressed && "border-primary/40 bg-muted text-foreground shadow-inner")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

const TURN_INTO_OPTIONS: { value: string; label: string }[] = [
  { value: KEYS.p, label: "Parágrafo" },
  { value: KEYS.h1, label: "Título 1" },
  { value: KEYS.h2, label: "Título 2" },
  { value: KEYS.h3, label: "Título 3" },
  { value: KEYS.blockquote, label: "Citação" },
];

const HIGHLIGHT_BG_PRESETS = [
  { label: "Amarelo", value: "#fef08a" },
  { label: "Verde", value: "#bbf7d0" },
  { label: "Azul", value: "#bfdbfe" },
  { label: "Rosa", value: "#fbcfe8" },
  { label: "Laranja", value: "#fed7aa" },
] as const;

function VaultTurnIntoBlockButton() {
  const editor = useEditorRef();
  const [open, setOpen] = useState(false);
  const blockType = useEditorSelector((ed) => {
    const block = ed.api.block();
    const t = (block?.[0] as TElement | undefined)?.type;
    return t && TURN_INTO_OPTIONS.some((o) => o.value === t) ? t : KEYS.p;
  }, []);

  const selectedLabel = TURN_INTO_OPTIONS.find((o) => o.value === blockType)?.label ?? "Parágrafo";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-[6rem] min-w-0 shrink-0 justify-between gap-1 px-2 text-xs font-medium"
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Converter bloco"
          aria-expanded={open}
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="ignore-click-outside/toolbar min-w-[12rem]"
        align="start"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.tf.focus();
        }}
      >
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Converter para</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={blockType}
          onValueChange={(v) => {
            setVaultBlockType(editor, v);
            setOpen(false);
          }}
        >
          {TURN_INTO_OPTIONS.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColorPresetDropdown({
  icon: Icon,
  label,
  presets,
  markKey,
  onPick,
}: {
  icon: LucideIcon;
  label: string;
  presets: readonly { label: string; value: string }[];
  markKey: string;
  onPick: (value: string) => void;
}) {
  const editor = useEditorRef();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          title={label}
          aria-label={label}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Icon className="size-3.5" strokeWidth={2.25} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="ignore-click-outside/toolbar min-w-[10rem]"
        align="start"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.tf.focus();
        }}
      >
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">{label}</DropdownMenuLabel>
        <div className="flex flex-wrap gap-1.5 px-2 pb-2">
          {presets.map((p) => (
            <button
              key={p.value}
              type="button"
              title={p.label}
              className="size-7 rounded-md border border-border shadow-sm transition hover:ring-2 hover:ring-primary/30"
              style={{ backgroundColor: p.value }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(p.value);
                setOpen(false);
                queueMicrotask(() => editor.tf.focus());
              }}
            />
          ))}
        </div>
        <div className="border-t border-border px-2 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              removeMark(editor, markKey);
              setOpen(false);
              queueMicrotask(() => editor.tf.focus());
            }}
          >
            Limpar
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VaultPlateToolbar() {
  const editor = useEditorRef();
  const { props: indentBtn } = useIndentButton();
  const { props: outdentBtn } = useOutdentButton();
  const tf = editor.tf as typeof editor.tf & {
    bold: { toggle: () => void };
    italic: { toggle: () => void };
    underline: { toggle: () => void };
    strikethrough: { toggle: () => void };
    code: { toggle: () => void };
    highlight: { toggle: () => void };
    kbd: { toggle: () => void };
    subscript: { toggle: () => void };
    superscript: { toggle: () => void };
    code_block: { toggle: () => void };
    backgroundColor: { addMark: (v: string) => void };
  };

  const boldOn = useEditorSelector((ed) => !!ed?.selection && ed.api.hasMark(KEYS.bold), []);
  const italicOn = useEditorSelector((ed) => !!ed?.selection && ed.api.hasMark(KEYS.italic), []);
  const underlineOn = useEditorSelector((ed) => !!ed?.selection && ed.api.hasMark(KEYS.underline), []);
  const strikeOn = useEditorSelector((ed) => !!ed?.selection && ed.api.hasMark(KEYS.strikethrough), []);
  const codeOn = useEditorSelector((ed) => !!ed?.selection && ed.api.hasMark(KEYS.code), []);
  const highlightOn = useEditorSelector((ed) => !!ed?.selection && ed.api.hasMark(KEYS.highlight), []);
  const kbdOn = useEditorSelector((ed) => !!ed?.selection && ed.api.hasMark(KEYS.kbd), []);
  const subOn = useEditorSelector((ed) => !!ed?.selection && ed.api.hasMark(KEYS.sub), []);
  const supOn = useEditorSelector((ed) => !!ed?.selection && ed.api.hasMark(KEYS.sup), []);

  const ulState = useListToolbarButtonState({ nodeType: ListStyleType.Disc });
  const ulBtn = useListToolbarButton(ulState);
  const olState = useListToolbarButtonState({ nodeType: ListStyleType.Decimal });
  const olBtn = useListToolbarButton(olState);

  const onInsertLink = useCallback(() => {
    const url = window.prompt("URL do link (https…, mailto:, wikilink:…)");
    if (!url?.trim()) return;
    upsertLink(editor, { url: url.trim() });
  }, [editor]);

  return (
    <div className="sticky top-0 left-0 z-50 flex w-full flex-col gap-1 overflow-x-auto rounded-t-[inherit] border-b border-border/60 bg-muted/30 p-1.5 backdrop-blur-sm supports-[backdrop-filter]:bg-muted/20 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex min-w-0 flex-1 select-none flex-wrap items-center gap-0.5">
        <VaultTurnIntoBlockButton />

        <ToolbarDivider />

        <ToolbarIconButton label="Negrito" pressed={boldOn} onClick={() => tf.bold.toggle()}>
          <Bold className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
        <ToolbarIconButton label="Itálico" pressed={italicOn} onClick={() => tf.italic.toggle()}>
          <Italic className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
        <ToolbarIconButton label="Sublinhado" pressed={underlineOn} onClick={() => tf.underline.toggle()}>
          <Underline className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
        <ToolbarIconButton label="Riscado" pressed={strikeOn} onClick={() => tf.strikethrough.toggle()}>
          <Strikethrough className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
        <ToolbarIconButton label="Código inline (`)" pressed={codeOn} onClick={() => tf.code.toggle()}>
          <Code className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
        <ToolbarIconButton label="Marcador (realce)" pressed={highlightOn} onClick={() => tf.highlight.toggle()}>
          <Highlighter className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
        <ToolbarIconButton label="Tecla (kbd)" pressed={kbdOn} onClick={() => tf.kbd.toggle()}>
          <Keyboard className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
        <ToolbarIconButton label="Subscrito" pressed={subOn} onClick={() => tf.subscript.toggle()}>
          <Subscript className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
        <ToolbarIconButton label="Superescrito" pressed={supOn} onClick={() => tf.superscript.toggle()}>
          <Superscript className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>

        <ToolbarDivider />

        <ColorPresetDropdown
          icon={PaintBucket}
          label="Realce de fundo (texto)"
          markKey={KEYS.backgroundColor}
          presets={HIGHLIGHT_BG_PRESETS}
          onPick={(v) => tf.backgroundColor.addMark(v)}
        />

        <ToolbarDivider />

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          title="Lista com marcas"
          aria-label="Lista com marcas"
          aria-pressed={ulBtn.props.pressed}
          className={cn(ulBtn.props.pressed && "border-primary/40 bg-muted shadow-inner")}
          onMouseDown={(e) => {
            e.preventDefault();
            ulBtn.props.onMouseDown?.(e);
          }}
          onClick={ulBtn.props.onClick}
        >
          <List className="size-3.5" strokeWidth={2.25} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          title="Lista numerada"
          aria-label="Lista numerada"
          aria-pressed={olBtn.props.pressed}
          className={cn(olBtn.props.pressed && "border-primary/40 bg-muted shadow-inner")}
          onMouseDown={(e) => {
            e.preventDefault();
            olBtn.props.onMouseDown?.(e);
          }}
          onClick={olBtn.props.onClick}
        >
          <ListOrdered className="size-3.5" strokeWidth={2.25} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          title="Diminuir indentação"
          aria-label="Diminuir indentação"
          onMouseDown={(e) => {
            e.preventDefault();
            outdentBtn.onMouseDown?.(e);
          }}
          onClick={outdentBtn.onClick}
        >
          <IndentDecrease className="size-3.5" strokeWidth={2.25} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          title="Aumentar indentação"
          aria-label="Aumentar indentação"
          onMouseDown={(e) => {
            e.preventDefault();
            indentBtn.onMouseDown?.(e);
          }}
          onClick={indentBtn.onClick}
        >
          <IndentIncrease className="size-3.5" strokeWidth={2.25} />
        </Button>

        <ToolbarDivider />

        <ToolbarIconButton label="Inserir link" onClick={onInsertLink}>
          <Link2 className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>

        <ToolbarDivider />

        <ToolbarIconButton label="Bloco de código (fence)" onClick={() => tf.code_block.toggle()}>
          <Braces className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="Linha horizontal"
          onClick={() => {
            editor.tf.insertNodes({ type: KEYS.hr, children: [{ text: "" }] });
          }}
        >
          <Minus className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="Inserir tabela 3×3"
          onClick={() => {
            insertVaultPlateTable(editor, { header: true, colCount: 3, rowCount: 3 });
          }}
        >
          <Table2 className="size-3.5" strokeWidth={2.25} />
        </ToolbarIconButton>
      </div>
    </div>
  );
}
