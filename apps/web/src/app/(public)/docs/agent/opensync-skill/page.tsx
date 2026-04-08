import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Instalar a skill OpenSync | OpenSync",
  description:
    "Guia para o agente OpenClaw: instalar a skill OpenSync, variáveis de ambiente e sincronização com Gitea.",
};

export default function OpenSyncAgentSkillDocPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Documentação do agente
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Skill OpenSync no OpenClaw</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Este guia destina-se ao <strong className="font-medium text-foreground">agente</strong> (ou ao
          utilizador a copiar para o agente). A sincronização com o repositório Gitea do vault faz-se pela{" "}
          <strong className="font-medium text-foreground">API OpenSync</strong> com uma API key{" "}
          <span className="font-mono text-xs">Bearer</span> e o ID do vault.
        </p>

        <ol className="mt-10 list-decimal space-y-10 pl-5 text-sm leading-relaxed">
          <li className="pl-2">
            <h2 className="text-base font-semibold text-foreground">Instalar os ficheiros da skill</h2>
            <p className="mt-2 text-muted-foreground">
              O OpenClaw usa pastas de skills compatíveis com AgentSkills. A precedência oficial (resumo) é:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">&lt;workspace&gt;/skills</code>{" "}
              (mais alta), depois{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">&lt;workspace&gt;/.agents/skills</code>
              , <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">~/.agents/skills</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">~/.openclaw/skills</code>, skills
              incluídas na instalação e <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">skills.load.extraDirs</code>{" "}
              (mais baixa). Consulte{" "}
              <a
                href="https://docs.openclaw.ai/tools/skills"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Skills no OpenClaw
              </a>{" "}
              para o detalhe completo.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
              {`# Exemplo: skill partilhada na máquina (ajuste o caminho à sua escolha)
mkdir -p ~/.openclaw/skills/opensync
# Copie do repositório OpenSync:
#   packages/plugin/skill/SKILL.md
# para:
#   ~/.openclaw/skills/opensync/SKILL.md`}
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              O <span className="font-mono">SKILL.md</span> do repositório inclui frontmatter{" "}
              <span className="font-mono">name</span> / <span className="font-mono">description</span> conforme o
              formato esperado pelo OpenClaw.
            </p>
            <h3 className="mt-6 text-sm font-semibold text-foreground">Precisa de reiniciar o Gateway?</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Em geral <strong className="font-medium text-foreground">não</strong>: com o watcher de skills ativo por
              defeito, alterações a <span className="font-mono">SKILL.md</span> podem refletir-se na{" "}
              <strong className="font-medium text-foreground">próxima jogada</strong> do agente. O snapshot de skills é
              criado <strong className="font-medium text-foreground">no início da sessão</strong> — por isso, se a skill
              não aparecer, abra uma <strong className="font-medium text-foreground">nova sessão</strong> de chat. Só
              precisa de reiniciar o processo do Gateway se mudou configuração do próprio Gateway (ex.{" "}
              <span className="font-mono">openclaw.json</span>) ou se o ambiente não aplicar mudanças.
            </p>
          </li>

          <li className="pl-2">
            <h2 className="text-base font-semibold text-foreground">Variáveis de ambiente</h2>
            <p className="mt-2 text-muted-foreground">
              Defina a URL base da API (com sufixo <span className="font-mono text-xs">/api</span>), o UUID do
              vault e a API key mostrada uma vez no OpenSync (mesmo valor do cabeçalho{" "}
              <span className="font-mono text-xs">Authorization: Bearer</span>).
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
              {`export OPENSYNC_API_URL="https://api.opensync.space/api"
export OPENSYNC_VAULT_ID="<uuid-do-vault-no-dashboard>"
export OPENSYNC_AGENT_API_KEY="<api-key-osk_...>"`}
            </pre>
          </li>

          <li className="pl-2">
            <h2 className="text-base font-semibold text-foreground">Pedido de sincronização</h2>
            <p className="mt-2 text-muted-foreground">
              O plugin OpenSync usa <span className="font-mono text-xs">POST</span> para o endpoint de push (corpo
              JSON conforme a versão do plugin).
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
              {`POST \${OPENSYNC_API_URL}/git/\${OPENSYNC_VAULT_ID}/push
Authorization: Bearer \${OPENSYNC_AGENT_API_KEY}
Content-Type: application/json`}
            </pre>
          </li>

          <li className="pl-2">
            <h2 className="text-base font-semibold text-foreground">Alternativa: Git na VPS</h2>
            <p className="mt-2 text-muted-foreground">
              No dashboard OpenSync, <strong className="font-medium text-foreground">Git na VPS</strong> permite
              gerar deploy key e usar <span className="font-mono text-xs">git push</span> direto ao Gitea, em
              paralelo com a API.
            </p>
          </li>
        </ol>

        <p className="mt-12 text-center text-xs text-muted-foreground">
          <Link href="/" className="font-medium text-primary underline-offset-2 hover:underline">
            Voltar ao início
          </Link>
        </p>
      </div>
    </div>
  );
}
