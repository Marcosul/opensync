import { BookOpen, ExternalLink, Terminal } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const codeBoxClass =
  "mt-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-foreground sm:text-[11px]";

/**
 * Instruções para instalar a skill OpenSync no OpenClaw e orientar o agente a sincronizar (Git / script / cron).
 */
export function OpenSyncAgentSkillInstructions() {
  return (
    <div
      className="mb-6 space-y-5 rounded-xl border border-primary/25 bg-primary/[0.06] p-4 sm:p-5"
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
            Instale a skill para o agente seguir regras de Git, commits e sync com o vault. Fluxo recomendado
            em paralelo: vault no OpenSync + <span className="font-medium text-foreground">Ligar Git na VPS</span>{" "}
            (deploy key) em vez de depender só da importação SSH abaixo.
          </p>
        </div>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Terminal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          1. Instalar a skill na VPS (ou no workspace do agente)
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          O OpenClaw carrega skills de pastas como{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">~/.openclaw/skills</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">~/.openclaw/workspace/skills</code> ou{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">~/.agents/skills</code> — ver{" "}
          <a
            href="https://docs.openclaw.ai/tools/skills"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline"
          >
            Skills no OpenClaw
            <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
          </a>
          .
        </p>
        <pre className={cn(codeBoxClass, "mt-2 whitespace-pre-wrap break-all")}>
          {`mkdir -p ~/.openclaw/skills/opensync
# No clone do repositório OpenSync, copie:
#   packages/plugin/skill/SKILL.md
# para:
#   ~/.openclaw/skills/opensync/SKILL.md`}
        </pre>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Pode editar o <span className="font-mono">SKILL.md</span> para fixar o caminho real do clone (ex.:{" "}
          <span className="font-mono">OPENSYNC_REPO_DIR</span>) e regras da sua equipa.
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-foreground">2. O que o agente deve fazer (sincronização programática)</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-muted-foreground">
          <li>
            Tratar o workspace do vault como <strong className="text-foreground">repositório Git</strong> com{" "}
            <span className="font-mono text-foreground">origin</span> no Gitea (deploy key do dashboard).
          </li>
          <li>
            Quando o utilizador pedir para gravar/enviar alterações: executar o script{" "}
            <span className="font-mono text-foreground">opensync-vps-git-sync.sh</span> (documentado em{" "}
            <span className="font-mono">docs/dev/scripts/</span>) via ferramenta <strong className="text-foreground">exec</strong>
            , ou <span className="font-mono">git pull --rebase</span> + commit + push na pasta do clone.
          </li>
          <li>
            Configurar{" "}
            <a
              href="https://docs.openclaw.ai/automation/cron-jobs"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Scheduled Tasks
            </a>{" "}
            com dois jobs: <span className="font-mono">--cron &quot;0 6 * * *&quot;</span> e{" "}
            <span className="font-mono">--cron &quot;0 18 * * *&quot;</span> (com <span className="font-mono">--tz</span>{" "}
            adequado) — detalhes no <span className="font-mono">SKILL.md</span> e em{" "}
            <span className="font-mono">docs/dev/openclaw-agent-sync.md</span>.
          </li>
          <li>Se o rebase falhar, reportar erro — não fazer push forçado.</li>
        </ul>
      </div>

      <div className="rounded-lg border border-border/80 bg-background/60 px-3 py-2.5">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Importação SSH abaixo</span> é útil para um snapshot inicial
          no browser; para sync contínuo prefira Git + skill + cron. Depois de criar um vault vazio no OpenSync, use{" "}
          <Link href="/dashboard" className="font-medium text-primary underline-offset-2 hover:underline">
            Dashboard → Ligar Git na VPS
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
