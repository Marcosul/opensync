"use client";

import { CodeNode } from "@lexical/code";
import { GripVertical } from "lucide-react";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode, registerCheckList } from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { DraggableBlockPlugin_EXPERIMENTAL } from "@lexical/react/LexicalDraggableBlockPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import {
  $isHeadingNode,
  $createHeadingNode,
  $createQuoteNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
} from "@lexical/rich-text";
import {
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import {
  INSERT_TABLE_COMMAND,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table";
import { $setBlocksType } from "@lexical/selection";
import {
  $createParagraphNode,
  $getNearestNodeOfType,
  $getSelection,
  $isRangeSelection,
  $getRoot,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type TextNode,
  type EditorThemeClasses,
} from "lexical";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

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
  table: "mb-4 w-full border-collapse border border-border text-sm",
  tableRow: "",
  tableCell: "border border-border px-3 py-2 align-top",
  tableCellHeader:
    "border border-border bg-muted/60 px-3 py-2 text-left font-semibold align-top",
};

const editorNodes = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  LinkNode,
  AutoLinkNode,
  TableNode,
  TableCellNode,
  TableRowNode,
];

// Em Lexical 0.43, `TRANSFORMERS` já cobre sintaxe de tabela Markdown (GFM).
const markdownTransformers = [...TRANSFORMERS];

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
        const raw = $convertToMarkdownString(markdownTransformers);
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
        $convertFromMarkdownString(preprocessWikiLinksForLexical(md), markdownTransformers);
      },
      { discrete: true },
    );
  }, [editor]);

  return null;
}

function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [blockType, setBlockType] = useState<
    "paragraph" | "h1" | "h2" | "h3" | "quote" | "ul" | "ol" | "check"
  >("paragraph");

  const applyHeading = useCallback(
    (tag: "h1" | "h2" | "h3") => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode(tag));
        }
      });
    },
    [editor],
  );

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const anchorNode = selection.anchor.getNode();
          const element =
            anchorNode.getKey() === "root"
              ? anchorNode
              : anchorNode.getTopLevelElementOrThrow();

          const listNode = $getNearestNodeOfType(element, ListNode);
          if (listNode && $isListNode(listNode)) {
            if (listNode.getListType() === "bullet") setBlockType("ul");
            else if (listNode.getListType() === "number") setBlockType("ol");
            else setBlockType("check");
            return;
          }
          if ($isHeadingNode(element)) {
            const tag = element.getTag();
            if (tag === "h1" || tag === "h2" || tag === "h3") setBlockType(tag);
            else setBlockType("paragraph");
            return;
          }
          if ($isQuoteNode(element)) {
            setBlockType("quote");
            return;
          }
          setBlockType("paragraph");
        });
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  const applyBlockType = useCallback(
    (value: string) => {
      if (value === "ul") {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
        return;
      }
      if (value === "ol") {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
        return;
      }
      if (value === "check") {
        editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
        return;
      }
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      if (value === "quote") {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createQuoteNode());
          }
        });
        return;
      }
      if (value === "h1" || value === "h2" || value === "h3") {
        applyHeading(value);
        return;
      }
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createParagraphNode());
        }
      });
    },
    [applyHeading, editor],
  );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/50 p-2">
      <select
        value={blockType}
        onChange={(e) => applyBlockType(e.target.value)}
        className="h-8 rounded border border-border bg-background px-2 text-xs"
      >
        <option value="paragraph">Normal</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="ul">Bulleted List</option>
        <option value="ol">Numbered List</option>
        <option value="check">Check List</option>
        <option value="quote">Quote</option>
      </select>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs hover:bg-muted"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        B
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs hover:bg-muted italic"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        I
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs hover:bg-muted"
        onClick={() => applyHeading("h1")}
      >
        H1
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs hover:bg-muted"
        onClick={() => applyHeading("h2")}
      >
        H2
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs hover:bg-muted"
        onClick={() => applyHeading("h3")}
      >
        H3
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs hover:bg-muted"
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
      >
        Lista
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs hover:bg-muted"
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
      >
        Num
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs hover:bg-muted"
        onClick={() => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)}
      >
        Check
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs hover:bg-muted"
        onClick={() =>
          editor.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns: "3",
            includeHeaders: true,
            rows: "3",
          })
        }
      >
        Tabela
      </button>
    </div>
  );
}

function isOnBlockMenu(element: HTMLElement): boolean {
  return !!element.closest(".vault-draggable-block-menu");
}

function DraggableBlocksPlugin({ anchorElem }: { anchorElem: HTMLElement }) {
  return (
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={anchorElem}
      menuComponent={
        <div className="vault-draggable-block-menu flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground shadow-sm">
          <GripVertical className="size-4" />
        </div>
      }
      targetLineComponent={<div className="h-[2px] rounded bg-primary/60" />}
      isOnMenu={isOnBlockMenu}
    />
  );
}

class SlashOption extends MenuOption {
  title: string;
  keywords: string[];
  onSelect: () => void;

  constructor(title: string, keywords: string[], onSelect: () => void) {
    super(title);
    this.title = title;
    this.keywords = keywords;
    this.onSelect = onSelect;
  }
}

function SlashMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
  });

  const options = useMemo(() => {
    const dynamicTableMatch = queryString?.match(/^([1-9]\d?)(?:x([1-9]\d?))?$/i);
    const base = [
      new SlashOption("Texto", ["paragraph", "normal"], () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createParagraphNode());
          }
        });
      }),
      new SlashOption("Heading 1", ["h1", "title"], () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode("h1"));
          }
        });
      }),
      new SlashOption("Heading 2", ["h2"], () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode("h2"));
          }
        });
      }),
      new SlashOption("Heading 3", ["h3"], () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode("h3"));
          }
        });
      }),
      new SlashOption("Lista", ["list", "unordered"], () => {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      }),
      new SlashOption("Lista numerada", ["ordered", "numbered"], () => {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      }),
      new SlashOption("Checklist", ["todo", "check"], () => {
        editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
      }),
      new SlashOption("Quote", ["blockquote"], () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createQuoteNode());
          }
        });
      }),
      new SlashOption("Tabela 3x3", ["table", "grid"], () => {
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
          columns: "3",
          includeHeaders: true,
          rows: "3",
        });
      }),
    ];

    if (dynamicTableMatch) {
      const rows = dynamicTableMatch[1]!;
      const columns = dynamicTableMatch[2] ?? rows;
      base.unshift(
        new SlashOption(`Tabela ${rows}x${columns}`, ["table", "grid"], () => {
          editor.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns,
            rows,
            includeHeaders: true,
          });
        }),
      );
    }

    if (!queryString) return base;
    const matcher = new RegExp(queryString, "i");
    return base.filter(
      (option) =>
        matcher.test(option.title) ||
        option.keywords.some((keyword) => matcher.test(keyword)),
    );
  }, [editor, queryString]);

  const onSelectOption = useCallback(
    (
      selectedOption: SlashOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
    ) => {
      editor.update(() => {
        nodeToRemove?.remove();
        selectedOption.onSelect();
        closeMenu();
      });
    },
    [editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin<SlashOption>
      onQueryChange={setQueryString}
      triggerFn={checkForTriggerMatch}
      options={options}
      onSelectOption={onSelectOption}
      menuRenderFn={(anchorElementRef, context) => {
        const { highlightedIndex, selectOptionAndCleanUp, setHighlightedIndex } = context;
        if (!anchorElementRef.current || options.length === 0) {
          return null;
        }
        return createPortal(
          <div className="z-50 max-h-64 w-56 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
            {options.map((option, index) => {
              const selected = highlightedIndex === index;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={cn(
                    "flex w-full items-center rounded px-2 py-1.5 text-left text-xs",
                    selected ? "bg-muted text-foreground" : "hover:bg-muted/70",
                  )}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectOptionAndCleanUp(option)}
                >
                  {option.title}
                </button>
              );
            })}
          </div>,
          anchorElementRef.current,
        );
      }}
    />
  );
}

export type VaultLexicalMarkdownEditorProps = {
  docId: string;
  value: string;
  onChange: (next: string) => void;
  onSelectFile: (id: string) => void;
  className?: string;
  collaboration?: {
    enabled: boolean;
    roomId: string;
    providerFactory: CollaborationPluginProps["providerFactory"];
    username: string;
    cursorColor: string;
    shouldBootstrap?: boolean;
  };
};

type CollaborationPluginProps = ComponentProps<typeof CollaborationPlugin>;

export function VaultLexicalMarkdownEditor({
  docId,
  value,
  onChange,
  onSelectFile,
  className,
  collaboration,
}: VaultLexicalMarkdownEditorProps) {
  const collabEnabled = collaboration?.enabled === true;
  const cursorsContainerRef = useRef<HTMLDivElement | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement | null>(null);
  const initialConfig = {
    namespace: `VaultNote-${docId}`,
    theme: lexicalTheme,
    nodes: editorNodes,
    onError: onLexicalError,
    editable: true,
    editorState: collabEnabled ? null : undefined,
  };

  const editorContent = (
    <>
      <ToolbarPlugin />
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
      {!collabEnabled ? <HistoryPlugin /> : null}
      <ListPlugin />
      <CheckListPlugin />
      <TablePlugin />
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
      <MarkdownShortcutPlugin transformers={markdownTransformers} />
      {editorWrapperRef.current ? (
        <DraggableBlocksPlugin anchorElem={editorWrapperRef.current} />
      ) : null}
      <SlashMenuPlugin />
      <WikilinkNavigationPlugin onSelectFile={onSelectFile} />
      <MarkdownChangePlugin onChange={onChange} />
      {!collabEnabled ? <InitialMarkdownPlugin markdown={value} /> : null}
    </>
  );

  const lexicalEditor = (
    <LexicalComposer initialConfig={initialConfig}>
      {collabEnabled && collaboration ? (
        <CollaborationPlugin
          id={collaboration.roomId}
          providerFactory={collaboration.providerFactory}
          shouldBootstrap={collaboration.shouldBootstrap ?? true}
          username={collaboration.username}
          cursorColor={collaboration.cursorColor}
          cursorsContainerRef={cursorsContainerRef}
        />
      ) : null}
      {editorContent}
    </LexicalComposer>
  );

  return (
    <div
      ref={cursorsContainerRef}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-y-auto px-4 py-6 sm:px-10 sm:py-8",
        className,
      )}
    >
      <div ref={editorWrapperRef} className="vault-lexical-editor relative mx-auto w-full max-w-2xl">
        {collabEnabled ? <LexicalCollaboration>{lexicalEditor}</LexicalCollaboration> : lexicalEditor}
      </div>
    </div>
  );
}
