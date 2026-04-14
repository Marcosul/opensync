"use client";

import { FileCode2 } from "lucide-react";
import { useMemo, useState } from "react";

import { VaultCodeEditor } from "@/components/app/vault-code-editor";
import { VaultLexicalMarkdownEditor } from "@/components/app/vault-lexical-markdown-editor";
import { cn } from "@/lib/utils";

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export type VaultNoteEditorProps = {
  docId: string;
  value: string;
  onChange: (next: string) => void;
  breadcrumb: string[];
  onSelectFile: (id: string) => void;
  /** Esconde a faixa superior (breadcrumb + alternância de modo); use a barra externa no layout Obsidian. */
  hideTopChrome?: boolean;
  /** Modo fonte controlado pelo pai (com `onSourceModeChange`). */
  sourceMode?: boolean;
  onSourceModeChange?: (next: boolean) => void;
  /**
   * `.txt`, `.json`, código, etc.: força edição em textarea (sem preview Markdown),
   * mesmo que `sourceMode` venha false.
   */
  plainTextDocument?: boolean;
};

export function VaultNoteEditor({
  docId,
  value,
  onChange,
  breadcrumb,
  onSelectFile,
  hideTopChrome = false,
  sourceMode: sourceModeProp,
  onSourceModeChange,
  plainTextDocument = false,
}: VaultNoteEditorProps) {
  const [internalSourceMode, setInternalSourceMode] = useState(false);
  const sourceMode = sourceModeProp ?? internalSourceMode;
  const setSourceMode = onSourceModeChange ?? setInternalSourceMode;
  const useTextareaLayout = plainTextDocument || sourceMode;

  const words = useMemo(() => countWords(value), [value]);
  const chars = value.length;
  const breadcrumbLabel = breadcrumb.join(" / ");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {!hideTopChrome && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2 sm:px-6">
          <p
            className="min-w-0 flex-1 truncate text-center font-mono text-[11px] text-muted-foreground sm:text-xs"
            title={breadcrumbLabel}
          >
            {breadcrumbLabel}
          </p>
          {!plainTextDocument ? (
            <button
              type="button"
              onClick={() => setSourceMode(!sourceMode)}
              className={cn(
                "rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                sourceMode && "bg-muted text-foreground",
              )}
              title={sourceMode ? "Modo rich text (Lexical)" : "Modo fonte (Markdown completo)"}
              aria-pressed={sourceMode}
            >
              <FileCode2 className="size-4" />
            </button>
          ) : null}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {useTextareaLayout ? (
          plainTextDocument ? (
            <div className="flex h-full min-h-0 flex-col px-2 py-3 sm:px-4 sm:py-4">
              <VaultCodeEditor
                docId={docId}
                value={value}
                onChange={onChange}
                className="mx-auto w-full max-w-[min(100%,56rem)]"
              />
            </div>
          ) : (
            <div className="h-full overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
              <textarea
                key={docId}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                spellCheck
                className="mx-auto block min-h-[min(60vh,480px)] w-full max-w-2xl resize-y border-0 bg-transparent px-3 py-2 font-mono text-sm leading-relaxed text-foreground shadow-none ring-0 outline-none focus-visible:ring-0"
              />
            </div>
          )
        ) : (
          <VaultLexicalMarkdownEditor
            key={docId}
            docId={docId}
            value={value}
            onChange={onChange}
            onSelectFile={onSelectFile}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-card/30 px-3 py-1.5 font-mono text-[10px] text-muted-foreground sm:text-[11px]">
        <span>{useTextareaLayout ? "Fonte" : "Live"}</span>
        <span className="tabular-nums">{words} palavras</span>
        <span className="tabular-nums">{chars} caracteres</span>
      </div>
    </div>
  );
}
