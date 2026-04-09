import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { readOpensyncSkillMarkdown } from "@/lib/server/opensync-skill-markdown";

import { SkillDocCopyActions } from "./skill-doc-copy";

export const metadata: Metadata = {
  title: "Skill OpenSync | OpenSync",
  description:
    "SKILL.md oficial OpenSync: instalação, credenciais e sync com Gitea. Para o agente obter por URL, download ou cópia.",
};

export default async function OpenSyncAgentSkillDocPage() {
  const skillMd = readOpensyncSkillMarkdown();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";
  const guidePageUrl = origin ? `${origin}/docs/agent/opensync-skill` : "/docs/agent/opensync-skill";
  const skillMdUrl = origin ? `${origin}/docs/agent/opensync-skill/skill-md` : "/docs/agent/opensync-skill/skill-md";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Skill OpenSync — documentação para o agente
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Instalar a skill OpenSync</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Este documento é para o <strong className="font-medium text-foreground">agente</strong> (ou para quem
          cola no chat do agente). Inclui o ficheiro completo <span className="font-mono text-xs">SKILL.md</span> da
          OpenSync. O agente pode: <strong className="font-medium text-foreground">abrir esta página por URL</strong>
          , <strong className="font-medium text-foreground">obter o ficheiro por URL</strong>,{" "}
          <strong className="font-medium text-foreground">copiar e colar</strong> o bloco abaixo no chat, ou receber{" "}
          <span className="font-mono text-xs">SKILL.md</span> como <strong className="font-medium text-foreground">anexo</strong>
          .
        </p>

        <SkillDocCopyActions
          skillMarkdown={skillMd}
          guidePageUrl={guidePageUrl}
          skillMdUrl={skillMdUrl}
        />

        <h2 className="mt-10 text-base font-semibold text-foreground">Onde gravar no disco</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Instale a skill neste caminho no sistema onde corre o OpenClaw Gateway (crie as pastas em falta). O ficheiro
          deve chamar-se <span className="font-mono text-xs">SKILL.md</span>:
        </p>
        <p className="mt-2">
          <code className="rounded-lg border border-border bg-muted/60 px-2 py-1.5 font-mono text-xs text-foreground">
            ~/.openclaw/skills/opensync/SKILL.md
          </code>
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
          {`mkdir -p ~/.openclaw/skills/opensync
# Guarde aqui o ficheiro SKILL.md (conteúdo abaixo ou descarregado).`}
        </pre>

        <h2 className="mt-10 text-base font-semibold text-foreground">
          Tarefa agendada: sincronizar a cada 30 minutos
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Depois de instalar a skill e definir as credenciais, crie uma{" "}
          <strong className="font-medium text-foreground">Scheduled Task</strong> no Gateway OpenClaw para correr o
          sync <strong className="font-medium text-foreground">de 30 em 30 minutos</strong>. Guia oficial:{" "}
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
        <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {`openclaw cron add \\
  --name "OpenSync vault sync (30m)" \\
  --every 30m \\
  --session isolated \\
  --message "Sincronizar vault OpenSync: commit local se houver alterações; POST à API /git/<vaultId>/push com OPENSYNC_* e Bearer. Uma linha: ok ou erro." \\
  --tools exec \\
  --delivery none

# Ver jobs: openclaw cron list`}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Ajuste <span className="font-mono text-[11px]">--tz</span> se usar{" "}
          <span className="font-mono text-[11px]">--cron &quot;*/30 * * * *&quot;</span> em vez de{" "}
          <span className="font-mono text-[11px]">--every 30m</span>. O detalhe completo repete-se no{" "}
          <span className="font-mono text-[11px]">SKILL.md</span> abaixo.
        </p>

        <h2 className="mt-10 text-base font-semibold text-foreground">Conteúdo completo do SKILL.md (OpenSync)</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Depois de gravar, se a skill não aparecer de imediato, inicie uma <strong className="font-medium text-foreground">nova sessão</strong>{" "}
          de conversa com o agente.
        </p>
        <pre className="mt-3 max-h-[min(70vh,520px)] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/50 p-4 font-mono text-[11px] leading-relaxed sm:text-xs">
          {skillMd}
        </pre>

        <h2 className="mt-10 text-base font-semibold text-foreground">Credenciais (substituir no vosso ambiente)</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O utilizador obtém estes valores no OpenSync (assistente de novo vault ou Dashboard → Git na VPS). A URL da
          API deve incluir o sufixo <span className="font-mono text-xs">/api</span>.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
          {`export OPENSYNC_API_URL="https://api.opensync.space/api"
export OPENSYNC_VAULT_ID="<uuid-do-vault>"
export OPENSYNC_AGENT_API_KEY="<api-key-osk_...>"`}
        </pre>

        <h2 className="mt-10 text-base font-semibold text-foreground">Alternativa OpenSync: Git na VPS</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No dashboard OpenSync, <strong className="font-medium text-foreground">Git na VPS</strong> permite deploy key
          e <span className="font-mono text-xs">git push</span> direto ao Gitea, em paralelo com a API HTTP.
        </p>

        <p className="mt-12 text-center text-xs text-muted-foreground">
          <Link href="/" className="font-medium text-primary underline-offset-2 hover:underline">
            Voltar ao início
          </Link>
        </p>
      </div>
    </div>
  );
}
