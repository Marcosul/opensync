"use client";

import { CodeNode } from "@lexical/code";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode, registerCheckList } from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $getRoot,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  type EditorThemeClasses,
} from "lexical";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/** `[[id]]` → link Markdown para o importador Lexical tratar como hiperligação. */
export function preprocessWikiLinksForLexical(source: string): string {
  return source.replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => {
    return `[${id}](wikilink:${encodeURIComponent(id)})`;
  });
}

/** Reverte `[id](wikilink:…)` para `[[id]]` na serialização. */
export function postprocessWikiLinksFromLexical(md: string): string {
  return md.replace(/\[([^\]]*)\]\(wikilink:([^)]+)\)/g, (_, label: string, enc: string) => {
    const id = decodeURIComponent(enc);
    return `[[${id}]]`;
  });
}

const lexicalTheme: EditorThemeClasses = {
  root: "min-h-[min(60vh,480px)] outline-none",
  paragraph: "mb-4 text-base leading-7 text-foreground/90 relative",
  quote:
    "mb-4 border-l-4 border-border pl-4 italic text-muted-foreground",
  heading: {
    h1: "mt-0 mb-4 text-3xl font-bold tracking-tight text-foreground",
    h2: "mt-0 mb-3 text-2xl font-semibold tracking-tight text-foreground",
    h3: "mt-0 mb-2 text-xl font-semibold text-foreground",
    h4: "mt-0 mb-2 text-lg font-semibold text-foreground",
    h5: "mt-0 mb-2 text-base font-semibold text-foreground",
    h6: "mt-0 mb-2 text-sm font-semibold text-foreground",
  },
  list: {
    ul: "mb-4 list-disc space-y-1 pl-6 text-base leading-7 text-foreground/90",
    ol: "mb-4 list-decimal space-y-1 pl-6 text-base leading-7 text-foreground/90",
    listitem: "marker:text-foreground/70",
    checklist: "mb-4 list-none pl-0",
    listitemChecked: "opacity-70 line-through",
    listitemUnchecked: "",
  },
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
    code: "rounded border border-border bg-muted/60 px-1 py-0.5 font-mono text-[0.9em]",
  },
  link: "font-medium text-primary underline decoration-primary/40 underline-offset-2 cursor-pointer",
  code: "mb-4 block overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-sm",
};

const editorNodes = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  LinkNode,
  AutoLinkNode,
];

function onLexicalError(error: Error) {
  console.error(error);
}

function CheckListPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return registerCheckList(editor, { disableTakeFocusOnClick: false });
  }, [editor]);
  return null;
}

function WikilinkNavigationPlugin({
  onSelectFile,
}: {
  onSelectFile: (id: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event: MouseEvent) => {
        const t = event.target;
        if (!(t instanceof HTMLElement)) return false;
        const anchor = t.closest("a");
        if (!anchor) return false;
        const href = anchor.getAttribute("href");
        if (!href?.startsWith("wikilink:")) return false;
        event.preventDefault();
        onSelectFile(decodeURIComponent(href.slice("wikilink:".length)));
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onSelectFile]);
  return null;
}

function MarkdownChangePlugin({
  onChange,
}: {
  onChange: (markdown: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const onChangeStable = useCallback(
    (md: string) => {
      onChange(md);
    },
    [onChange],
  );

  useLayoutEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      editorState.read(() => {
        const raw = $convertToMarkdownString(TRANSFORMERS);
        onChangeStable(postprocessWikiLinksFromLexical(raw));
      });
    });
  }, [editor, onChangeStable]);

  return null;
}

/**
 * Carrega o Markdown inicial uma vez por montagem (`key={docId}` no pai).
 * Captura o texto do primeiro render (ex.: conteúdo já disponível após lazy-load).
 */
function InitialMarkdownPlugin({ markdown }: { markdown: string }) {
  const [editor] = useLexicalComposerContext();
  const didInit = useRef(false);
  const snapshotRef = useRef<string | null>(null);
  if (snapshotRef.current === null) {
    snapshotRef.current = markdown;
  }

  useLayoutEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const md = snapshotRef.current ?? "";
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        $convertFromMarkdownString(preprocessWikiLinksForLexical(md), TRANSFORMERS);
      },
      { discrete: true },
    );
  }, [editor]);

  return null;
}

export type VaultLexicalMarkdownEditorProps = {
  docId: string;
  value: string;
  onChange: (next: string) => void;
  onSelectFile: (id: string) => void;
  className?: string;
};

export function VaultLexicalMarkdownEditor({
  docId,
  value,
  onChange,
  onSelectFile,
  className,
}: VaultLexicalMarkdownEditorProps) {
  const initialConfig = {
    namespace: `VaultNote-${docId}`,
    theme: lexicalTheme,
    nodes: editorNodes,
    onError: onLexicalError,
    editable: true,
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-y-auto px-4 py-6 sm:px-10 sm:py-8",
        className,
      )}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <div className="vault-lexical-editor mx-auto w-full max-w-2xl">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={cn(
                  "min-h-[min(40vh,16rem)] rounded-md px-1 py-0.5",
                  "focus-visible:outline-none",
                )}
                aria-label="Editar nota"
              />
            }
            placeholder={null}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <LinkPlugin
            validateUrl={(url) =>
              url.startsWith("wikilink:") ||
              /^https?:\/\//i.test(url) ||
              url.startsWith("mailto:") ||
              url.startsWith("/") ||
              url.startsWith("#") ||
              url.startsWith("./")
            }
          />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <WikilinkNavigationPlugin onSelectFile={onSelectFile} />
          <MarkdownChangePlugin onChange={onChange} />
          <InitialMarkdownPlugin markdown={value} />
        </div>
      </LexicalComposer>
    </div>
  );
}
