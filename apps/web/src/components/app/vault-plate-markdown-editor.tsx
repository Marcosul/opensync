"use client";

import { DndScroller } from "@platejs/dnd";
import { MarkdownPlugin } from "@platejs/markdown";
import {
  getProviderClass,
  registerProviderType,
  type ProviderConstructorProps,
  type UnifiedProvider,
} from "@platejs/yjs";
import { YjsPlugin } from "@platejs/yjs/react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import type { PlateEditor } from "platejs/react";
import { Plate, usePlateEditor } from "platejs/react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

import {
  buildVaultPlateEditorPlugins,
  EMPTY_VAULT_PLATE_DOC,
} from "@/components/app/vault-plate-editor-kit";
import { buildVaultSlashCommands, tryOpenSlashMenu, VaultPlateSlashPopover } from "@/components/app/vault-plate-slash-popover";
import { VaultPlateToolbar } from "@/components/app/vault-plate-toolbar";
import { Editor, EditorContainer } from "@/components/plate-ui/editor";
import {
  decodeAsciiSpaceCharRefs,
  normalizeVaultMarkdownForCompare,
} from "@/lib/vault-markdown-normalize";
import { cn } from "@/lib/utils";

const OPENSYNC_WS_TYPE = "opensync-ws";

/**
 * `[[id]]` → link Markdown para o importador tratar como hiperligação.
 * O remark/mdast escapa espaços U+0020 “ambíguos” (p.ex. início de parágrafo após um heading)
 * como `&#x20;` ou `&#32;`, o que polui o `.md` no disco — normalizamos em {@link decodeAsciiSpaceCharRefs}.
 */
export function preprocessWikiLinksForPlate(source: string): string {
  const cleaned = decodeAsciiSpaceCharRefs(source);
  return cleaned.replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => {
    return `[${id}](wikilink:${encodeURIComponent(id)})`;
  });
}

/** Reverte `[id](wikilink:…)` para `[[id]]` na serialização. */
export function postprocessWikiLinksFromPlate(md: string): string {
  return md.replace(/\[([^\]]*)\]\(wikilink:([^)]+)\)/g, (_, label: string, enc: string) => {
    const id = decodeURIComponent(enc);
    return `[[${id}]]`;
  });
}

function normalizeVaultMarkdown(md: string): string {
  return normalizeVaultMarkdownForCompare(md);
}

/**
 * Evita que um blob/snapshot remoto ligeiramente atrasado substitua o Plate quando o utilizador
 * já avançou no texto (o corpo local serializado prolonga o remoto normalizado).
 */
function looksLikeStaleRemoteBehindLocal(localMd: string, remoteMd: string): boolean {
  const loc = normalizeVaultMarkdown(localMd);
  const rem = normalizeVaultMarkdown(remoteMd);
  if (loc === rem || rem.length === 0) return false;
  return loc.length > rem.length && loc.startsWith(rem);
}

/** Plate → Markdown (GFM) via {@link https://platejs.org/docs/markdown MarkdownPlugin}. */
function vaultMarkdownFromPlate(editor: PlateEditor): string {
  return normalizeVaultMarkdown(
    postprocessWikiLinksFromPlate(editor.getApi(MarkdownPlugin).markdown.serialize()),
  );
}

type OpensyncWsOptions = {
  baseWsUrl: string;
  roomId: string;
  token: string;
  onConnectionChange?: (connected: boolean) => void;
  onActiveUsersChange?: (count: number) => void;
};

/**
 * Provider Yjs via `y-websocket` compatível com o relay Nest em `/api/collab`.
 * Registrado uma vez para o {@link YjsPlugin} instanciar com `doc`/`awareness` do Plate.
 */
class OpensyncYjsProvider implements UnifiedProvider {
  readonly type = OPENSYNC_WS_TYPE;
  private readonly ws: WebsocketProvider;
  private readonly opts: OpensyncWsOptions;
  private readonly onConnectCb?: () => void;
  private readonly onDisconnectCb?: () => void;
  private readonly onSyncChangeCb?: (synced: boolean) => void;
  private readonly onErrorCb?: (error: Error) => void;
  private readonly onAwarenessUpdate = () => {
    this.opts.onActiveUsersChange?.(this.ws.awareness.getStates().size);
  };

