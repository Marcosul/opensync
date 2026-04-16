"use client";

import { Bot, Check, File, FilePen, Folder, Plus, Send, Settings, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { collectDocIdsFromTree, findDir } from "@/components/app/vault-tree-ops";
import { parseExplorerDragPayload } from "@/components/app/vault-explorer-tree-view";
import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";
import {
  loadAgentChatSettings,
  type AgentChatCredentials,
} from "@/lib/agent-chat-settings";
import { cn } from "@/lib/utils";

import { VaultAgentChatSettingsDialog } from "./vault-agent-chat-settings-dialog";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ApplicableEdit = {
  docId: string;
  filename: string;
  content: string;
  applied?: boolean;
};

type ContextEntry = {
  id: string;
  label: string;
  isFolder: boolean;
  docIds: string[];
};

type Props = {
  vaultId: string;
  treeChildren: TreeEntry[];
  noteContents: Record<string, string>;
  onRequestClose: () => void;
  onApplyFileEdit: (docId: string, content: string) => Promise<void>;
};

let _msgIdCounter = 0;
function newMsgId() {
  return `msg-${Date.now()}-${++_msgIdCounter}`;
}

/** Extracts text from an OpenAI-compatible SSE stream response. */
async function readStreamedText(
  body: ReadableStream<Uint8Array>,
  onChunk: (delta: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
        const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
        const content = delta?.content;
        if (typeof content === "string" && content) onChunk(content);
      } catch {
        /* linha inválida ou não-JSON — ignorar */
      }
    }
  }
}

function parseApplicableEdits(
  messageContent: string,
  contextDocIds: Set<string>,
): ApplicableEdit[] {
  const edits: ApplicableEdit[] = [];
  const regex = /```([^\n`]+)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(messageContent)) !== null) {
    const lang = match[1].trim();
    const content = match[2];
    if (contextDocIds.has(lang)) {
      const filename = lang.split("/").pop() ?? lang;
      edits.push({ docId: lang, filename, content });
    }
  }
  return edits;
}

