import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agente Ubuntu | OpenSync",
  description:
    "Sincronizar qualquer pasta no Ubuntu com um vault — sem OpenClaw, skill ou plugin. Só opensync-ubuntu e API key.",
};

export default function UbuntuAgentDocPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">Agente Ubuntu (opensync-ubuntu)</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Fluxo <strong className="font-medium text-foreground">autónomo</strong>: liga{" "}
        <strong className="font-medium text-foreground">qualquer diretório</strong> no seu Ubuntu (por exemplo{" "}
        <span className="font-mono text-xs">~/Documentos/O meu vault</span> ou um disco externo montado) ao vault na
        OpenSync. <strong className="font-medium text-foreground">Não</strong> é necessário OpenClaw, skill OpenSync nem
        plugin — apenas instalar o <span className="font-mono text-foreground">opensync-ubuntu</span>, correr{" "}
        <span className="font-mono text-foreground">init</span> com a API key gerada no dashboard e opcionalmente
        activar o serviço em segundo plano.
      </p>

      <h2 className="mt-8 text-lg font-medium">Instalação</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          <strong className="text-foreground">Pacote .deb</strong> (recomendado): baixe a versão mais recente em{" "}
          <a
            href="https://gitea.opensync.space/opensync/opensync/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            opensync/releases
          </a>{" "}
          e instale com{" "}
          <span className="font-mono text-xs text-foreground">sudo dpkg -i opensync-ubuntu_*.deb</span>.
        </li>
        <li>
          <strong className="text-foreground">A partir do código</strong>: no monorepo OpenSync,{" "}
          <span className="font-mono text-xs text-foreground">pnpm --filter @opensync/opensync-ubuntu exec tsc</span> e
          execute <span className="font-mono text-xs text-foreground">node dist/cli.js</span>.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-medium">Configuração</h2>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
        {`opensync-ubuntu init
# Informe: API URL, Vault ID, pasta a sincronizar e API key (osk_...)
# O init valida as credenciais e oferece ativar o servico systemd automaticamente.

# Ver status do sync:
opensync-ubuntu status

# Logs em tempo real:
journalctl --user -u opensync-ubuntu -f`}
      </pre>
      <p className="mt-2 text-sm text-muted-foreground">
        Credenciais: ficheiro <span className="font-mono text-foreground">~/.config/opensync/config.json</span> e token
        em <span className="font-mono text-foreground">~/.config/opensync/agent.token</span> (permissões restritas) ou
        variável <span className="font-mono text-foreground">OPENSYNC_AGENT_API_KEY</span>.
      </p>

      <p className="mt-8 text-sm text-muted-foreground">
        <Link href="/docs/agent/opensync-skill" className="font-medium text-primary underline-offset-4 hover:underline">
          Skill / integração OpenClaw
        </Link>{" "}
        — apenas para quem quer sincronizar via assistente; <strong className="font-medium text-foreground">não</strong>{" "}
        faz parte deste fluxo nem substitui o <span className="font-mono text-xs">opensync-ubuntu</span> para pastas
        locais.
      </p>
    </main>
  );
}
