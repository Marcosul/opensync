"use client";

import { FileCode2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";

import { apiRequest } from "@/api/rest/generic";
import { VaultCodeEditor } from "@/components/app/vault-code-editor";
import {
  VaultLexicalMarkdownEditor,
  type VaultLexicalMarkdownEditorProps,
} from "@/components/app/vault-lexical-markdown-editor";
import { cn } from "@/lib/utils";

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export type VaultNoteEditorProps = {
  vaultId: string;
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

type CollabProfile = {
  userId: string;
  name: string;
  color: string;
};
type CollabTokenResponse = {
  token: string;
  profile: CollabProfile & { vaultId: string; docId: string; exp: number };
};

function randomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 82% 48%)`;
}

function resolveCollabWsUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/collab";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function VaultNoteEditor({
  vaultId,
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
  type CollaborationProviderFactory = NonNullable<
    VaultLexicalMarkdownEditorProps["collaboration"]
  >["providerFactory"];

  const [internalSourceMode, setInternalSourceMode] = useState(false);
  const sourceMode = sourceModeProp ?? internalSourceMode;
  const setSourceMode = onSourceModeChange ?? setInternalSourceMode;
  const useTextareaLayout = plainTextDocument || sourceMode;
  const [collabEnabled, setCollabEnabled] = useState(false);
  const [collabConnected, setCollabConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState(0);
  const [collabProfile, setCollabProfile] = useState<CollabProfile | null>(null);
  const [collabToken, setCollabToken] = useState<string | null>(null);

  useEffect(() => {
    const storageKey = "opensync-collab-profile";
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as CollabProfile;
        if (parsed.userId && parsed.name && parsed.color) {
          setCollabProfile(parsed);
          return;
        }
      }
    } catch {
      /* ignore malformed local data */
    }
    const profile: CollabProfile = {
      userId: `u_${Math.random().toString(36).slice(2, 10)}`,
      name: `User-${Math.random().toString(36).slice(2, 6)}`,
      color: randomColor(),
    };
    setCollabProfile(profile);
    try {
      localStorage.setItem(storageKey, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!collabEnabled || plainTextDocument) {
      setCollabToken(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiRequest<CollabTokenResponse>(
          `/api/collab/token?vaultId=${encodeURIComponent(vaultId)}&docId=${encodeURIComponent(docId)}`,
        );
        if (!cancelled) {
          setCollabToken(response.token);
          setCollabProfile((prev) =>
            prev
              ? { ...prev, name: response.profile.name, color: response.profile.color }
              : {
                  userId: response.profile.userId,
                  name: response.profile.name,
                  color: response.profile.color,
                },
          );
        }
      } catch {
        if (!cancelled) {
          setCollabToken(null);
          setCollabConnected(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collabEnabled, docId, plainTextDocument, vaultId]);

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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCollabEnabled((prev) => !prev)}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:text-xs",
                  collabEnabled && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                )}
                title={collabEnabled ? "Colaboração online ligada" : "Ligar colaboração online"}
                aria-pressed={collabEnabled}
              >
                Colab
              </button>
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
            </div>
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
            collaboration={
              collabEnabled && collabProfile && collabToken
                ? {
                    enabled: true,
                    roomId: `lexical:${vaultId}:${docId}`,
                    username: collabProfile.name,
                    cursorColor: collabProfile.color,
                    providerFactory: ((roomId: string) => {
                      const baseUrl = resolveCollabWsUrl();
                      if (!baseUrl) {
                        throw new Error(
                          "NEXT_PUBLIC_API_URL não configurado para colaboração em tempo real.",
                        );
                      }
                      const wsUrl = new URL(baseUrl);
                      wsUrl.searchParams.set("room", roomId);
                      wsUrl.searchParams.set("token", collabToken);
                      const provider = new WebsocketProvider(
                        wsUrl.origin + wsUrl.pathname,
                        roomId,
                        new Doc(),
                        {
                          params: {
                            room: roomId,
                            token: collabToken,
                          },
                        },
                      );
                      provider.awareness.setLocalStateField("name", collabProfile.name);
                      provider.awareness.setLocalStateField("color", collabProfile.color);
                      provider.on("status", (event: { status: string }) => {
                        setCollabConnected(event.status === "connected");
                      });
                      provider.awareness.on("update", () => {
                        setActiveUsers(provider.awareness.getStates().size);
                      });
                      return provider;
                    }) as unknown as CollaborationProviderFactory,
                  }
                : undefined
            }
          />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-card/30 px-3 py-1.5 font-mono text-[10px] text-muted-foreground sm:text-[11px]">
        <span>{useTextareaLayout ? "Fonte" : "Live"}</span>
        {!useTextareaLayout && collabEnabled ? (
          <>
            <span
              className={cn(
                "rounded px-1.5 py-0.5",
                collabConnected
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              )}
            >
              {collabConnected ? "Online" : "Offline"}
            </span>
            <span className="tabular-nums">{activeUsers} ativos</span>
          </>
        ) : null}
        <span className="tabular-nums">{words} palavras</span>
        <span className="tabular-nums">{chars} caracteres</span>
      </div>
    </div>
  );
}
