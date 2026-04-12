import Link from "next/link";

import type { Metadata } from "next";

import { getUbuntuInstallOnelinerForServer } from "@/lib/opensync-public-urls";

export const metadata: Metadata = {
  title: "Agente Ubuntu | OpenSync",
  description:
    "Sincronizar qualquer pasta no Ubuntu com um vault — wizard guiado, sem configuração manual.",
};

const codeClass =
  "rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground";

export default function UbuntuAgentDocPage() {
  const installOneliner = getUbuntuInstallOnelinerForServer();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">
        Agente Ubuntu (<span className="font-mono text-xl">opensync-ubuntu</span>)
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Liga qualquer pasta do Ubuntu a um vault OpenSync. O wizard de configuração guia tudo —{" "}
        <strong className="font-medium text-foreground">sem</strong> editar ficheiros de configuração manualmente.
      </p>

      {/* ── Instalação + wizard ── */}
      <h2 className="mt-8 text-lg font-medium">1. Instalar e configurar</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        No Ubuntu (amd64), uma linha: o site serve um script que descarrega o{" "}
        <code className={codeClass}>.deb</code>, instala com <code className={codeClass}>dpkg</code> e de seguida corre{" "}
        <code className={codeClass}>opensync-ubuntu init</code> (o assistente interativo).
      </p>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
        {installOneliner}
      </pre>
      <p className="mt-2 text-sm text-muted-foreground">
        Com <code className={codeClass}>curl … | bash</code> o script volta a ligar o teclado ao terminal para o wizard.
        Para inspecionar o instalador antes de executar, abra o URL no browser ou use{" "}
        <code className={codeClass}>curl -fsSL …</code> sem enviar a saída para o bash.
      </p>

      <p className="mt-4 text-sm font-medium text-foreground">O assistente irá:</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Pedir o e-mail da conta OpenSync.</li>
        <li>
          Pedir o token de workspace (<code className={codeClass}>usk_...</code>). Gere-o em{" "}
          <Link
            href="/settings?section=access-tokens"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Definições → Tokens de acesso
          </Link>
          .
        </li>
        <li>Autenticar e listar os seus vaults para escolher (ou criar um novo).</li>
        <li>Pedir a pasta local a sincronizar.</li>
        <li>Gerar automaticamente um token de sincronização para o vault.</li>
        <li>Ativar o serviço systemd para arrancar com o sistema.</li>
      </ol>

      {/* ── Gestão ── */}
      <h2 className="mt-8 text-lg font-medium">2. Gerir o serviço</h2>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
        {`# Ver estado do sync
opensync-ubuntu status

# Logs em tempo real
journalctl --user -u opensync-ubuntu -f

# Parar / reiniciar
systemctl --user stop opensync-ubuntu
systemctl --user restart opensync-ubuntu`}
      </pre>

      {/* ── Ficheiros de configuração ── */}
      <h2 className="mt-8 text-lg font-medium">Ficheiros de configuração</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          <code className={codeClass}>~/.config/opensync/config.json</code> — vault ID, pasta local, API URL.
        </li>
        <li>
          <code className={codeClass}>~/.config/opensync/agent.token</code> — token de sincronização (permissões restritas).
        </li>
        <li>
          <code className={codeClass}>~/.local/share/opensync-ubuntu/{"{vaultId}"}.sqlite</code> — estado local dos ficheiros.
        </li>
      </ul>

      {/* ── Skill ── */}
      <p className="mt-8 text-sm text-muted-foreground">
        Prefere usar o assistente OpenClaw?{" "}
        <Link
          href="/docs/agent/opensync-skill"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Instale a skill OpenSync
        </Link>{" "}
        — inclui os passos de instalação do <code className={codeClass}>opensync-ubuntu</code> e guia o agente
        a configurar tudo automaticamente.
      </p>
    </main>
  );
}
