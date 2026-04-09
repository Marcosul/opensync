"use client";

import { BookOpen, ExternalLink, Monitor } from "lucide-react";
import Link from "next/link";

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

  const ubuntuServiceBlock = [
    "systemctl --user daemon-reload",
    "systemctl --user enable opensync-ubuntu",
    "systemctl --user start opensync-ubuntu",
    "journalctl --user -u opensync-ubuntu -f",
  ].join("\n");

  const cronBlockOptional = [
    "openclaw cron add \\",
    '  --name "OpenSync vault sync (30m)" \\',
    "  --every 30m \\",
    "  --session isolated \\",
    `  --message "OpenSync: snapshot via API ${apiBaseUrl}/agent/vaults/${vaultId}/files/snapshot com JSON {files} + Bearer OPENSYNC_AGENT_API_KEY." \\`,
    "  --tools exec \\",
    "  --delivery none",
  ].join("\n");

  return (
    <div
      className="space-y-6 rounded-xl border border-primary/25 bg-primary/[0.06] p-4 sm:p-5"
      aria-labelledby="opensync-connect-heading"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-background/80">
          <Monitor className="size-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 id="opensync-connect-heading" className="text-sm font-semibold text-foreground">
            Ligar o vault ao seu Ubuntu
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Para sincronizar <strong className="font-medium text-foreground">qualquer pasta</strong> no computador,
            só precisa do <span className="font-mono text-[10px]">opensync-ubuntu</span> e da API key —{" "}
            <strong className="font-medium text-foreground">sem</strong> OpenClaw,{" "}
            <strong className="font-medium text-foreground">sem</strong> skill e{" "}
            <strong className="font-medium text-foreground">sem</strong> plugin.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background/60 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <Monitor className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">1. opensync-ubuntu (fluxo completo)</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Instale o pacote <span className="font-mono text-foreground">opensync-ubuntu</span>, execute{" "}
              <span className="font-mono text-foreground">opensync-ubuntu init</span> e indique o{" "}
              <strong className="font-medium text-foreground">caminho absoluto</strong> da pasta que quer manter igual
              ao vault (pode ser qualquer directório com permissões de leitura/escrita).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href="/docs/agent/ubuntu"
                className={cn(buttonVariants({ variant: "default", size: "sm" }))}
              >
                Guia de instalação
              </Link>
              <Button type="button" variant="outline" size="sm" onClick={() => onCopyBlock("opensync-ubuntu init")}>
                Copiar comando init
              </Button>
            </div>
            <p className="mt-2 text-[10px] font-medium text-foreground sm:text-[11px]">Serviço em segundo plano</p>
            <pre className={cn(codeBoxClass, "mt-1 whitespace-pre-wrap break-all")}>{ubuntuServiceBlock}</pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => onCopyBlock(ubuntuServiceBlock)}
            >
              Copiar comandos systemd
            </Button>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-foreground">2. Credenciais deste vault</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          O <span className="font-mono text-foreground">opensync-ubuntu</span> grava API URL, vault ID e token em{" "}
          <span className="font-mono text-[10px]">~/.config/opensync/</span> durante o{" "}
          <span className="font-mono text-[10px]">init</span>. O bloco abaixo é para copiar/colar noutro terminal ou
          scripts; os valores são os mesmos.
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

      <div className="rounded-lg border border-dashed border-border bg-muted/15 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">3. Só para OpenClaw (ignorar se usa só Ubuntu)</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Quem sincroniza <strong className="font-medium text-foreground">só</strong> com{" "}
              <span className="font-mono text-[10px]">opensync-ubuntu</span> pode saltar esta secção. Isto é apenas para
              quem quer o mesmo vault ligado a um <strong className="font-medium text-foreground">assistente</strong>{" "}
              OpenClaw (skill + cron).
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
        <p className="mt-2 text-[10px] text-muted-foreground sm:text-[11px]">
          Cron exemplo (endpoint{" "}
          <span className="break-all font-mono text-foreground">
            /agent/vaults/{vaultId}/files/snapshot
          </span>
          ):
        </p>
        <pre className={cn(codeBoxClass, "mt-1 whitespace-pre-wrap break-all")}>{cronBlockOptional}</pre>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onCopyBlock(cronBlockOptional)}>
          Copiar cron OpenClaw
        </Button>
      </div>

      <div className="rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100">
        {footerHint ??
          "Guarde a API key: não a voltamos a mostrar. Para qualquer pasta no Ubuntu, basta opensync-ubuntu + init — sem skill nem plugin. Deploy key no mesmo ecrã é só para git na VPS."}
      </div>
    </div>
  );
}
