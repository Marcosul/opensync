"use client";

/**
 * Editor de código com Monaco (syntax highlight, números de linha, tema claro/escuro).
 * Ocupa a altura disponível do contentor (100% via flex); scroll vertical dentro do Monaco.
 * Se o chunk falhar, usa `<textarea>` sem borda como fallback.
 */
import type { EditorProps } from "@monaco-editor/react";
import { useEffect, useMemo, useState, type ComponentType } from "react";

import { monacoLanguageFromDocPath } from "@/lib/vault-file-visual";
import { cn } from "@/lib/utils";

export type VaultCodeEditorProps = {
  docId: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
};

function useDocumentDarkClass(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/** Textarea simples quando Monaco não está disponível (sem borda). */
export function VaultCodeEditorFallback({
  docId,
  value,
  onChange,
  className,
}: VaultCodeEditorProps) {
  return (
    <textarea
      key={docId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      className={cn(
        "box-border h-full min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent px-1 py-2 font-mono text-[13px] leading-relaxed text-foreground sm:px-2",
        "border-0 shadow-none outline-none ring-0 focus-visible:ring-0",
        className,
      )}
      aria-label="Editor de código (modo texto)"
    />
  );
}

export function VaultCodeEditor({ docId, value, onChange, className }: VaultCodeEditorProps) {
  const dark = useDocumentDarkClass();
  const language = useMemo(() => monacoLanguageFromDocPath(docId), [docId]);
  const [Editor, setEditor] = useState<ComponentType<EditorProps> | null>(null);
  const [monacoFailed, setMonacoFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("@monaco-editor/react")
      .then((mod) => {
        if (!cancelled) setEditor(() => mod.default);
      })
      .catch(() => {
        if (!cancelled) setMonacoFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shellClass = cn(
    "vault-code-editor-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent",
    className,
  );

  if (monacoFailed) {
    return (
      <div className={shellClass}>
        <VaultCodeEditorFallback docId={docId} value={value} onChange={onChange} />
      </div>
    );
  }

  if (!Editor) {
    return (
      <div className={shellClass}>
        <VaultCodeEditorFallback docId={docId} value={value} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="relative min-h-0 flex-1">
        <Editor
          key={docId}
          height="100%"
          language={language}
          theme={dark ? "vs-dark" : "vs"}
          value={value}
          onChange={(v) => onChange(v ?? "")}
          loading={
            <div className="flex min-h-[12rem] w-full flex-1 items-center justify-center bg-transparent font-mono text-xs text-muted-foreground">
              A carregar Monaco…
            </div>
          }
          options={{
            minimap: { enabled: true, maxColumn: 80 },
            fontSize: 13,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            padding: { top: 8, bottom: 8 },
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            renderLineHighlight: "line",
            cursorBlinking: "smooth",
            smoothScrolling: true,
            bracketPairColorization: { enabled: true },
            folding: true,
            renderWhitespace: "selection",
            unicodeHighlight: { ambiguousCharacters: false },
            scrollbar: {
              vertical: "auto",
              horizontal: "auto",
            },
          }}
        />
      </div>
    </div>
  );
}
