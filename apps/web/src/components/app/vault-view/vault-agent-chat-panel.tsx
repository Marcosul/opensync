"use client";

import { Bot, Check, File, FilePen, FilePlus2, Folder, FolderPlus, GitCompare, Plus, Send, Settings, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { collectDocIdsFromTree, findDir } from "@/components/app/vault-tree-ops";
import { parseExplorerDragPayload } from "@/components/app/vault-explorer-tree-view";
import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";
import {
  loadAgentChatSettings,
  type AgentChatCredentials,
} from "@/lib/agent-chat-settings";
import { cn } from "@/lib/utils";

import { AgentDiffView } from "./vault-agent-diff-view";
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
  original: string;
  isNew?: boolean;
  applied?: boolean;
};

type PendingDelete = {
  docId: string;
  filename: string;
  originalContent: string;
  confirmed?: boolean;
};

type PendingFolderOp =
  | { kind: "mkdir"; path: string; confirmed?: boolean }
  | { kind: "rmdir"; path: string; confirmed?: boolean }
  | { kind: "rename"; from: string; to: string; confirmed?: boolean };

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
  onDeleteFile: (docId: string) => Promise<void>;
  onFolderOp: (op: PendingFolderOp) => Promise<void>;
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

type ParsedOperations = {
  edits: ApplicableEdit[];
  deletes: PendingDelete[];
  folderOps: PendingFolderOp[];
};

function parseAgentOperations(
  messageContent: string,
  contextDocIds: Set<string>,
  folderPrefixes: string[],
  originalContents: Record<string, string>,
): ParsedOperations {
  const edits: ApplicableEdit[] = [];
  const deletes: PendingDelete[] = [];
  const folderOps: PendingFolderOp[] = [];
  const seenDocIds = new Set<string>();

  const regex = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(messageContent)) !== null) {
    const lang = match[1].trim();
    const content = match[2];

    // DELETE block: one file path per line
    if (lang === "DELETE") {
      for (const path of content.split("\n").map((p) => p.trim()).filter(Boolean)) {
        if (!seenDocIds.has(path) && contextDocIds.has(path)) {
          seenDocIds.add(path);
          deletes.push({
            docId: path,
            filename: path.split("/").pop() ?? path,
            originalContent: originalContents[path] ?? "",
          });
        }
      }
      continue;
    }

    // FOLDER-OP block: CREATE path | DELETE path | RENAME from → to
    if (lang === "FOLDER-OP") {
      for (const line of content.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const mkdirMatch = /^CREATE\s+(.+)$/.exec(line);
        const rmdirMatch = /^DELETE\s+(.+)$/.exec(line);
        const renameMatch = /^RENAME\s+(.+?)\s*→\s*(.+)$/.exec(line);
        if (mkdirMatch) {
          folderOps.push({ kind: "mkdir", path: mkdirMatch[1].trim() });
        } else if (rmdirMatch) {
          folderOps.push({ kind: "rmdir", path: rmdirMatch[1].trim() });
        } else if (renameMatch) {
          folderOps.push({
            kind: "rename",
            from: renameMatch[1].trim(),
            to: renameMatch[2].trim(),
          });
        }
      }
      continue;
    }

    // Edit (existing file) or Create (new file within a folder context)
    if (!lang || seenDocIds.has(lang)) continue;
    const isExistingFile = contextDocIds.has(lang);
    const isNewInFolder =
      !isExistingFile && folderPrefixes.some((p) => lang.startsWith(p + "/"));
    if (!isExistingFile && !isNewInFolder) continue;

    seenDocIds.add(lang);
    edits.push({
      docId: lang,
      filename: lang.split("/").pop() ?? lang,
      content,
      original: originalContents[lang] ?? "",
      isNew: !isExistingFile,
    });
  }

  return { edits, deletes, folderOps };
}

