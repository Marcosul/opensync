"use client";

import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  DEFAULT_SSH_REMOTE_PATH,
  type AgentConnectionForm,
  type AgentConnectionMode,
} from "@/lib/onboarding-agent";
import { cn } from "@/lib/utils";

const modeOptions: { id: AgentConnectionMode; label: string; hint: string }[] = [
  {
    id: "ssh_key",
    label: "SSH com chave",
    hint: "IP ou host, porta e chave privada",
  },
  {
    id: "ssh_password",
    label: "SSH com usuario e senha",
    hint: "IP ou host, porta, usuario e senha",
  },
];

type AgentConnectionStepProps = {
  form: AgentConnectionForm;
  onChange: (next: AgentConnectionForm) => void;
  /** Oculta titulo e texto introdutorio (quando o pai ja exibe o cabecalho da etapa). */
  hideIntro?: boolean;
};

export function AgentConnectionStep({ form, onChange, hideIntro = false }: AgentConnectionStepProps) {
  const [showSshPassword, setShowSshPassword] = useState(false);

  function patch<K extends keyof AgentConnectionForm>(key: K, value: AgentConnectionForm[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="space-y-5">
      {hideIntro ? null : (
        <div>
          <h2 className="text-base font-medium">Como o OpenSync deve acessar seu agente?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            SSH lê <span className="font-mono">~/.openclaw</span> na VPS; a ligação é testada ao
            guardar.
          </p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-1">
        {modeOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => patch("agentMode", opt.id)}
            className={cn(
              "flex w-full flex-col rounded-xl border p-3 text-left text-sm transition-colors",
              form.agentMode === opt.id
                ? "border-primary bg-primary/10"
                : "border-border bg-background hover:bg-muted/50",
            )}
          >
            <span className="font-medium">{opt.label}</span>
            <span className="text-xs text-muted-foreground">{opt.hint}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ssh-host">IP ou host</FieldLabel>
            <input
              id="ssh-host"
              type="text"
              autoComplete="off"
              placeholder="Exemplo: 192.168.1.10 ou agente.meudominio.com"
              value={form.sshHost}
              onChange={(e) => patch("sshHost", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ssh-port">Porta SSH</FieldLabel>
            <input
              id="ssh-port"
              type="text"
              inputMode="numeric"
              placeholder="22"
              value={form.sshPort}
              onChange={(e) => patch("sshPort", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="ssh-user">Usuario</FieldLabel>
            <input
              id="ssh-user"
              type="text"
              autoComplete="username"
              placeholder="usuario"
              value={form.sshUser}
              onChange={(e) => patch("sshUser", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="ssh-remote-path">Pasta remota (OpenClaw)</FieldLabel>
          <input
            id="ssh-remote-path"
            type="text"
            autoComplete="off"
            placeholder={DEFAULT_SSH_REMOTE_PATH}
            value={form.sshRemotePath}
            onChange={(e) => patch("sshRemotePath", e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            No servidor; pode usar <span className="font-mono">~</span>. Defeito:{" "}
            <span className="font-mono">~/.openclaw</span>.
          </p>
        </div>

        {form.agentMode === "ssh_key" ? (
          <>
            <SshKeyGenerationHelp />
            <FieldLabel htmlFor="ssh-key">Chave privada (SSH)</FieldLabel>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Ficheiro <strong className="text-foreground">sem</strong> <code className="font-mono">.pub</code>: PEM
              completo (<code className="font-mono">BEGIN ... PRIVATE KEY</code>) ou só o bloco Base64 OpenSSH. Não use{" "}
              <code className="font-mono">ssh-ed25519 AAA...</code> (chave pública).
            </p>
            <textarea
              id="ssh-key"
              rows={6}
              autoComplete="off"
              placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n..."}
              value={form.sshPrivateKey}
              onChange={(e) => patch("sshPrivateKey", e.target.value)}
              className={cn(inputClass, "min-h-[120px] resize-y font-mono text-xs")}
            />
          </>
        ) : (
          <>
            <FieldLabel htmlFor="ssh-password">Senha</FieldLabel>
            <div className="relative mt-1">
              <input
                id="ssh-password"
                type={showSshPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Senha SSH"
                value={form.sshPassword}
                onChange={(e) => patch("sshPassword", e.target.value)}
                className={cn(inputClass, "mt-0 pr-11")}
              />
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label={showSshPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showSshPassword}
                onClick={() => setShowSshPassword((v) => !v)}
              >
                {showSshPassword ? (
                  <EyeOff className="size-4 shrink-0" aria-hidden />
                ) : (
                  <Eye className="size-4 shrink-0" aria-hidden />
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
      {children}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

const codeBlockClass =
  "mt-1 block overflow-x-auto rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground sm:text-xs";

const sshOsTabIds = ["linux", "macos", "windows"] as const;
type SshOsTabId = (typeof sshOsTabIds)[number];

const sshOsTabLabels: Record<SshOsTabId, string> = {
  linux: "Linux",
  macos: "macOS",
  windows: "Windows",
};

function SshKeyGenerationHelp() {
  const [osTab, setOsTab] = useState<SshOsTabId>("linux");

  return (
    <details className="rounded-xl border border-border bg-muted/25 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40">
        Comandos SSH
      </summary>
      <div className="border-t border-border px-3 py-3">
        <p className="mb-3 text-[10px] text-muted-foreground">
          Pública só no servidor (<code className="font-mono">authorized_keys</code>); privada só neste
          formulário. Enter em branco duas vezes no <code className="font-mono">ssh-keygen</code> = sem
          frase-passe.
        </p>

        <div
          role="tablist"
          aria-label="Sistema operativo"
          className="flex flex-wrap gap-1 border-b border-border pb-px"
        >
          {sshOsTabIds.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`ssh-os-tab-${id}`}
              aria-selected={osTab === id}
              aria-controls={`ssh-os-panel-${id}`}
              tabIndex={osTab === id ? 0 : -1}
              onClick={() => setOsTab(id)}
              className={cn(
                "rounded-t-md px-3 py-1.5 text-xs font-medium outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2",
                osTab === id
                  ? "border border-b-0 border-border bg-background text-foreground"
                  : "border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {sshOsTabLabels[id]}
            </button>
          ))}
        </div>

        <div className="mt-3 rounded-lg border border-border bg-background/60 p-3">
          {osTab === "linux" ? (
            <div
              id="ssh-os-panel-linux"
              role="tabpanel"
              aria-labelledby="ssh-os-tab-linux"
              className="space-y-3"
            >
              <div>
                <p className="text-[11px] font-medium text-foreground">1. Criar o par</p>
                <pre className={codeBlockClass}>
                  {`ssh-keygen -t ed25519 -f ~/.ssh/opensync_vps`}
                </pre>
              </div>
              <div>
                <p className="text-[11px] font-medium text-foreground">
                  2. Pública no servidor (<code className="font-mono">~/.ssh/authorized_keys</code>)
                </p>
                <pre className={codeBlockClass}>
                  {`cat ~/.ssh/opensync_vps.pub
mkdir -p ~/.ssh && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
# Acrescente a linha do .pub a authorized_keys na VPS.`}
                </pre>
              </div>
              <div>
                <p className="text-[11px] font-medium text-foreground">3. Privada para o OpenSync</p>
                <pre className={codeBlockClass}>
                  {`# Na VPS (sem instalar nada): copie a saída inteira
cat ~/.ssh/opensync_vps

# No seu PC Linux com X11:
xclip -selection clipboard < ~/.ssh/opensync_vps

# Wayland:
wl-copy < ~/.ssh/opensync_vps

# Do seu PC, descarregar o ficheiro:
scp usuario@servidor:~/.ssh/opensync_vps ./opensync_vps`}
                </pre>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  <code className="font-mono">xclip</code> precisa de ambiente gráfico; na VPS use{" "}
                  <code className="font-mono">cat</code> e copie no terminal.
                </p>
              </div>
            </div>
          ) : null}

          {osTab === "macos" ? (
            <div
              id="ssh-os-panel-macos"
              role="tabpanel"
              aria-labelledby="ssh-os-tab-macos"
              className="space-y-3"
            >
              <div>
                <p className="text-[11px] font-medium text-foreground">1. Criar o par (Terminal)</p>
                <pre className={codeBlockClass}>
                  {`ssh-keygen -t ed25519 -f ~/.ssh/opensync_vps`}
                </pre>
              </div>
              <div>
                <p className="text-[11px] font-medium text-foreground">
                  2. Pública no servidor (<code className="font-mono">authorized_keys</code>)
                </p>
                <pre className={codeBlockClass}>
                  {`cat ~/.ssh/opensync_vps.pub
pbcopy < ~/.ssh/opensync_vps.pub
# Cole no servidor na linha certa de authorized_keys.`}
                </pre>
              </div>
              <div>
                <p className="text-[11px] font-medium text-foreground">3. Privada para o OpenSync</p>
                <pre className={codeBlockClass}>
                  {`pbcopy < ~/.ssh/opensync_vps
# ou ver e copiar manualmente:
cat ~/.ssh/opensync_vps

# Descarregar da VPS para o Mac:
scp usuario@servidor:~/.ssh/opensync_vps ~/Desktop/opensync_vps`}
                </pre>
              </div>
            </div>
          ) : null}

          {osTab === "windows" ? (
            <div
              id="ssh-os-panel-windows"
              role="tabpanel"
              aria-labelledby="ssh-os-tab-windows"
              className="space-y-3"
            >
              <div>
                <p className="text-[11px] font-medium text-foreground">1. Criar o par (PowerShell)</p>
                <pre className={codeBlockClass}>
                  {`mkdir $env:USERPROFILE\\.ssh -Force
ssh-keygen -t ed25519 -f "$env:USERPROFILE\\.ssh\\opensync_vps"`}
                </pre>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Precisa do cliente OpenSSH (Definições → Funcionalidades opcionais). Alternativa:{" "}
                  <strong className="text-foreground">Git Bash</strong> com o mesmo comando que em Linux.
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-foreground">
                  2. Pública no servidor (<code className="font-mono">authorized_keys</code>)
                </p>
                <pre className={codeBlockClass}>
                  {`Get-Content $env:USERPROFILE\\.ssh\\opensync_vps.pub
# Copie a linha e coloque na VPS em ~/.ssh/authorized_keys
mkdir -p ~/.ssh && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`}
                </pre>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Os dois últimos comandos executam na VPS (via SSH).
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-foreground">3. Privada para o OpenSync</p>
                <pre className={codeBlockClass}>
                  {`Get-Content $env:USERPROFILE\\.ssh\\opensync_vps -Raw | Set-Clipboard

# Ou descarregar da VPS:
scp usuario@servidor:~/.ssh/opensync_vps .\\opensync_vps`}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}
