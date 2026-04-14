"use client";

import { ChevronDown, FileCode2 } from "lucide-react";
import { flushSync } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { VaultCodeEditor } from "@/components/app/vault-code-editor";
import { cn } from "@/lib/utils";

/** Mesmo recuo do bloco em preview e em edição (sem salto ao clicar). */
const BLOCK_SHELL = "mb-1 rounded-md px-1 py-0";

/**
 * `texto.## Título` vira `texto.\n## Título` para o remark reconhecer o ATX heading.
 * Não altera blocos com fenced code (evita falsos positivos).
 */
function normalizeNewlineBeforeHeadings(src: string): string {
  if (src.includes("```")) return src;
  return src.replace(/([^\n])(#{1,6}\s+)/g, "$1\n$2");
}

/**
 * O rascunho do bloco virou vários blocos Markdown (ex.: parágrafo + ## linha).
 * Não dispara em `\\n#` sozinho (H1 vazio) para o usuário poder completar `##`.
 */
function shouldAutoSplitBlockDraft(draft: string): boolean {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(draft) as {
    children: Array<{ type: string; depth?: number; children?: unknown[] }>;
  };
  if (tree.children.length < 2) return false;
  const second = tree.children[1];
  if (second.type !== "heading") return true;
  if (second.depth === 1 && (!second.children || second.children.length === 0)) {
    return false;
  }
  return true;
}

type MarkdownSegment =
  | { kind: "block"; start: number; end: number; source: string }
  | { kind: "gap"; start: number; end: number; source: string };

type MdastBlock = {
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

function extractMarkdownSegments(src: string): MarkdownSegment[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(src) as { children: MdastBlock[] };
  const ranges: { start: number; end: number }[] = [];

  for (const node of tree.children) {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (typeof start === "number" && typeof end === "number" && end >= start) {
      ranges.push({ start, end });
    }
  }

  if (ranges.length === 0) {
    return [{ kind: "block", start: 0, end: src.length, source: src }];
  }

  ranges.sort((a, b) => a.start - b.start);

  const segments: MarkdownSegment[] = [];
  let cursor = 0;

  for (const r of ranges) {
    if (r.start > cursor) {
      segments.push({
        kind: "gap",
        start: cursor,
        end: r.start,
        source: src.slice(cursor, r.start),
      });
    }
    segments.push({
      kind: "block",
      start: r.start,
      end: r.end,
      source: src.slice(r.start, r.end),
    });
    cursor = r.end;
  }

  if (cursor < src.length) {
    segments.push({
      kind: "gap",
      start: cursor,
      end: src.length,
      source: src.slice(cursor),
    });
  }

  return segments;
}

function replaceSegment(
  full: string,
  start: number,
  end: number,
  nextSlice: string
): string {
  return full.slice(0, start) + nextSlice + full.slice(end);
}

function preprocessWikiLinksForMarkdown(source: string): string {
  return source.replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => {
    return `[${id}](wikilink:${encodeURIComponent(id)})`;
  });
}

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** Bloco que é só um título em uma linha (como no Live Preview do Obsidian). */
function parseSingleLineHeading(source: string): {
  level: number;
  body: string;
  suffix: string;
} | null {
  const suffix = source.match(/(\n*)$/)?.[1] ?? "";
  const core = source.slice(0, source.length - suffix.length);
  const m = core.match(/^(#{1,6})\s+(.*)$/);
  if (!m) return null;
  const body = m[2];
  if (body.includes("\n")) return null;
  return { level: m[1].length, body, suffix };
}

const headingBodyInputClass: Record<number, string> = {
  1: "text-3xl font-bold tracking-tight",
  2: "text-2xl font-semibold tracking-tight",
  3: "text-xl font-semibold",
  4: "text-lg font-semibold",
  5: "text-base font-semibold",
  6: "text-sm font-semibold",
};

type WikiPiece = { kind: "text"; text: string } | { kind: "wiki"; id: string };

function splitWikilinksPieces(s: string): WikiPiece[] {
  const re = /\[\[([^\]]+)\]\]/g;
  const out: WikiPiece[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", text: s.slice(last, m.index) });
    }
    out.push({ kind: "wiki", id: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    out.push({ kind: "text", text: s.slice(last) });
  }
  if (out.length === 0) {
    out.push({ kind: "text", text: s });
  }
  return out;
}

function hasWikilinkSyntax(s: string): boolean {
  return s.includes("[[");
}

/** Texto contínuo sem wikilinks nem marcadores comuns de Markdown. */
function isPlainProseBlock(s: string): boolean {
  if (hasWikilinkSyntax(s)) return false;
  if (/^#{1,6}\s/m.test(s)) return false;
  if (/^\s*[-*+]\s/m.test(s)) return false;
  if (/^\s*\d+\.\s/m.test(s)) return false;
  if (/```/.test(s)) return false;
  if (/\*\*|__|`/.test(s)) return false;
  if (/^>\s/m.test(s)) return false;
  return true;
}

function WikiLinkHighlightLayer({ text }: { text: string }) {
  const pieces = splitWikilinksPieces(text);
  return (
    <>
      {pieces.map((p, i) =>
        p.kind === "text" ? (
          <span key={i} className="text-foreground/90">
            {p.text}
          </span>
        ) : (
          <span key={i}>
            <span className="text-muted-foreground/65">[[</span>
            <span className="font-medium text-primary">{p.id}</span>
            <span className="text-muted-foreground/65">]]</span>
          </span>
        )
      )}
    </>
  );
}

/** Textarea transparente + camada com `[[` / `]]` coloridos (texto real invisível, caret visível). */
function WikilinkMirrorTextarea({
  value,
  onChange,
  onBlur,
  onKeyDown,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const rows = Math.min(24, Math.max(1, value.split("\n").length));
  const sharedTypo = "font-sans text-base leading-7";

  return (
    <div
      className={cn(
        "m-0 grid w-full [grid-template-columns:minmax(0,1fr)]",
        "[&>*]:col-start-1 [&>*]:row-start-1"
      )}
    >
      <div
        className={cn(
          "pointer-events-none min-w-0 whitespace-pre-wrap break-words p-0",
          sharedTypo
        )}
        aria-hidden
      >
        <WikiLinkHighlightLayer text={value} />
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        spellCheck
        className={cn(
          "m-0 min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent p-0 text-transparent caret-foreground outline-none selection:bg-primary/25 focus-visible:ring-0",
          sharedTypo
        )}
        aria-label="Editar bloco"
      />
    </div>
  );
}

/**
 * Título: textarea com o Markdown completo (dá para apagar `#` com Backspace).
 * Camada espelho mostra os `#` em cinza; o texto real fica transparente no textarea.
 */
function HeadingMirrorTextarea({
  value,
  onChange,
  onBlur,
  onKeyDown,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const nl = value.indexOf("\n");
  const firstLine = nl === -1 ? value : value.slice(0, nl);
  const tail = nl === -1 ? "" : value.slice(nl);
  const m = firstLine.match(/^(#{1,6})(\s*)(.*)$/);
  const level = m ? Math.min(6, Math.max(1, m[1].length)) : 2;
  const marker = m ? `${m[1]}${m[2]}` : "";
  const bodyOnFirst = m ? m[3] : firstLine;
  const typo = cn(
    "font-sans leading-snug",
    headingBodyInputClass[level] ?? headingBodyInputClass[2]
  );
  const rows = Math.min(24, Math.max(1, value.split("\n").length));

  return (
    <div className="flex min-w-0 gap-1">
      <div className="pointer-events-none flex shrink-0 flex-col pt-1.5" aria-hidden>
        <ChevronDown
          className="size-4 text-muted-foreground/45"
          strokeWidth={2}
          aria-hidden
        />
      </div>
      <div
        className={cn(
          "m-0 min-w-0 flex-1 grid [grid-template-columns:minmax(0,1fr)]",
          "[&>*]:col-start-1 [&>*]:row-start-1",
        )}
      >
        <div
          className={cn("pointer-events-none min-w-0 whitespace-pre-wrap p-0", typo)}
          aria-hidden
        >
          {marker ? (
            <span className="inline-block whitespace-pre-wrap">
              <span className="font-normal text-muted-foreground/65">{marker}</span>
              <span className="text-foreground">{bodyOnFirst}</span>
            </span>
          ) : (
            <span className="text-foreground/90">{firstLine}</span>
          )}
          {tail ? <span className="block text-foreground/85">{tail}</span> : null}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          spellCheck
          className={cn(
            "m-0 min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent p-0 text-transparent caret-foreground outline-none selection:bg-primary/25 focus-visible:ring-0",
            typo,
          )}
          aria-label="Editar título"
        />
      </div>
    </div>
  );
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

const markdownComponents = (
  handleMarkdownLink: (href: string | undefined, children: ReactNode) => ReactNode
) => ({
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mt-0 mb-4 text-3xl font-bold tracking-tight text-foreground">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-0 mb-3 text-2xl font-semibold tracking-tight text-foreground">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-0 mb-2 text-xl font-semibold text-foreground">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-4 text-base leading-7 text-foreground/90">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-4 list-disc space-y-1 pl-6 text-base leading-7 text-foreground/90">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-4 list-decimal space-y-1 pl-6 text-base leading-7 text-foreground/90">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="marker:text-foreground/70">{children}</li>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mb-4 border-l-4 border-border pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ className, children }: { className?: string; children?: ReactNode }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded border border-border bg-muted/60 px-1 py-0.5 font-mono text-[0.9em]">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="mb-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-sm">
      {children}
    </pre>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) =>
    handleMarkdownLink(href, children),
  hr: () => <hr className="my-8 border-border" />,
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-border bg-muted/40 px-2 py-1.5 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-border px-2 py-1.5">{children}</td>
  ),
});

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
  const [editingBlock, setEditingBlock] = useState<{ start: number; end: number } | null>(null);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Aberto como bloco de título (textarea espelho); permanece true após apagar `#`. */
  const [headingEditSession, setHeadingEditSession] = useState(false);
  const skipBlurCommitRef = useRef(false);
  const draftRef = useRef(draft);
  /** Garante `replaceSegment` com o Markdown mais recente (ex.: após `flushSync` + `onChange`). */
  const valueRef = useRef(value);
  valueRef.current = value;
  /** Após Enter no título: focar o corpo no início da linha, não no fim. */
  const focusCaretToStartRef = useRef(false);
  /** Evita reabrir edição logo após Escape numa nota vazia. */
  const skipAutoOpenEmptyRef = useRef(false);

  const segments = useMemo(() => extractMarkdownSegments(value), [value]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!editingBlock) return;
    const id = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        if (focusCaretToStartRef.current) {
          focusCaretToStartRef.current = false;
          el.setSelectionRange(0, 0);
        } else {
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editingBlock]);

  const handleMarkdownLink = useCallback(
    (href: string | undefined, children: ReactNode) => {
      if (href?.startsWith("wikilink:")) {
        const id = decodeURIComponent(href.slice("wikilink:".length));
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectFile(id);
            }}
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
          >
            {children}
          </button>
        );
      }
      return (
        <a
          href={href}
          className="text-primary underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </a>
      );
    },
    [onSelectFile]
  );

  const components = useMemo(
    () => markdownComponents(handleMarkdownLink),
    [handleMarkdownLink]
  );

  const beginEditBlock = useCallback(
    (start: number, end: number, source: string) => {
      const v = valueRef.current;
      const normalized = normalizeNewlineBeforeHeadings(source);
      if (shouldAutoSplitBlockDraft(normalized)) {
        setHeadingEditSession(false);
        const merged = replaceSegment(v, start, end, normalized);
        if (merged !== v) onChange(merged);
        return;
      }
      setHeadingEditSession(parseSingleLineHeading(normalized) !== null);
      setDraft(normalized);
      setEditingBlock({ start, end });
    },
    [onChange]
  );

  const commitBlock = useCallback(() => {
    if (!editingBlock) return;
    setHeadingEditSession(false);
    const normalized = normalizeNewlineBeforeHeadings(draft);
    const v = valueRef.current;
    const next = replaceSegment(v, editingBlock.start, editingBlock.end, normalized);
    if (next !== v) onChange(next);
    setEditingBlock(null);
  }, [draft, editingBlock, onChange]);

  const handleDraftChange = useCallback(
    (nextDraft: string) => {
      const normalized = normalizeNewlineBeforeHeadings(nextDraft);
      setDraft(normalized);
      if (!editingBlock) return;
      if (!shouldAutoSplitBlockDraft(normalized)) return;
      setHeadingEditSession(false);
      const v = valueRef.current;
      const merged = replaceSegment(v, editingBlock.start, editingBlock.end, normalized);
      if (merged !== v) onChange(merged);
      setEditingBlock(null);
    },
    [editingBlock, onChange]
  );

  const onBlockBlur = useCallback(() => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    commitBlock();
  }, [commitBlock]);

  const onBlockKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skipBlurCommitRef.current = true;
        if (valueRef.current.trim() === "") skipAutoOpenEmptyRef.current = true;
        setHeadingEditSession(false);
        setEditingBlock(null);
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commitBlock();
      }
    },
    [commitBlock]
  );

  const onHeadingAreaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skipBlurCommitRef.current = true;
        if (valueRef.current.trim() === "") skipAutoOpenEmptyRef.current = true;
        setHeadingEditSession(false);
        setEditingBlock(null);
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!headingEditSession || !editingBlock) {
          commitBlock();
          return;
        }
        const ta = e.currentTarget;
        const pos = ta.selectionStart;
        const nextDraft = normalizeNewlineBeforeHeadings(
          draft.slice(0, pos) + "\n\n" + draft.slice(pos),
        );
        const v = valueRef.current;
        const merged = replaceSegment(v, editingBlock.start, editingBlock.end, nextDraft);
        if (merged !== v) {
          flushSync(() => {
            onChange(merged);
          });
          valueRef.current = merged;
        }
        const blocks = extractMarkdownSegments(merged).filter(
          (s): s is Extract<MarkdownSegment, { kind: "block" }> => s.kind === "block",
        );
        if (blocks.length >= 2) {
          const body = blocks[1];
          focusCaretToStartRef.current = true;
          setHeadingEditSession(parseSingleLineHeading(body.source) !== null);
          setDraft(body.source);
          setEditingBlock({ start: body.start, end: body.end });
        } else {
          setHeadingEditSession(false);
          setEditingBlock(null);
        }
      }
    },
    [commitBlock, draft, editingBlock, headingEditSession, onChange]
  );

  useEffect(() => {
    if (value.trim() !== "") skipAutoOpenEmptyRef.current = false;
  }, [value]);

  useEffect(() => {
    skipAutoOpenEmptyRef.current = false;
  }, [docId]);

  useEffect(() => {
    if (useTextareaLayout || plainTextDocument) return;
    if (value.trim() !== "") return;
    if (editingBlock !== null) return;
    if (skipAutoOpenEmptyRef.current) return;
    const segs = extractMarkdownSegments(value);
    if (segs.length !== 1) return;
    const s0 = segs[0];
    if (!s0 || s0.kind !== "block") return;
    beginEditBlock(s0.start, s0.end, s0.source);
  }, [beginEditBlock, docId, editingBlock, plainTextDocument, useTextareaLayout, value]);

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
              onClick={() => {
                setSourceMode(!sourceMode);
                setHeadingEditSession(false);
                setEditingBlock(null);
              }}
              className={cn(
                "rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                sourceMode && "bg-muted text-foreground",
              )}
              title={sourceMode ? "Modo blocos (clique para editar)" : "Modo fonte (Markdown completo)"}
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
              <VaultCodeEditor docId={docId} value={value} onChange={onChange} className="mx-auto w-full max-w-[min(100%,56rem)]" />
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
          <article className="h-full overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
            <div className="mx-auto max-w-2xl space-y-0">
              {segments.map((seg, index) => {
                if (seg.kind === "gap") {
                  if (/^\s*$/.test(seg.source)) {
                    return null;
                  }
                  return (
                    <pre
                      key={`gap-${seg.start}-${seg.end}`}
                      className="mb-2 whitespace-pre-wrap font-mono text-xs text-muted-foreground/80"
                    >
                      {seg.source}
                    </pre>
                  );
                }

                const isEditing =
                  editingBlock !== null &&
                  editingBlock.start === seg.start &&
                  editingBlock.end === seg.end;

                if (isEditing) {
                  const lineRows = Math.min(
                    24,
                    Math.max(1, draft.split("\n").length)
                  );
                  if (headingEditSession) {
                    return (
                      <div
                        key={`edit-h-${seg.start}-${seg.end}`}
                        className={BLOCK_SHELL}
                      >
                        <HeadingMirrorTextarea
                          value={draft}
                          onChange={handleDraftChange}
                          onBlur={onBlockBlur}
                          onKeyDown={onHeadingAreaKeyDown}
                          textareaRef={textareaRef}
                        />
                      </div>
                    );
                  }
                  if (hasWikilinkSyntax(draft)) {
                    return (
                      <div
                        key={`edit-w-${seg.start}-${seg.end}`}
                        className={BLOCK_SHELL}
                      >
                        <WikilinkMirrorTextarea
                          value={draft}
                          onChange={handleDraftChange}
                          onBlur={onBlockBlur}
                          onKeyDown={onBlockKeyDown}
                          textareaRef={textareaRef}
                        />
                      </div>
                    );
                  }
                  const prosePlain = isPlainProseBlock(draft);
                  const draftEmpty = draft.trim() === "";
                  return (
                    <div
                      key={`edit-${seg.start}-${seg.end}`}
                      className={BLOCK_SHELL}
                    >
                      <textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={(e) => handleDraftChange(e.target.value)}
                        onBlur={onBlockBlur}
                        onKeyDown={onBlockKeyDown}
                        spellCheck
                        rows={lineRows}
                        className={cn(
                          "m-0 block w-full border-0 bg-transparent p-0 outline-none selection:bg-primary/20 focus-visible:ring-0",
                          prosePlain
                            ? cn(
                                "resize-none font-sans text-base leading-7 text-foreground/90 caret-foreground",
                                draftEmpty ? "min-h-[min(40vh,16rem)]" : "min-h-[1.5em]",
                              )
                            : "min-h-[1.5em] resize-y font-mono text-sm leading-7 text-foreground/90 caret-foreground"
                        )}
                        aria-label="Editar Markdown do bloco"
                      />
                    </div>
                  );
                }

                const blockLooksEmpty = seg.source.trim() === "";

                return (
                  <div
                    key={`block-${seg.start}-${seg.end}-${index}`}
                    tabIndex={0}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      beginEditBlock(seg.start, seg.end, seg.source);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        beginEditBlock(seg.start, seg.end, seg.source);
                      }
                    }}
                    className={cn(
                      BLOCK_SHELL,
                      "[&_p]:mb-0",
                      blockLooksEmpty &&
                        "flex min-h-[min(40vh,16rem)] flex-col justify-center py-8",
                      "cursor-text outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/35"
                    )}
                    aria-label={blockLooksEmpty ? "Editar nota" : undefined}
                  >
                    {blockLooksEmpty ? null : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={components}
                      >
                        {preprocessWikiLinksForMarkdown(seg.source)}
                      </ReactMarkdown>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
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