  constructor(props: ProviderConstructorProps<OpensyncWsOptions>) {
    const { doc, awareness, options, onConnect, onDisconnect, onError, onSyncChange } = props;
    const o = options as OpensyncWsOptions;
    this.opts = o;
    this.onConnectCb = onConnect;
    this.onDisconnectCb = onDisconnect;
    this.onSyncChangeCb = onSyncChange;
    this.onErrorCb = onError;

    const wsUrl = new URL(o.baseWsUrl);
    wsUrl.searchParams.set("room", o.roomId);
    wsUrl.searchParams.set("token", o.token);

    this.ws = new WebsocketProvider(
      `${wsUrl.origin}${wsUrl.pathname}`,
      o.roomId,
      doc as Y.Doc,
      {
        connect: false,
        awareness: awareness as Awareness,
        params: { room: o.roomId, token: o.token },
      },
    );

    this.ws.on("status", (payload: { status: string }[] | { status: string }) => {
      const row = Array.isArray(payload) ? payload[0] : payload;
      const status = row?.status;
      if (status === "connected") {
        this.opts.onConnectionChange?.(true);
        this.onConnectCb?.();
      }
      if (status === "disconnected") {
        this.opts.onConnectionChange?.(false);
        this.onDisconnectCb?.();
      }
    });

    this.ws.awareness.on("update", this.onAwarenessUpdate);
    this.opts.onActiveUsersChange?.(this.ws.awareness.getStates().size);
    this.ws.on("sync", (arg: boolean[] | boolean) => {
      const synced = Array.isArray(arg) ? arg[0] : arg;
      this.onSyncChangeCb?.(!!synced);
    });
    this.ws.on("connection-error", (payload: unknown) => {
      const ev = Array.isArray(payload) ? payload[0] : payload;
      const msg =
        ev && typeof ev === "object" && "message" in ev && typeof (ev as ErrorEvent).message === "string"
          ? (ev as ErrorEvent).message
          : "unknown";
      this.onErrorCb?.(new Error(`y-websocket connection-error: ${msg}`));
    });
  }

  connect(): void {
    try {
      this.ws.connect();
    } catch (e) {
      this.onErrorCb?.(e instanceof Error ? e : new Error(String(e)));
    }
  }

  disconnect(): void {
    this.ws.disconnect();
  }

  destroy(): void {
    this.ws.awareness.off("update", this.onAwarenessUpdate);
    this.ws.destroy();
  }

  get awareness(): Awareness {
    return this.ws.awareness;
  }

  get document(): Y.Doc {
    return this.ws.doc;
  }

  get isConnected(): boolean {
    return this.ws.wsconnected;
  }

  get isSynced(): boolean {
    return this.ws.synced;
  }
}

function ensureOpensyncWsProviderRegistered(): void {
  if (getProviderClass(OPENSYNC_WS_TYPE)) return;
  registerProviderType(OPENSYNC_WS_TYPE, OpensyncYjsProvider);
}

export type VaultPlateMarkdownEditorProps = {
  docId: string;
  value: string;
  onChange: (next: string) => void;
  onSelectFile: (id: string) => void;
  className?: string;
  collaboration?: {
    enabled: boolean;
    roomId: string;
    wsBaseUrl: string;
    token: string;
    username: string;
    cursorColor: string;
    onConnectionChange?: (connected: boolean) => void;
    onActiveUsersChange?: (count: number) => void;
  };
};

