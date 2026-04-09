"use client";

import { BookOpen, ExternalLink } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const codeBoxClass =
  "mt-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-foreground sm:text-[11px]";

export type ConnectAgentSkillStep3PanelProps = {
  /** URL absoluta da página do guia OpenSync. */
  skillGuideUrl: string;
  /** URL absoluta do ficheiro SKILL.md (text/markdown) para o agente obter por fetch ou download. */
  skillMdUrl: string;
  apiBaseUrl: string;
  vaultId: string;
  /** Se vazio, o bloco de credenciais pede para gerar a chave (ex.: botão na mesma página). */
  agentApiKey?: string;
  onCopyBlock: (text: string) => void;
  /** Texto da caixa âmbar no rodapé (predefinição: assistente / dashboard). */
  footerHint?: string;
};

/**
 * Passo 3 do assistente: guia OpenSync + credenciais do vault.
 */
export function ConnectAgentSkillStep3Panel({
  skillGuideUrl,
  skillMdUrl,
  apiBaseUrl,
  vaultId,
  agentApiKey = "",
  onCopyBlock,
  footerHint,
}: ConnectAgentSkillStep3PanelProps) {
  const hasApiKey = agentApiKey.trim().length > 0;
  const envBlock = [
    `export OPENSYNC_API_URL="${apiBaseUrl}"`,
    `export OPENSYNC_VAULT_ID="${vaultId}"`,
    `export OPENSYNC_AGENT_API_KEY="${agentApiKey}"`,
  ].join("\n");

  const cronBlock = [
    "openclaw cron add \\",
    '  --name "OpenSync vault sync (30m)" \\',
    "  --every 30m \\",
    "  --session isolated \\",
    `  --message "OpenSync: POST ${apiBaseUrl}/git/${vaultId}/push com JSON files + Bearer OPENSYNC_* (sem git local). Opcional: /sync. Uma linha: ok ou erro." \\`,
    "  --tools exec \\",
    "  --delivery none",
    "",
    "# Ver jobs: openclaw cron list",
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
            Skill OpenSync
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Envie ao agente o guia OpenSync (URL da página ou do ficheiro), ou cole no chat / anexe o{" "}
            <span className="font-mono text-[10px]">SKILL.md</span>. Depois envie as credenciais deste vault e crie a
            tarefa agendada de sync a cada 30 minutos (passo 3).
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-foreground">1. Conteúdo da skill para o agente</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          A página inclui o <span className="font-mono text-[10px]">SKILL.md</span> completo da OpenSync. O agente pode
          ler por URL, descarregar o ficheiro, ou receber o texto copiado / em anexo.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <a
            href={skillGuideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            Abrir guia OpenSync
            <ExternalLink className="ml-1.5 size-3.5 opacity-80" aria-hidden />
          </a>
          <a
            href={skillMdUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Abrir SKILL.md (ficheiro)
            <ExternalLink className="ml-1.5 size-3.5 opacity-80" aria-hidden />
          </a>
          <Button type="button" variant="outline" size="sm" onClick={() => onCopyBlock(skillGuideUrl)}>
            Copiar URL do guia
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onCopyBlock(skillMdUrl)}>
            Copiar URL do SKILL.md
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground sm:text-[11px]">
          <span className="font-medium text-foreground">Guia:</span>{" "}
          <span className="break-all font-mono">{skillGuideUrl}</span>
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground sm:text-[11px]">
          <span className="font-medium text-foreground">Raw:</span>{" "}
          <span className="break-all font-mono">{skillMdUrl}</span>
        </p>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
          <span className="font-medium text-foreground">Allowlists:</span> se no OpenClaw usarem{" "}
          <span className="font-mono text-foreground">agents.defaults.skills</span> ou{" "}
          <span className="font-mono text-foreground">agents.list[].skills</span>, incluam o nome{" "}
          <span className="font-mono text-foreground">opensync</span> na lista desse agente.{" "}
          <a
            href="https://docs.openclaw.ai/tools/skills#agent-skill-allowlists"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Documentação
          </a>
          .
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
        {hasApiKey ? (
          <>
            <pre className={cn(codeBoxClass, "mt-2 whitespace-pre-wrap break-all")}>{envBlock}</pre>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Copie e cole no <strong className="font-medium text-foreground">chat do agente</strong> (para aplicar no
              ambiente) ou num <strong className="font-medium text-foreground">terminal na máquina do agente</strong>.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onCopyBlock(envBlock)}>
              Copie as credenciais
            </Button>
          </>
        ) : (
          <div className="mt-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
            Gere uma <strong className="font-medium text-foreground">API key</strong> com o botão{" "}
            <strong className="font-medium text-foreground">Gerar API key</strong> na secção acima desta página. A chave
            só é mostrada <strong className="font-medium text-foreground">uma vez</strong>; guarde-a antes de sair.
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-foreground">3. Tarefa agendada: sync a cada 30 minutos</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          No Gateway OpenClaw, crie uma{" "}
          <strong className="font-medium text-foreground">Scheduled Task</strong> (cron) para correr o sync de 30 em
          30 minutos. Documentação:{" "}
          <a
            href="https://docs.openclaw.ai/automation/cron-jobs"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            docs.openclaw.ai/automation/cron-jobs
          </a>
          .
        </p>
        <pre className={cn(codeBoxClass, "mt-2 whitespace-pre-wrap break-all")}>{cronBlock}</pre>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onCopyBlock(cronBlock)}>
          Copiar comando cron
        </Button>
      </div>

      <div className="rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100">
        {footerHint ??
          "Guarde a API key: não a voltamos a mostrar neste assistente. Pode gerar outra em Dashboard → Agente e Git (este cofre) se precisar. Alternativa avançada: deploy key no mesmo ecrã para git push direto ao Gitea."}
      </div>
    </div>
  );
}
