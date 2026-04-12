"use client";

import { BookOpen, Copy, ExternalLink, Monitor } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  getUbuntuInstallOnelinerForClient,
  getUbuntuInstallOnelinerForServer,
  getUbuntuInstallScriptUrlForClient,
  getUbuntuInstallScriptUrlForServer,
} from "@/lib/opensync-public-urls";
import { cn } from "@/lib/utils";

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
      `Não cries tokens no OpenSync: pede ao utilizador o usk_... (Configurações → Tokens de acesso) quando o wizard opensync-ubuntu init pedir, para finalizar a ligação ao vault.${httpKeyHint} ` +
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
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">1</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Gere um token de workspace</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Em{" "}
                <Link
                  href="/settings?section=access-tokens"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Configurações → Tokens de acesso
                </Link>{" "}
                clique em <strong className="font-medium text-foreground">Gerar token</strong> e guarde o{" "}
                <span className="font-mono text-[10px]">usk_...</span> — será pedido pelo assistente no passo 2.
              </p>
              <Link
                href="/settings?section=access-tokens"
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "mt-2 inline-flex")}
              >
                Gerar token agora
              </Link>
            </div>
          </li>

          <li className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">2</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">No Ubuntu: instalar e configurar</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Cole no terminal. O script instala o <span className="font-mono">.deb</span> e corre{" "}
                <span className="font-mono">opensync-ubuntu init</span> (e-mail, token{" "}
                <span className="font-mono">usk_...</span>, pasta e vault). O serviço fica ativo no boot.
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
                O script reabre o terminal para o assistente interativo. Para rever o instalador: abra o URL no browser
                ou use <span className="font-mono">curl -fsSL</span> sem enviar para o bash.
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
    </div>
  );
}
