"use client";

import { apiRequest } from "@/api/rest/generic";
import { BookOpen, Copy, ExternalLink, Eye, KeyRound, Monitor, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  getUbuntuInstallOnelinerForClient,
  getUbuntuInstallOnelinerForServer,
  getUbuntuInstallScriptUrlForClient,
  getUbuntuInstallScriptUrlForServer,
} from "@/lib/opensync-public-urls";
import { cn } from "@/lib/utils";

const tokenLabelInputClass =
  "mt-2 h-9 w-full max-w-md rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

type UserAccessKeyListItem = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type ConnectAgentSkillStep3PanelProps = {
  skillGuideUrl: string;
  skillMdUrl: string;
  apiBaseUrl: string;
  vaultId: string;
  /** API key do agente (osk_...), quando já existir — incluída no texto para o chat. */
  agentApiKey?: string;
  onCopyBlock: (text: string) => void;
  footerHint?: string;
};

export function ConnectAgentSkillStep3Panel({
  skillGuideUrl,
  skillMdUrl,
  apiBaseUrl,
  vaultId,
  agentApiKey = "",
  onCopyBlock,
  footerHint,
}: ConnectAgentSkillStep3PanelProps) {
  const baseId = useId();
  const ubuntuPanelId = `${baseId}-tab-ubuntu`;
  const skillPanelId = `${baseId}-tab-skill`;
  const [activeTab, setActiveTab] = useState<"ubuntu" | "skill">("ubuntu");
  const [workspaceTokenLabel, setWorkspaceTokenLabel] = useState("");
  const [workspaceTokenBusy, setWorkspaceTokenBusy] = useState(false);
  const [workspaceTokenError, setWorkspaceTokenError] = useState<string | null>(null);
  const [workspaceTokenValue, setWorkspaceTokenValue] = useState<string | null>(null);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);
  const [accessKeys, setAccessKeys] = useState<UserAccessKeyListItem[]>([]);
  const [accessKeysLoading, setAccessKeysLoading] = useState(false);
  const [viewingKey, setViewingKey] = useState<UserAccessKeyListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAccessKeyListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const copyFeedbackClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCopiedFeedback = useCallback(() => {
    if (copyFeedbackClearRef.current) clearTimeout(copyFeedbackClearRef.current);
    setCopyFeedback("Copiado para a área de transferência.");
    copyFeedbackClearRef.current = setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackClearRef.current = null;
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (copyFeedbackClearRef.current) clearTimeout(copyFeedbackClearRef.current);
    };
  }, []);

  const loadAccessKeys = useCallback(async () => {
    setAccessKeysLoading(true);
    try {
      const result = await apiRequest<{ keys: UserAccessKeyListItem[] }>("/api/user-access-keys");
      setAccessKeys(result.keys);
    } catch {
      setAccessKeys([]);
    } finally {
      setAccessKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccessKeys();
  }, [loadAccessKeys]);

  const generateWorkspaceToken = useCallback(async () => {
    setWorkspaceTokenError(null);
    setWorkspaceTokenValue(null);
    setRevealedKeyId(null);
    setListNotice(null);
    setWorkspaceTokenBusy(true);
    try {
      const result = await apiRequest<{ token: string; id: string; label: string }>(
        "/api/user-access-keys",
        {
          method: "POST",
          body: {
            label: workspaceTokenLabel.trim() || "OpenSync — ligar agente",
          },
        },
      );
      setWorkspaceTokenValue(result.token);
      setRevealedKeyId(result.id ?? null);
      setWorkspaceTokenLabel("");
      await loadAccessKeys();
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Não foi possível gerar o token.";
      let msg = raw;
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed?.error) msg = parsed.error;
      } catch {
        /* manter raw */
      }
      setWorkspaceTokenError(msg);
    } finally {
      setWorkspaceTokenBusy(false);
    }
  }, [workspaceTokenLabel, loadAccessKeys]);

  const copyKeyFromList = useCallback(
    (key: UserAccessKeyListItem) => {
      if (revealedKeyId === key.id && workspaceTokenValue) {
        setListNotice(null);
        onCopyBlock(workspaceTokenValue);
        showCopiedFeedback();
        return;
      }
      setListNotice(
        "O segredo completo (usk_…) só aparece ao gerar o token. Se não o guardou, revogue esta chave e crie outra.",
      );
    },
    [revealedKeyId, workspaceTokenValue, onCopyBlock, showCopiedFeedback],
  );

  const confirmDeleteKey = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await apiRequest(`/api/user-access-keys/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      if (revealedKeyId === deleteTarget.id) {
        setWorkspaceTokenValue(null);
        setRevealedKeyId(null);
      }
      setDeleteTarget(null);
      await loadAccessKeys();
    } catch {
      /* manter diálogo aberto */
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, revealedKeyId, loadAccessKeys]);

  const ubuntuInstallOneliner = useMemo(
    () => getUbuntuInstallOnelinerForClient() || getUbuntuInstallOnelinerForServer(),
    [],
  );
  const ubuntuInstallScriptUrl = useMemo(
    () => getUbuntuInstallScriptUrlForClient() || getUbuntuInstallScriptUrlForServer(),
    [],
  );

  const skillChatPasteLine = useMemo(() => {
    const keyInPaste = agentApiKey.trim()
      ? ` OPENSYNC_AGENT_API_KEY="${agentApiKey.trim()}"`
      : "";
    const httpKeyHint = agentApiKey.trim()
      ? ""
      : " Para snapshots HTTP sem o app Ubuntu, pede ao utilizador a API key osk_... no dashboard se ainda não existir.";
    return (
      `Lê e aplica o SKILL em ${skillMdUrl} e o guia ${skillGuideUrl}. ` +
      `OPENSYNC_API_URL="${apiBaseUrl}" OPENSYNC_VAULT_ID="${vaultId}"${keyInPaste}. ` +
      `Não cries tokens no OpenSync: pede ao utilizador o usk_... (Configurações → Tokens de acesso) quando o wizard opensync init pedir, para finalizar a ligação ao vault.${httpKeyHint} ` +
      `Instalação .deb no Ubuntu: o utilizador corre no terminal: curl -fsSL "${ubuntuInstallScriptUrl}" | bash`
    );
  }, [skillMdUrl, skillGuideUrl, apiBaseUrl, vaultId, agentApiKey, ubuntuInstallScriptUrl]);

  const tabTriggerClass = (selected: boolean) =>
    cn(
      "inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-2 py-2 text-xs font-medium transition-colors sm:min-h-0 sm:px-4",
      selected
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-4" aria-labelledby="opensync-connect-heading">
      <div
        role="tablist"
        aria-label="Modo de instalação"
        className="flex w-full max-w-md gap-1 rounded-xl border border-border bg-muted/40 p-1"
      >
        <button
          type="button"
          role="tab"
          id={`${baseId}-trigger-ubuntu`}
          aria-selected={activeTab === "ubuntu"}
          aria-controls={ubuntuPanelId}
          tabIndex={activeTab === "ubuntu" ? 0 : -1}
          className={tabTriggerClass(activeTab === "ubuntu")}
          onClick={() => setActiveTab("ubuntu")}
        >
          <Monitor className="size-3.5 shrink-0 text-primary" aria-hidden />
          Instalação Manual
        </button>
        <button
          type="button"
          role="tab"
          id={`${baseId}-trigger-skill`}
          aria-selected={activeTab === "skill"}
          aria-controls={skillPanelId}
          tabIndex={activeTab === "skill" ? 0 : -1}
          className={tabTriggerClass(activeTab === "skill")}
          onClick={() => setActiveTab("skill")}
        >
          <BookOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          Instale com seu Agente
        </button>
      </div>

      {/* ── App Ubuntu ── */}
      <div
        id={ubuntuPanelId}
        role="tabpanel"
        aria-labelledby={`${baseId}-trigger-ubuntu`}
        hidden={activeTab !== "ubuntu"}
        className="rounded-xl border border-border bg-background/60 p-4 sm:p-5"
      >
        <div className="flex items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
            <Monitor className="size-4 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Recomendado</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Instale o app e execute um wizard de configuração. Sem assistente, sem plugin.
            </p>
          </div>
        </div>

        <ol className="mt-4 space-y-3">
          <li className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
              1
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">No Ubuntu: instalar e configurar</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Comece por aqui: cole no terminal. O script instala o <span className="font-mono">.deb</span> e corre{" "}
                <span className="font-mono">opensync init</span>. Quando o assistente pedir o token{" "}
                <span className="font-mono">usk_...</span>, use uma chave do passo 2 ou{" "}
                <Link
                  href="/settings?section=access-tokens"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Configurações → Tokens de acesso
                </Link>
                .
              </p>
              <div
                className={cn(
                  "mt-1.5 flex items-start gap-1 rounded-lg border border-border bg-muted/50 pr-1",
                )}
              >
                <pre
                  className={cn(
                    "min-w-0 flex-1 whitespace-pre-wrap break-all border-0 bg-transparent px-2.5 py-2 font-mono text-[10px] leading-relaxed text-foreground sm:text-[11px]",
                  )}
                >
                  {ubuntuInstallOneliner}
                </pre>
                <button
                  type="button"
                  className="mt-1.5 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                  aria-label="Copiar comando"
                  title="Copiar comando"
                  onClick={() => onCopyBlock(ubuntuInstallOneliner)}
                >
                  <Copy className="size-4" aria-hidden />
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
                O script reabre o terminal para o assistente interativo (e-mail, pasta e vault). O serviço fica ativo no
                boot. Para rever o instalador: abra o URL no browser ou use <span className="font-mono">curl -fsSL</span>{" "}
                sem enviar para o bash.
              </p>
              <a
                href={ubuntuInstallScriptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 inline-flex")}
              >
                Ver script
                <ExternalLink className="ml-1.5 size-3.5 opacity-70" />
              </a>
            </div>
          </li>

          <li className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
              2
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Gere um token de workspace</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                O token começa por <span className="font-mono text-[10px]">usk_...</span> e será pedido durante o{" "}
                <span className="font-mono">opensync init</span> do passo 1. Pode gerá-lo aqui ou em{" "}
                <Link
                  href="/settings?section=access-tokens"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Configurações → Tokens de acesso
                </Link>
                .
              </p>
              <label htmlFor={`${baseId}-token-label`} className="sr-only">
                Nome do token (opcional)
              </label>
              <input
                id={`${baseId}-token-label`}
                type="text"
                autoComplete="off"
                placeholder="Nome do token (opcional)"
                value={workspaceTokenLabel}
                onChange={(e) => setWorkspaceTokenLabel(e.target.value)}
                disabled={workspaceTokenBusy}
                className={tokenLabelInputClass}
              />
              <Button
                type="button"
                variant="default"
                size="sm"
                className="mt-2"
                disabled={workspaceTokenBusy}
                onClick={() => void generateWorkspaceToken()}
              >
                <KeyRound className="mr-1.5 size-3.5" aria-hidden />
                {workspaceTokenBusy ? "A gerar…" : "Gerar token"}
              </Button>
              {workspaceTokenError ? (
                <p className="mt-2 text-xs text-destructive">{workspaceTokenError}</p>
              ) : null}
              {workspaceTokenValue ? (
                <div className="mt-3 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 dark:border-amber-800/60 dark:bg-amber-950/35">
                  <p className="text-xs font-medium text-amber-950 dark:text-amber-100">
                    Copie agora — o token não volta a aparecer nesta página.
                  </p>
                  <div className="flex items-center gap-2 rounded-md border border-amber-200/80 bg-background/80 px-2 py-1.5 dark:border-amber-900/50">
                    <code className="min-w-0 flex-1 break-all text-[10px] text-foreground sm:text-[11px]">
                      {workspaceTokenValue}
                    </code>
                    <button
                      type="button"
                      title="Copiar token"
                      className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-amber-100 dark:hover:bg-amber-900/40"
                      onClick={() => {
                        onCopyBlock(workspaceTokenValue);
                        showCopiedFeedback();
                      }}
                    >
                      <Copy className="size-4" aria-hidden />
                    </button>
                  </div>
                  <p className="text-[10px] leading-relaxed text-amber-950/90 dark:text-amber-100/90">
                    Guarde num sítio seguro. No Ubuntu, quando o instalador abrir o assistente, cole este valor quando
                    pedir o token de workspace.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-amber-950 hover:bg-amber-200/30 dark:text-amber-100 dark:hover:bg-amber-900/30"
                    onClick={() => {
                      setWorkspaceTokenValue(null);
                      setRevealedKeyId(null);
                    }}
                  >
                    Fechar
                  </Button>
                </div>
              ) : null}

              <div className="mt-4 rounded-lg border border-border bg-muted/20 px-3 py-3">
                <p className="text-[11px] font-medium text-foreground">Chaves existentes</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  O valor completo só é mostrado ao gerar. «Copiar» na lista só funciona logo após criar o token (até
                  fechar o aviso laranja).
                </p>
                {listNotice ? <p className="mt-2 text-[10px] text-amber-800 dark:text-amber-200">{listNotice}</p> : null}
                {accessKeysLoading ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">A carregar…</p>
                ) : accessKeys.length === 0 ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">Ainda não há chaves nesta conta.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {accessKeys.map((key) => (
                      <li
                        key={key.id}
                        className="flex flex-col gap-2 rounded-md border border-border bg-background/80 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">{key.label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Criada em {new Date(key.createdAt).toLocaleString("pt-PT", { dateStyle: "short" })}
                            {key.lastUsedAt
                              ? ` · Último uso ${new Date(key.lastUsedAt).toLocaleString("pt-PT", { dateStyle: "short" })}`
                              : " · Nunca usada"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-[11px]"
                            onClick={() => {
                              setListNotice(null);
                              setViewingKey(key);
                            }}
                          >
                            <Eye className="mr-1 size-3.5" aria-hidden />
                            Ver
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-[11px]"
                            onClick={() => {
                              setListNotice(null);
                              copyKeyFromList(key);
                            }}
                          >
                            <Copy className="mr-1 size-3.5" aria-hidden />
                            Copiar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-[11px] text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(key)}
                          >
                            <Trash2 className="mr-1 size-3.5" aria-hidden />
                            Apagar
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        </ol>

      </div>

      {/* ── Via SKILL (OpenClaw) ── */}
      <div
        id={skillPanelId}
        role="tabpanel"
        aria-labelledby={`${baseId}-trigger-skill`}
        hidden={activeTab !== "skill"}
        className="rounded-xl border border-dashed border-border bg-muted/10 p-4 sm:p-5"
      >
        <div className="flex items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
            <BookOpen className="size-4 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">OpenClaw</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Instale a skill OpenSync no OpenClaw. O SKILL descreve o fluxo com o pacote{" "}
              <span className="font-mono text-[10px]">.deb</span> e o wizard — o{" "}
              <strong className="font-medium text-foreground">agente não gera tokens</strong>; pede ao utilizador o{" "}
              <span className="font-mono text-[10px]">usk_...</span> (e a API key{" "}
              <span className="font-mono text-[10px]">osk_...</span> só se precisar de HTTP).
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={skillGuideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Guia da skill
            <ExternalLink className="ml-1.5 size-3.5 opacity-80" aria-hidden />
          </a>
          <a
            href={skillMdUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            SKILL.md
            <ExternalLink className="ml-1.5 size-3.5 opacity-80" aria-hidden />
          </a>
          <Button type="button" variant="ghost" size="sm" onClick={() => onCopyBlock(skillMdUrl)}>
            Copiar URL SKILL.md
          </Button>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-foreground">Mensagem para o chat do agente</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
            Copie a linha abaixo e cole no OpenClaw (ou outro assistente). Inclui o URL do SKILL, o guia e as credenciais
            deste vault.
          </p>
          <div
            className={cn(
              "mt-1.5 flex items-start gap-1 rounded-lg border border-border bg-muted/50 pr-1",
            )}
          >
            <pre
              className={cn(
                "min-w-0 flex-1 whitespace-pre-wrap break-all border-0 bg-transparent px-2.5 py-2 font-mono text-[10px] leading-relaxed text-foreground sm:text-[11px]",
              )}
            >
              {skillChatPasteLine}
            </pre>
            <button
              type="button"
              className="mt-1.5 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
              aria-label="Copiar mensagem para o chat"
              title="Copiar mensagem para o chat"
              onClick={() => onCopyBlock(skillChatPasteLine)}
            >
              <Copy className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {footerHint ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100">
          {footerHint}
        </div>
      ) : null}

      {viewingKey ? (
        <div
          className="fixed inset-0 z-[420] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fechar"
            onClick={() => setViewingKey(null)}
          />
          <div
            className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
            role="dialog"
            aria-labelledby={`${baseId}-key-details-title`}
          >
            <h2 id={`${baseId}-key-details-title`} className="text-sm font-semibold text-foreground">
              Detalhes da chave
            </h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="font-medium text-foreground">{viewingKey.label}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Criada em</dt>
                <dd className="text-foreground">
                  {new Date(viewingKey.createdAt).toLocaleString("pt-PT", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Último uso</dt>
                <dd className="text-foreground">
                  {viewingKey.lastUsedAt
                    ? new Date(viewingKey.lastUsedAt).toLocaleString("pt-PT", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
              Por segurança, o segredo <span className="font-mono">usk_...</span> não fica armazenado para consulta
              posterior.
            </p>
            <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => setViewingKey(null)}>
              Fechar
            </Button>
          </div>
        </div>
      ) : null}

      {copyFeedback ? (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 z-[460] max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2.5 text-center text-xs font-medium text-foreground shadow-lg"
          role="status"
          aria-live="polite"
        >
          {copyFeedback}
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[420] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Cancelar"
            onClick={deleteBusy ? undefined : () => setDeleteTarget(null)}
            disabled={deleteBusy}
          />
          <div
            className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
            role="alertdialog"
            aria-labelledby={`${baseId}-key-del-title`}
          >
            <h2 id={`${baseId}-key-del-title`} className="text-sm font-semibold text-foreground">
              Revogar esta chave?
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              «{deleteTarget.label}» deixa de funcionar em clientes que a usavam.
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleteBusy}
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleteBusy}
                onClick={() => void confirmDeleteKey()}
              >
                {deleteBusy ? "A apagar…" : "Revogar"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
