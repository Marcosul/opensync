"use client";

/**
 * Editor de código com Monaco (syntax highlight, números de linha, tema claro/escuro).
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
        "box-border min-h-[min(60vh,480px)] w-full flex-1 resize-y bg-transparent px-3 py-2 font-mono text-[13px] leading-relaxed text-foreground",
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

  if (monacoFailed) {
    return (
      <div
        className={cn(
          "flex min-h-[min(60vh,480px)] min-w-0 flex-1 flex-col overflow-auto rounded-md bg-muted/5",
          className,
        )}
      >
        <VaultCodeEditorFallback docId={docId} value={value} onChange={onChange} />
      </div>
    );
  }

  if (!Editor) {
    return (
      <div
        className={cn(
          "flex min-h-[min(60vh,480px)] min-w-0 flex-1 flex-col overflow-auto rounded-md bg-muted/5",
          className,
        )}
      >
        <VaultCodeEditorFallback docId={docId} value={value} onChange={onChange} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "vault-code-editor-shell flex min-h-[min(60vh,480px)] h-[min(70vh,720px)] w-full min-w-0 flex-col overflow-hidden rounded-md",
        "border border-border/50 bg-[color-mix(in_oklch,var(--card)_92%,transparent)] shadow-sm",
        "dark:border-border/60 dark:bg-[color-mix(in_oklch,var(--muted)_40%,transparent)]",
        className,
      )}
    >
      <Editor
        height="100%"
        language={language}
        theme={dark ? "vs-dark" : "vs"}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        loading={
          <div className="flex h-full min-h-[200px] items-center justify-center bg-muted/20 font-mono text-xs text-muted-foreground">
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
        }}
      />
    </div>
  );
}
