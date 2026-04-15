import type { AutoformatRule } from "@platejs/autoformat";
import { AutoformatPlugin } from "@platejs/autoformat";
import {
  BasicBlocksPlugin,
  BasicMarksPlugin,
  HighlightPlugin,
  KbdPlugin,
} from "@platejs/basic-nodes/react";
import {
  FontBackgroundColorPlugin,
  FontColorPlugin,
  FontSizePlugin,
  TextAlignPlugin,
} from "@platejs/basic-styles/react";
import { CodeBlockPlugin } from "@platejs/code-block/react";
import { IndentPlugin } from "@platejs/indent/react";
import { LinkPlugin } from "@platejs/link/react";
import { toggleList } from "@platejs/list";
import { ListPlugin } from "@platejs/list/react";
import { MarkdownPlugin } from "@platejs/markdown";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { TablePlugin } from "@platejs/table/react";
import remarkGfm from "remark-gfm";
import { createLowlight, common } from "lowlight";
import type { TElement, Value } from "platejs";
import { KEYS, NodeIdPlugin, TrailingBlockPlugin } from "platejs";
import type { PlateEditor } from "platejs/react";
import { Editor } from "slate";

import { VaultPlateDndPlugin } from "@/components/app/vault-plate-dnd-plugin";

const vaultLowlight = createLowlight(common);

export const EMPTY_VAULT_PLATE_DOC: Value = [{ type: "p", children: [{ text: "" }] }];

export const VAULT_AUTOFORMAT_RULES: AutoformatRule[] = [
  { mode: "block", type: KEYS.h1, match: "# " },
  { mode: "block", type: KEYS.h2, match: "## " },
  { mode: "block", type: KEYS.h3, match: "### " },
  { mode: "block", type: KEYS.blockquote, match: "> " },
  {
    mode: "block",
    match: "- ",
    format: (editor) => {
      toggleList(editor as PlateEditor, { listStyleType: "disc" });
    },
  },
  {
    mode: "block",
    match: "* ",
    format: (editor) => {
      toggleList(editor as PlateEditor, { listStyleType: "disc" });
    },
  },
  {
    mode: "block",
    match: "1. ",
    format: (editor) => {
      toggleList(editor as PlateEditor, { listStyleType: "decimal" });
    },
  },
  { mode: "block", type: KEYS.hr, match: "---" },
];

/** Same block-type switch as Plate registry `setBlockType`, keeps selection after menus. */
export function setVaultBlockType(editor: PlateEditor, type: string) {
  editor.tf.withoutNormalizing(() => {
    const entries = editor.api.blocks({ mode: "lowest" });
    for (const entry of entries) {
      const [node, path] = entry;
      const el = node as TElement;
      if (KEYS.listType in el && (el as TElement & { listStyleType?: unknown }).listStyleType != null) {
        editor.tf.unsetNodes([KEYS.listType, "indent"], { at: path });
      }
      editor.tf.setNodes({ type } as Partial<TElement>, { at: path });
    }
  });
  queueMicrotask(() => {
    editor.tf.focus();
  });
}

const ALIGN_TARGET_BLOCKS = [
  KEYS.p,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.h4,
  KEYS.h5,
  KEYS.h6,
  KEYS.blockquote,
] as const;

/**
 * Plate plugins for vault Markdown: GFM tables, fenced code + lowlight, drag-and-drop,
 * typography marks (incl. highlight / kbd), alignment and inline colour / size.
 */
export function buildVaultPlateEditorPlugins() {
  return [
    NodeIdPlugin,
    BasicBlocksPlugin,
    CodeBlockPlugin.configure({
      options: {
        lowlight: vaultLowlight,
        defaultLanguage: "typescript",
      },
    }),
    BasicMarksPlugin,
    HighlightPlugin,
    KbdPlugin,
    IndentPlugin.configure({ options: { indentMax: 6 } }),
    ListPlugin,
    LinkPlugin.configure({
      options: {
        allowedSchemes: ["http", "https", "mailto", "wikilink", "tel", "file"],
        defaultLinkAttributes: {
          rel: "noopener noreferrer",
        },
      },
    }),
    /** Inclui tr/td/th; não registar TableRow/Cell/Header em separado (duplica chaves e parte da API deixa de funcionar). */
    TablePlugin,
    TextAlignPlugin.configure({
      inject: {
        targetPlugins: [...ALIGN_TARGET_BLOCKS],
      },
    } as never),
    FontColorPlugin,
    FontBackgroundColorPlugin,
    FontSizePlugin,
    AutoformatPlugin.configure({
      options: {
        rules: VAULT_AUTOFORMAT_RULES,
      },
    }),
    MarkdownPlugin.configure({
      options: {
        remarkPlugins: [remarkGfm],
      },
    }),
    BlockSelectionPlugin,
    VaultPlateDndPlugin,
    TrailingBlockPlugin,
  ];
}

/** Insere tabela GFM; garante seleção (toolbar sem foco no Slate falhava em silêncio). */
export function insertVaultPlateTable(
  editor: PlateEditor,
  opts: { colCount?: number; rowCount?: number; header?: boolean } = {},
): void {
  const colCount = opts.colCount ?? 3;
  const rowCount = opts.rowCount ?? 3;
  const header = opts.header ?? true;
  if (!editor.selection) {
    const end = Editor.end(editor as never, []);
    editor.tf.select({ anchor: end, focus: end });
  }
  const tf = editor.tf as typeof editor.tf & {
    insert: { table: (p: { colCount: number; rowCount: number; header?: boolean }, o?: { select?: boolean }) => void };
  };
  tf.insert.table({ colCount, rowCount, header }, { select: true });
  queueMicrotask(() => editor.tf.focus());
}
