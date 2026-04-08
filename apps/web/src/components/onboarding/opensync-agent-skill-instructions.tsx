"use client";

import { BookOpen, ExternalLink } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const codeBoxClass =
  "mt-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-foreground sm:text-[11px]";

export type ConnectAgentSkillStep3PanelProps = {
  /** URL absoluta do guia (ex.: https://app.../docs/agent/opensync-skill). */
  skillGuideUrl: string;
  apiBaseUrl: string;
  vaultId: string;
  agentApiKey: string;
  onCopyBlock: (text: string) => void;
};

/**
 * Passo 3 do assistente OpenClaw: link para o guia da skill + exports com valores reais.
 */
export function ConnectAgentSkillStep3Panel({
  skillGuideUrl,
  apiBaseUrl,
  vaultId,
  agentApiKey,
  onCopyBlock,
}: ConnectAgentSkillStep3PanelProps) {
  const envBlock = [
    `export OPENSYNC_API_URL="${apiBaseUrl}"`,
    `export OPENSYNC_VAULT_ID="${vaultId}"`,
    `export OPENSYNC_AGENT_API_KEY="${agentApiKey}"`,
  ].join("\n");

  return (
    <div
      className="space-y-6 rounded-xl border border-primary/25 bg-primary/[0.06] p-4 sm:p-5"
      aria-labelledby="opensync-skill-heading"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-background/80">
          <BookOpen className="size-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 id="opensync-skill-heading" className="text-sm font-semibold text-foreground">
            Skill OpenSync no OpenClaw
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Primeiro envie ao agente o guia de instalação. Depois configure as variáveis abaixo (valores já
            preenchidos para este vault).
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-foreground">1. Guia para o agente instalar a skill</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Abra o link e siga os passos (pastas de skill alinhadas com{" "}
          <a
            href="https://docs.openclaw.ai/tools/skills"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            docs.openclaw.ai/tools/skills
          </a>
          ). Normalmente <strong className="font-medium text-foreground">não</strong> precisa de reiniciar o Gateway:
          use uma <strong className="font-medium text-foreground">nova sessão</strong> de chat se a skill não
          aparecer de imediato.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <a
            href={skillGuideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            Abrir guia de instalação
            <ExternalLink className="ml-1.5 size-3.5 opacity-80" aria-hidden />
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCopyBlock(skillGuideUrl)}
          >
            Copiar URL do guia
          </Button>
        </div>
        <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground sm:text-[11px]">
          {skillGuideUrl}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-foreground">2. Credenciais deste vault</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className="font-mono text-foreground">OPENSYNC_API_URL</span>,{" "}
          <span className="font-mono text-foreground">OPENSYNC_VAULT_ID</span> e{" "}
          <span className="font-mono text-foreground">OPENSYNC_AGENT_API_KEY</span> (mesmo valor do{" "}
          <span className="font-mono text-foreground">Bearer</span> na API).
        </p>
        <pre className={cn(codeBoxClass, "mt-2 whitespace-pre-wrap break-all")}>{envBlock}</pre>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Copie e cole no <strong className="font-medium text-foreground">chat do agente</strong> OpenClaw (para o
          agente aplicar no ambiente) ou num <strong className="font-medium text-foreground">terminal na máquina onde o agente corre</strong>{" "}
          (ex.: antes de iniciar sessão, para exportar variáveis na shell).
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => onCopyBlock(envBlock)}
        >
          Copie as credenciais
        </Button>
      </div>

      <div className="rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100">
        Guarde a API key: não a voltamos a mostrar neste assistente. Pode gerar outra em{" "}
        <span className="font-medium">Dashboard → Git na VPS</span> se precisar. Alternativa avançada: deploy key no
        mesmo ecrã para <span className="font-mono">git push</span> direto ao Gitea.
      </div>
    </div>
  );
}