export function VaultAgentChatPanel({
  vaultId: _vaultId,
  treeChildren,
  noteContents,
  onRequestClose,
  onApplyFileEdit,
}: Props) {
  const [credentials, setCredentials] = useState<AgentChatCredentials | null>(
    () => loadAgentChatSettings().credentials,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextEntries, setContextEntries] = useState<ContextEntry[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<Record<string, ApplicableEdit[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const buildContextPayload = useCallback(
    (entries: ContextEntry[]) =>
      entries.flatMap(({ docIds }) =>
        docIds
          .map((docId) => ({ path: docId, content: noteContents[docId] ?? "" }))
          .filter((c) => c.content.length > 0),
      ),
    [noteContents],
  );

  async function sendMessage() {
    if (!input.trim() || isLoading || !credentials) return;

    const userText = input.trim();
    const userMsg: ChatMessage = { id: newMsgId(), role: "user", content: userText };
    const assistantId = newMsgId();

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/agent-chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gatewayUrl: credentials.gatewayUrl,
          token: credentials.token,
          agentId: credentials.agentId ?? "main",
          messages: [...history, { role: "user", content: userText }],
          context: buildContextPayload(contextEntries),
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: `Erro ${res.status}` }))) as {
          error?: string;
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `⚠ ${err.error ?? `Erro ${res.status}`}` }
              : m,
          ),
        );
        return;
      }

      if (res.body) {
        await readStreamedText(res.body, (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + delta } : m,
            ),
          );
        });

        // After stream, check if assistant message is empty
        setMessages((prev) => {
          const msg = prev.find((m) => m.id === assistantId);
          if (msg && msg.content === "") {
            return prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "⚠ Gateway não retornou conteúdo de texto." }
                : m,
            );
          }
          return prev;
        });

        // Parse editable code blocks from assistant response
        setMessages((prev) => {
          const msg = prev.find((m) => m.id === assistantId);
          if (!msg || !msg.content) return prev;
          const contextDocIds = new Set(
            contextEntries.flatMap((e) => e.docIds),
          );
          const edits = parseApplicableEdits(msg.content, contextDocIds);
          if (edits.length > 0) {
            setPendingEdits((pe) => ({ ...pe, [assistantId]: edits }));
          }
          return prev;
        });
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Falha ao comunicar com o gateway";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `⚠ ${message}` } : m,
        ),
      );
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function addContextFromDrop(refs: NonNullable<ReturnType<typeof parseExplorerDragPayload>>) {
    setContextEntries((prev) => {
      let next = [...prev];
      for (const ref of refs) {
        if (ref.kind === "folder") {
          if (next.some((e) => e.id === ref.path)) continue;
          const dir = findDir(treeChildren, ref.path);
          const docIds = dir ? collectDocIdsFromTree(dir.children) : [];
          if (docIds.length === 0) continue;
          const label = ref.path.split("/").pop() ?? ref.path;
          next = [...next, { id: ref.path, label, isFolder: true, docIds }];
        } else {
          if (next.some((e) => e.id === ref.docId)) continue;
          const label = ref.docId.split("/").pop() ?? ref.docId;
          next = [...next, { id: ref.docId, label, isFolder: false, docIds: [ref.docId] }];
        }
      }
      return next;
    });
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const refs = parseExplorerDragPayload(e.dataTransfer);
    if (!refs) return;
    addContextFromDrop(refs);
  }

  function handleClearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setContextEntries([]);
    setIsLoading(false);
    setPendingEdits({});
  }

  async function handleApplyEdit(msgId: string, edit: ApplicableEdit) {
    try {
      await onApplyFileEdit(edit.docId, edit.content);
      setPendingEdits((pe) => ({
        ...pe,
        [msgId]: (pe[msgId] ?? []).map((e) =>
          e.docId === edit.docId ? { ...e, applied: true } : e,
        ),
      }));
    } catch {
      // silently ignore — user can retry
    }
  }

  const hasCredentials = Boolean(credentials?.gatewayUrl && credentials?.token);

  return (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2 pr-1">
          <Bot className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Agente
          </span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              title="Limpar conversa"
              aria-label="Limpar conversa"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Configurar credenciais"
            aria-label="Configurar credenciais do agente"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-muted hover:text-foreground",
              !hasCredentials && "text-amber-500 hover:text-amber-600",
            )}
          >
            <Settings className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onRequestClose}
            title="Fechar painel"
            aria-label="Fechar painel do agente"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* No credentials banner */}
        {!hasCredentials ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
            <Bot className="size-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              Configure as credenciais do agente para começar.
            </p>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Settings className="size-3.5" />
              Configurar
            </button>
          </div>
        ) : (
          <>
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <Bot className="size-8 text-muted-foreground/30" />
                  <p className="text-[11px] text-muted-foreground/60">
                    Envie uma mensagem para começar.
                    <br />
                    Arraste arquivos para adicionar contexto.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col gap-0.5",
                        msg.role === "user" ? "items-end" : "items-start",
                      )}
                    >
                      <span className="px-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                        {msg.role === "user" ? "Você" : "Agente"}
                      </span>
                      <div
                        className={cn(
                          "max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                          msg.role === "user"
                            ? "bg-primary/10 text-foreground"
                            : "bg-muted/50 text-foreground",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {msg.content || (isLoading && msg.role === "assistant" ? "" : msg.content)}
                        </p>
                        {isLoading && msg.role === "assistant" && msg.content === "" && (
                          <span className="flex items-center gap-1 py-0.5">
                            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
                          </span>
                        )}
                        {/* Apply edit buttons */}
                        {msg.role === "assistant" && pendingEdits[msg.id]?.length ? (
                          <div className="mt-2 flex flex-col gap-1 border-t border-border/40 pt-2">
                            {pendingEdits[msg.id].map((edit) => (
                              <button
                                key={edit.docId}
                                type="button"
                                onClick={() => void handleApplyEdit(msg.id, edit)}
                                disabled={edit.applied}
                                className={cn(
                                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                                  edit.applied
                                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                    : "bg-primary/10 text-primary hover:bg-primary/20",
                                  "disabled:pointer-events-none",
                                )}
                              >
                                {edit.applied ? (
                                  <Check className="size-3" />
                                ) : (
                                  <FilePen className="size-3" />
                                )}
                                {edit.applied
                                  ? `${edit.filename} aplicado`
                                  : `Aplicar edição em ${edit.filename}`}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area — Claude Code style */}
            <div className="shrink-0 border-t border-border p-2">
              <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background focus-within:ring-1 focus-within:ring-primary">
                {/* Text area */}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Mensagem (Enter para enviar)"
                  rows={1}
                  disabled={isLoading}
                  className={cn(
                    "min-h-[36px] w-full resize-none bg-transparent px-3 pt-2 pb-1 text-xs",
                    "placeholder:text-muted-foreground/50 focus:outline-none",
                    "disabled:opacity-50",
                    "[field-sizing:content] max-h-[120px] overflow-y-auto",
                  )}
                />
                {/* Bottom toolbar */}
                <div className="flex items-center gap-1 px-2 pb-1.5">
                  <button
                    type="button"
                    aria-label="Adicionar contexto"
                    title="Adicionar contexto"
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Arquivos como contexto (arraste da árvore)"
                    title="Arraste arquivos da árvore para adicionar contexto"
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <File className="size-3.5" />
                  </button>
                  {/* Context chips — horizontal scrollable */}
                  {contextEntries.length > 0 && (
                    <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                      {contextEntries.map((entry) => (
                        <span
                          key={entry.id}
                          className="flex shrink-0 items-center gap-1 rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {entry.isFolder ? (
                            <Folder className="size-2.5 shrink-0" />
                          ) : (
                            <File className="size-2.5 shrink-0" />
                          )}
                          <span className="max-w-[80px] truncate">{entry.label}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setContextEntries((prev) => prev.filter((e) => e.id !== entry.id))
                            }
                            aria-label={`Remover ${entry.label} do contexto`}
                            className="rounded-full text-muted-foreground/60 hover:text-foreground"
                          >
                            <X className="size-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {contextEntries.length === 0 && <div className="flex-1" />}
                  {/* Send button */}
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!input.trim() || isLoading}
                    aria-label="Enviar mensagem"
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded",
                      "bg-primary text-primary-foreground hover:bg-primary/90",
                      "disabled:pointer-events-none disabled:opacity-40",
                      "transition-colors",
                    )}
                  >
                    <Send className="size-3" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Drag overlay */}
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-sm bg-primary/10 ring-2 ring-inset ring-primary/40">
            <div className="flex flex-col items-center gap-2 rounded-lg bg-card/90 px-4 py-3 shadow-sm">
              <File className="size-6 text-primary" />
              <p className="text-xs font-medium text-primary">Soltar para adicionar contexto</p>
            </div>
          </div>
        )}
      </div>

      <VaultAgentChatSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={(creds) => setCredentials(creds)}
      />
    </>
  );
}