export function VaultPlateMarkdownEditor({
  docId,
  value,
  onChange,
  onSelectFile,
  className,
  collaboration,
}: VaultPlateMarkdownEditorProps) {
  ensureOpensyncWsProviderRegistered();

  const collabEnabled = collaboration?.enabled === true;
  const valueRef = useRef(value);
  valueRef.current = value;
  const lastEmittedMarkdownRef = useRef<string | null>(null);
  /**
   * O Plate monta com {@link EMPTY_VAULT_PLATE_DOC} e pode disparar `onValueChange` no mesmo commit
   * **antes** do `useLayoutEffect` aplicar o `value` vindo do servidor. Isso gravava `""`, marcava o
   * path como dirty no lazy-Git e o merge blob→`noteContents` deixava de reidratar (ficheiro apagado
   * no remoto). Só emitimos para o pai depois de sincronizar o doc com as props.
   */
  const readyToEmitRef = useRef(false);
  /** Evita que `setValue` programático dispare `onValueChange` e sobrescreva o pai com serialização intermédia. */
  const suppressOnChangeRef = useRef(false);

  const plugins = useMemo(() => {
    const base = buildVaultPlateEditorPlugins();
    if (!collabEnabled || !collaboration) return base;
    return [
      ...base,
      YjsPlugin.configure({
        options: {
          cursors: {
            data: {
              color: collaboration.cursorColor,
              name: collaboration.username,
            },
          },
          providers: [
            {
              type: OPENSYNC_WS_TYPE,
              options: {
                baseWsUrl: collaboration.wsBaseUrl,
                roomId: collaboration.roomId,
                token: collaboration.token,
                onConnectionChange: collaboration.onConnectionChange,
                onActiveUsersChange: collaboration.onActiveUsersChange,
              },
            },
          ],
        },
      } as never),
    ];
  }, [collabEnabled, collaboration]);

  const editor = usePlateEditor(
    {
      id: `vault-note-${docId}`,
      plugins,
      value: EMPTY_VAULT_PLATE_DOC,
      ...(collabEnabled ? { skipInitialization: true } : {}),
    },
    [docId, collabEnabled, plugins],
  );

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashAnchor, setSlashAnchor] = useState<DOMRect | null>(null);
  const closeSlash = useCallback(() => {
    setSlashOpen(false);
    setSlashAnchor(null);
  }, []);
  const slashCommands = useMemo(() => buildVaultSlashCommands(), []);

  const onSlashKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (!editor) return;
      if (slashOpen && e.key === "Escape") {
        e.preventDefault();
        closeSlash();
        return;
      }
      tryOpenSlashMenu(editor, e, (rect) => {
        setSlashAnchor(rect);
        setSlashOpen(true);
      });
    },
    [closeSlash, editor, slashOpen],
  );

  useLayoutEffect(() => {
    lastEmittedMarkdownRef.current = null;
    readyToEmitRef.current = false;
  }, [docId]);

  useLayoutEffect(() => {
    if (!editor) return;
    if (collabEnabled) return;
    try {
      const incomingRaw = value ?? "";
      const lastOut = lastEmittedMarkdownRef.current;
      if (lastOut !== null) {
        if (incomingRaw === lastOut) return;
        if (normalizeVaultMarkdown(incomingRaw) === normalizeVaultMarkdown(lastOut)) return;
      }
      const incoming = normalizeVaultMarkdown(incomingRaw);
      const current = vaultMarkdownFromPlate(editor);
      if (incoming === current) return;
      if (lastOut !== null) {
        const lastNorm = normalizeVaultMarkdown(lastOut);
        const curNorm = normalizeVaultMarkdown(current);
        if (
          lastNorm === curNorm &&
          looksLikeStaleRemoteBehindLocal(current, incomingRaw)
        ) {
          return;
        }
      }
      const nodes = editor.getApi(MarkdownPlugin).markdown.deserialize(preprocessWikiLinksForPlate(value ?? ""));
      suppressOnChangeRef.current = true;
      try {
        editor.tf.setValue(nodes.length ? nodes : EMPTY_VAULT_PLATE_DOC);
      } finally {
        suppressOnChangeRef.current = false;
      }
    } finally {
      readyToEmitRef.current = true;
    }
  }, [collabEnabled, editor, value, docId]);

  useLayoutEffect(() => {
    if (!collabEnabled || !editor || !collaboration) return;
    let cancelled = false;
    readyToEmitRef.current = false;
    const initial = editor.getApi(MarkdownPlugin).markdown.deserialize(preprocessWikiLinksForPlate(valueRef.current ?? ""));

    void (async () => {
      await editor.getApi(YjsPlugin).yjs.init({
        id: collaboration.roomId,
        autoSelect: "end",
        value: initial.length ? initial : EMPTY_VAULT_PLATE_DOC,
      });
      if (cancelled) {
        editor.getApi(YjsPlugin).yjs.destroy();
        return;
      }
      readyToEmitRef.current = true;
    })();

    return () => {
      cancelled = true;
      editor.getApi(YjsPlugin).yjs.destroy();
    };
  }, [collabEnabled, collaboration, editor]);

  const emitMarkdown = useCallback(
    (ed: typeof editor) => {
      const next = vaultMarkdownFromPlate(ed);
      lastEmittedMarkdownRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  const onWikiPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const t = event.target;
      if (!(t instanceof HTMLElement)) return;
      const anchor = t.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href?.startsWith("wikilink:")) return;
      event.preventDefault();
      onSelectFile(decodeURIComponent(href.slice("wikilink:".length)));
    },
    [onSelectFile],
  );

  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col overflow-visible px-3 py-4 sm:px-8 sm:py-6 min-[1360px]:px-10",
        className,
      )}
    >
      <div className="relative mx-auto w-full max-w-3xl min-[1360px]:max-w-4xl">
        <Plate
          editor={editor}
          onValueChange={({ editor: ed }) => {
            if (suppressOnChangeRef.current) return;
            if (!readyToEmitRef.current) return;
            emitMarkdown(ed);
          }}
        >
          <div className="overflow-visible rounded-none bg-transparent">
            <div className="vault-plate-md-reveal-toolbar will-change-[transform,opacity]">
              <VaultPlateToolbar />
            </div>
            <EditorContainer
              variant="pageScroll"
              data-vault-pdf-export-root=""
              className={cn(
                "vault-plate-md-reveal-body rounded-none bg-background pb-24 will-change-[transform,opacity]",
                "[&_.slate-gutterLeft]:!left-0 [&_.slate-blockToolbar]:!left-0",
              )}
            >
              <DndScroller />
              <Editor
                variant="none"
                className={cn(
                  "min-h-[12rem] w-full pl-10 pr-4 py-5 text-base leading-relaxed text-foreground/90 sm:pl-12 sm:pr-8 sm:py-7 min-[1360px]:pl-14",
                  "[&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight",
                  "[&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight",
                  "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-semibold",
                  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
                  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
                  "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
                  "[&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium",
                  "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5",
                  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
                  "[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
                  "[&_mark]:rounded-sm [&_mark]:bg-amber-200/90 [&_mark]:px-0.5 dark:[&_mark]:bg-amber-400/35",
                  "[&_kbd]:inline-flex [&_kbd]:items-center [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-border [&_kbd]:bg-muted [&_kbd]:px-1.5 [&_kbd]:py-0.5 [&_kbd]:font-mono [&_kbd]:text-[0.85em] [&_kbd]:shadow-sm",
                  "[&_sub]:text-[0.75em] [&_sup]:text-[0.75em]",
                  "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/80 [&_pre]:bg-muted/40 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[13px] leading-relaxed",
                )}
                placeholder="Escreva a nota…"
                spellCheck
                aria-label="Editar nota"
                onKeyDown={onSlashKeyDown}
                onPointerDownCapture={onWikiPointerDown}
              />
            </EditorContainer>
          </div>
        </Plate>
        {editor ? (
          <VaultPlateSlashPopover
            editor={editor}
            open={slashOpen}
            anchorRect={slashAnchor}
            commands={slashCommands}
            onClose={closeSlash}
          />
        ) : null}
      </div>
    </div>
  );
}