export function VaultAgentChatPanel({
  vaultId,
  treeChildren,
  noteContents,
  onRequestClose,
  onApplyFileEdit,
  onDeleteFile,
  onFolderOp,
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
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, PendingDelete[]>>({});
  const [pendingFolderOps, setPendingFolderOps] = useState<Record<string, PendingFolderOp[]>>({});
  const [diffOpenEdits, setDiffOpenEdits] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** Cache local para conteúdo buscado on-demand (lazy git: blobs não carregados). */
  const fetchedContentRef = useRef<Record<string, string>>({});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /**
   * Retorna o conteúdo de um arquivo. Para vaults lazy-git, o conteúdo
   * só existe em `noteContents` se o arquivo já foi a aba ativa; caso contrário
   * faz fetch on-demand do blob via API.
   */
  async function resolveFileContent(docId: string): Promise<string> {
    const cached = noteContents[docId];
    if (cached !== undefined && cached.length > 0) return cached;
    const localCache = fetchedContentRef.current[docId];
    if (localCache !== undefined) return localCache;
    try {
      const res = await fetch(
        `/api/vaults/${encodeURIComponent(vaultId)}/git/blob?path=${encodeURIComponent(docId)}`,
      );
      if (!res.ok) return "";
      const data = (await res.json()) as { content: string };
      fetchedContentRef.current[docId] = data.content ?? "";
      return fetchedContentRef.current[docId];
    } catch {
      return "";
    }
  }

  async function buildContextPayload(
    entries: ContextEntry[],
  ): Promise<Array<{ path: string; content: string }>> {
    const results: Array<{ path: string; content: string }> = [];
    for (const { docIds } of entries) {
      for (const docId of docIds) {
        const content = await resolveFileContent(docId);
        if (content.length > 0) results.push({ path: docId, content });
      }
    }
    return results;
  }

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
      const context = await buildContextPayload(contextEntries);
      const res = await fetch("/api/agent-chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gatewayUrl: credentials.gatewayUrl,
          token: credentials.token,
          agentId: credentials.agentId ?? "main",
          messages: [...history, { role: "user", content: userText }],
          context,
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

        // Parse file operations from assistant response
        setMessages((prev) => {
          const msg = prev.find((m) => m.id === assistantId);
          if (!msg || !msg.content) return prev;
          const contextDocIds = new Set(contextEntries.flatMap((e) => e.docIds));
          const folderPrefixes = contextEntries
            .filter((e) => e.isFolder)
            .map((e) => e.id);
          const allDocIds = [...contextDocIds, ...folderPrefixes];
          const originalContents = Object.fromEntries(
            allDocIds.map((id) => [
              id,
              noteContents[id] ?? fetchedContentRef.current[id] ?? "",
            ]),
          );
          const { edits, deletes, folderOps } = parseAgentOperations(
            msg.content,
            contextDocIds,
            folderPrefixes,
            originalContents,
          );
          if (edits.length > 0) setPendingEdits((pe) => ({ ...pe, [assistantId]: edits }));
          if (deletes.length > 0) setPendingDeletes((pd) => ({ ...pd, [assistantId]: deletes }));
          if (folderOps.length > 0) setPendingFolderOps((pf) => ({ ...pf, [assistantId]: folderOps }));
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
    setPendingDeletes({});
    setPendingFolderOps({});
    setDiffOpenEdits({});
  }

  async function handleConfirmDelete(msgId: string, del: PendingDelete) {
    try {
      await onDeleteFile(del.docId);
      setPendingDeletes((pd) => ({
        ...pd,
        [msgId]: (pd[msgId] ?? []).map((d) =>
          d.docId === del.docId ? { ...d, confirmed: true } : d,
        ),
      }));
    } catch {
      // silently ignore — user can retry
    }
  }

  async function handleConfirmFolderOp(msgId: string, op: PendingFolderOp) {
    const opKey = op.kind === "rename" ? `${op.from}→${op.to}` : op.path;
    try {
      await onFolderOp(op);
      setPendingFolderOps((pf) => ({
        ...pf,
        [msgId]: (pf[msgId] ?? []).map((o) => {
          const k = o.kind === "rename" ? `${o.from}→${o.to}` : o.path;
          return k === opKey ? { ...o, confirmed: true } : o;
        }),
      }));
    } catch {
      // silently ignore — user can retry
    }
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
                        {/* Apply edit buttons + diff toggle */}
                        {msg.role === "assistant" && pendingEdits[msg.id]?.length ? (
                          <div className="mt-2 flex flex-col gap-1.5 border-t border-border/40 pt-2">
                            {pendingEdits[msg.id].map((edit) => {
                              const diffKey = `${msg.id}:${edit.docId}`;
                              const diffOpen = diffOpenEdits[diffKey] ?? false;
                              return (
                                <div key={edit.docId} className="flex flex-col gap-1">
                                  {/* Action row */}
                                  <div className="flex items-center gap-1">
                                    {/* Apply / applied */}
                                    <button
                                      type="button"
                                      onClick={() => void handleApplyEdit(msg.id, edit)}
                                      disabled={edit.applied}
                                      className={cn(
                                        "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                                        edit.applied
                                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                          : "bg-primary/10 text-primary hover:bg-primary/20",
                                        "disabled:pointer-events-none",
                                      )}
                                    >
                                      {edit.applied ? (
                                        <Check className="size-3 shrink-0" />
                                      ) : edit.isNew ? (
                                        <FilePlus2 className="size-3 shrink-0" />
                                      ) : (
                                        <FilePen className="size-3 shrink-0" />
                                      )}
                                      <span className="truncate">
                                        {edit.applied
                                          ? `${edit.filename} ${edit.isNew ? "criado" : "aplicado"}`
                                          : edit.isNew
                                            ? `Criar ${edit.filename}`
                                            : `Aplicar em ${edit.filename}`}
                                      </span>
                                    </button>
                                    {/* Diff toggle switch */}
                                    {!edit.applied && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDiffOpenEdits((prev) => ({
                                            ...prev,
                                            [diffKey]: !diffOpen,
                                          }))
                                        }
                                        title={diffOpen ? "Ocultar diff" : "Ver diff"}
                                        aria-pressed={diffOpen}
                                        className={cn(
                                          "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors",
                                          diffOpen
                                            ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                        )}
                                      >
                                        <GitCompare className="size-3" />
                                        <span>Diff</span>
                                        {/* pill indicator */}
                                        <span
                                          className={cn(
                                            "inline-block size-1.5 rounded-full transition-colors",
                                            diffOpen ? "bg-orange-500" : "bg-muted-foreground/40",
                                          )}
                                        />
                                      </button>
                                    )}
                                    {/* Discard */}
                                    {!edit.applied && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPendingEdits((pe) => ({
                                            ...pe,
                                            [msg.id]: (pe[msg.id] ?? []).filter(
                                              (e) => e.docId !== edit.docId,
                                            ),
                                          }))
                                        }
                                        title="Descartar"
                                        aria-label={`Descartar edição de ${edit.filename}`}
                                        className="flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-destructive"
                                      >
                                        <X className="size-3" />
                                      </button>
                                    )}
                                  </div>
                                  {/* Diff view */}
                                  {diffOpen && !edit.applied && (
                                    <AgentDiffView
                                      original={edit.original}
                                      proposed={edit.content}
                                      filename={edit.filename}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        {/* Pending deletes */}
                        {msg.role === "assistant" && pendingDeletes[msg.id]?.length ? (
                          <div className="mt-2 flex flex-col gap-1.5 border-t border-border/40 pt-2">
                            {pendingDeletes[msg.id].map((del) => {
                              const diffKey = `del:${msg.id}:${del.docId}`;
                              const diffOpen = diffOpenEdits[diffKey] ?? false;
                              return (
                                <div key={del.docId} className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void handleConfirmDelete(msg.id, del)}
                                      disabled={del.confirmed}
                                      className={cn(
                                        "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                                        del.confirmed
                                          ? "bg-muted/60 text-muted-foreground line-through"
                                          : "bg-destructive/10 text-destructive hover:bg-destructive/20",
                                        "disabled:pointer-events-none",
                                      )}
                                    >
                                      {del.confirmed ? (
                                        <Check className="size-3 shrink-0" />
                                      ) : (
                                        <Trash2 className="size-3 shrink-0" />
                                      )}
                                      <span className="truncate">
                                        {del.confirmed
                                          ? `${del.filename} deletado`
                                          : `Deletar ${del.filename}`}
                                      </span>
                                    </button>
                                    {!del.confirmed && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDiffOpenEdits((prev) => ({
                                            ...prev,
                                            [diffKey]: !diffOpen,
                                          }))
                                        }
                                        title={diffOpen ? "Ocultar conteúdo" : "Ver conteúdo"}
                                        aria-pressed={diffOpen}
                                        className={cn(
                                          "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors",
                                          diffOpen
                                            ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                        )}
                                      >
                                        <GitCompare className="size-3" />
                                        <span>Diff</span>
                                        <span
                                          className={cn(
                                            "inline-block size-1.5 rounded-full transition-colors",
                                            diffOpen ? "bg-orange-500" : "bg-muted-foreground/40",
                                          )}
                                        />
                                      </button>
                                    )}
                                    {!del.confirmed && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPendingDeletes((pd) => ({
                                            ...pd,
                                            [msg.id]: (pd[msg.id] ?? []).filter(
                                              (d) => d.docId !== del.docId,
                                            ),
                                          }))
                                        }
                                        title="Descartar"
                                        className="flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                                      >
                                        <X className="size-3" />
                                      </button>
                                    )}
                                  </div>
                                  {diffOpen && !del.confirmed && (
                                    <AgentDiffView
                                      original={del.originalContent}
                                      proposed=""
                                      filename={del.filename}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        {/* Pending folder operations */}
                        {msg.role === "assistant" && pendingFolderOps[msg.id]?.length ? (
                          <div className="mt-2 flex flex-col gap-1.5 border-t border-border/40 pt-2">
                            {pendingFolderOps[msg.id].map((op, idx) => {
                              const opLabel =
                                op.kind === "mkdir"
                                  ? `Criar pasta ${op.path.split("/").pop()}`
                                  : op.kind === "rmdir"
                                    ? `Deletar pasta ${op.path.split("/").pop()}`
                                    : `Renomear ${op.from.split("/").pop()} → ${op.to.split("/").pop()}`;
                              const isConfirmed = op.confirmed;
                              return (
                                <div key={idx} className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void handleConfirmFolderOp(msg.id, op)}
                                    disabled={isConfirmed}
                                    className={cn(
                                      "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                                      isConfirmed
                                        ? "bg-muted/60 text-muted-foreground"
                                        : op.kind === "rmdir"
                                          ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                                          : op.kind === "rename"
                                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
                                            : "bg-primary/10 text-primary hover:bg-primary/20",
                                      "disabled:pointer-events-none",
                                    )}
                                  >
                                    {isConfirmed ? (
                                      <Check className="size-3 shrink-0" />
                                    ) : op.kind === "rmdir" ? (
                                      <Trash2 className="size-3 shrink-0" />
                                    ) : (
                                      <FolderPlus className="size-3 shrink-0" />
                                    )}
                                    <span className="truncate">
                                      {isConfirmed ? `${opLabel} (concluído)` : opLabel}
                                    </span>
                                  </button>
                                  {!isConfirmed && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPendingFolderOps((pf) => ({
                                          ...pf,
                                          [msg.id]: (pf[msg.id] ?? []).filter((_, i) => i !== idx),
                                        }))
                                      }
                                      title="Descartar"
                                      className="flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                                    >
                                      <X className="size-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
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
