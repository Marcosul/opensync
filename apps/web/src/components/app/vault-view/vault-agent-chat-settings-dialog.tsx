"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

import {
  clearAgentChatCredentials,
  loadAgentChatSettings,
  saveAgentChatCredentials,
  type AgentChatCredentials,
} from "@/lib/agent-chat-settings";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (credentials: AgentChatCredentials | null) => void;
};

export function VaultAgentChatSettingsDialog({ open, onClose, onSave }: Props) {
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [token, setToken] = useState("");
  const [agentId, setAgentId] = useState("");
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (open) {
      const settings = loadAgentChatSettings();
      setGatewayUrl(settings.credentials?.gatewayUrl ?? "");
      setToken(settings.credentials?.token ?? "");
      setAgentId(settings.credentials?.agentId ?? "");
      setShowToken(false);
    }
  }, [open]);

  if (!open) return null;

  function handleSave() {
    const url = gatewayUrl.trim();
    const tok = token.trim();
    if (!url || !tok) return;
    const credentials: AgentChatCredentials = {
      gatewayUrl: url,
      token: tok,
      agentId: agentId.trim() || undefined,
    };
    saveAgentChatCredentials(credentials);
    onSave(credentials);
    onClose();
  }

  function handleClear() {
    clearAgentChatCredentials();
    setGatewayUrl("");
    setToken("");
    setAgentId("");
    onSave(null);
    onClose();
  }

  const canSave = gatewayUrl.trim().length > 0 && token.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        role="dialog"
        aria-labelledby="agent-settings-title"
        aria-modal="true"
      >
        <div className="border-b border-border px-4 py-3">
          <h2 id="agent-settings-title" className="text-sm font-semibold text-foreground">
            Credenciais do Agente
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Aceita URLs HTTP(S) ou WebSocket (<code className="font-mono">wss://</code>).
          </p>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="agent-gateway-url">
              URL do Gateway
            </label>
            <input
              id="agent-gateway-url"
              type="text"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
              placeholder="wss://host  ou  https://host/v1/chat/completions"
              className={cn(
                "w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs",
                "placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary",
              )}
            />
            <p className="text-[10px] text-muted-foreground/60">
              Para OpenClaw: use <code className="font-mono">wss://host</code> (converte automaticamente para HTTPS)
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="agent-token">
              Token de Acesso
            </label>
            <div className="relative">
              <input
                id="agent-token"
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="token ou chave de acesso"
                className={cn(
                  "w-full rounded-md border border-border bg-background py-1.5 pl-3 pr-9 font-mono text-xs",
                  "placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary",
                )}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showToken ? "Ocultar token" : "Mostrar token"}
              >
                {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="agent-id">
              ID do Agente{" "}
              <span className="font-normal text-muted-foreground/60">(opcional)</span>
            </label>
            <input
              id="agent-id"
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="main"
              className={cn(
                "w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs",
                "placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary",
              )}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            Limpar credenciais
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
