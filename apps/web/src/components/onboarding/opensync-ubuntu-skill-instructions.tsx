"use client";

import { BookOpen, ExternalLink, Monitor, Terminal } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const codeBoxClass =
  "mt-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-foreground sm:text-[11px]";

export type ConnectAgentSkillStep3PanelProps = {
  skillGuideUrl: string;
  skillMdUrl: string;
  apiBaseUrl: string;
  vaultId: string;
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
  const hasApiKey = agentApiKey.trim().length > 0;

  const envBlock = [
    `export OPENSYNC_API_URL="${apiBaseUrl}"`,
    `export OPENSYNC_VAULT_ID="${vaultId}"`,
    `export OPENSYNC_AGENT_API_KEY="${agentApiKey}"`,
  ].join("\n");

  return (
    <div className="space-y-4" aria-labelledby="opensync-connect-heading">
      {/* ── Opção 1: opensync-ubuntu ── */}
      <div className="rounded-xl border border-border bg-background/60 p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
            <Monitor className="size-4 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Opção 1 — App Ubuntu (recomendado)</p>
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
                Vá em{" "}
                <Link
                  href="/settings?section=access-tokens"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Configurações → Tokens de acesso
                </Link>{" "}
                e clique em <strong className="font-medium text-foreground">Gerar token</strong>. Guarde o{" "}
                <span className="font-mono text-[10px]">usk_...</span> — será pedido no passo 3.
              </p>
            </div>
          </li>

          <li className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">2</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Instale o pacote .deb</p>
              <pre className={codeBoxClass}>{"sudo dpkg -i opensync-ubuntu_*.deb"}</pre>
              <a
                href="https://gitea.opensync.space/opensync/opensync/releases"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 inline-flex")}
              >
                Baixar .deb
                <ExternalLink className="ml-1.5 size-3.5 opacity-70" />
              </a>
            </div>
          </li>

          <li className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">3</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Execute o wizard de configuração</p>
              <pre className={codeBoxClass}>{"opensync-ubuntu init"}</pre>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
                O wizard pede e-mail, token <span className="font-mono">usk_...</span>, escolha da pasta local e
                seleciona (ou cria) o vault. O serviço é ativado automaticamente no boot.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => onCopyBlock("opensync-ubuntu init")}
              >
                Copiar comando
              </Button>
            </div>
          </li>
        </ol>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Link
            href="/docs/agent/ubuntu"
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            Guia completo
          </Link>
          <Link
            href="/settings?section=access-tokens"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Gerar token agora
          </Link>
        </div>
      </div>

      {/* ── Opção 2: via SKILL ── */}
      <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
            <BookOpen className="size-4 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Opção 2 — Via SKILL (OpenClaw)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Se usa o assistente OpenClaw, instale a skill OpenSync. Ela inclui os passos
              de instalação do <span className="font-mono text-[10px]">opensync-ubuntu</span> e guia o agente
              a configurar o serviço automaticamente.
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
      </div>

      {/* ── Avançado: API key direta ── */}
      <details className="group rounded-xl border border-border">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Terminal className="size-3.5" />
          Avançado — API key direta (scripts / VPS)
        </summary>
        <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="text-xs text-muted-foreground">
            Para scripts, servidores ou integração manual sem o app ubuntu. Gere uma API key{" "}
            <span className="font-mono text-[10px]">osk_...</span> na secção{" "}
            <strong className="font-medium text-foreground">API key para scripts/VPS</strong> abaixo e use as variáveis aqui.
          </p>
          {hasApiKey ? (
            <>
              <pre className={cn(codeBoxClass, "mt-2 whitespace-pre-wrap break-all")}>{envBlock}</pre>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => onCopyBlock(envBlock)}
              >
                Copiar variáveis
              </Button>
            </>
          ) : (
            <div className="mt-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
              Gere uma <strong className="font-medium text-foreground">API key</strong> com o botão acima.
              A chave só é mostrada uma vez.
            </div>
          )}
        </div>
      </details>

      {footerHint ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100">
          {footerHint}
        </div>
      ) : null}
    </div>
  );
}
