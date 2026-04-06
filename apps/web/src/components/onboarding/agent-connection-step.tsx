"use client";

import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { AgentConnectionForm, AgentConnectionMode } from "@/lib/onboarding-agent";

const modeOptions: { id: AgentConnectionMode; label: string; hint: string }[] = [
  {
    id: "gateway",
    label: "Gateway + token",
    hint: "URL do gateway e o token do agente",
  },
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
};

export function AgentConnectionStep({ form, onChange }: AgentConnectionStepProps) {
  const [showGatewayToken, setShowGatewayToken] = useState(false);

  function patch<K extends keyof AgentConnectionForm>(key: K, value: AgentConnectionForm[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium">Como o OpenSync deve acessar seu agente?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha uma opcao. Os dados sao usados para conectar ao seu ambiente; em producao,
          prefira segredos e variaveis de ambiente no servidor.
        </p>
      </div>

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

      {form.agentMode === "gateway" ? (
        <div className="space-y-3">
          <FieldLabel htmlFor="gateway-url">URL do Gateway</FieldLabel>
          <input
            id="gateway-url"
            type="url"
            autoComplete="off"
            placeholder="Exemplo: https://gateway.exemplo.com"
            value={form.gatewayUrl}
            onChange={(e) => patch("gatewayUrl", e.target.value)}
            className={inputClass}
          />
          <FieldLabel htmlFor="gateway-token">Token</FieldLabel>
          <div className="relative mt-1">
            <input
              id="gateway-token"
              type={showGatewayToken ? "text" : "password"}
              autoComplete="off"
              placeholder="Cole o token do agente"
              value={form.gatewayToken}
              onChange={(e) => patch("gatewayToken", e.target.value)}
              className={cn(inputClass, "mt-0 pr-11")}
            />
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={showGatewayToken ? "Ocultar token" : "Mostrar token"}
              aria-pressed={showGatewayToken}
              onClick={() => setShowGatewayToken((v) => !v)}
            >
              {showGatewayToken ? (
                <EyeOff className="size-4 shrink-0" aria-hidden />
              ) : (
                <Eye className="size-4 shrink-0" aria-hidden />
              )}
            </button>
          </div>
        </div>
      ) : null}

      {form.agentMode === "ssh_key" || form.agentMode === "ssh_password" ? (
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
          {form.agentMode === "ssh_key" ? (
            <>
              <FieldLabel htmlFor="ssh-key">Chave privada (SSH)</FieldLabel>
              <textarea
                id="ssh-key"
                rows={6}
                autoComplete="off"
                placeholder="Cole o conteudo da chave privada (-----BEGIN ...)"
                value={form.sshPrivateKey}
                onChange={(e) => patch("sshPrivateKey", e.target.value)}
                className={cn(inputClass, "min-h-[120px] resize-y font-mono text-xs")}
              />
            </>
          ) : (
            <>
              <FieldLabel htmlFor="ssh-password">Senha</FieldLabel>
              <input
                id="ssh-password"
                type="password"
                autoComplete="current-password"
                placeholder="Senha SSH"
                value={form.sshPassword}
                onChange={(e) => patch("sshPassword", e.target.value)}
                className={inputClass}
              />
            </>
          )}
        </div>
      ) : null}
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
