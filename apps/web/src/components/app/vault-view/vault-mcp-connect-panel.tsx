"use client";

import { Check, Copy, Plug, RefreshCw, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { apiRequest } from "@/api/rest/generic";
import { cn } from "@/lib/utils";

type VaultMcpConnectPanelProps = {
  vaultId: string;
  apiBaseUrl: string;
  onRequestClose: () => void;
};

export function VaultMcpConnectPanel({
  vaultId,
  apiBaseUrl,
  onRequestClose,
}: VaultMcpConnectPanelProps) {
  const transportUrl = `${apiBaseUrl}/agent/vaults/${vaultId}/mcp`;

  const [tokenInput, setTokenInput] = useState("");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const clearCopyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeToken = generatedToken ?? tokenInput;

  const configJson = JSON.stringify(
    {
      mcpServers: {
        "opensync-vault": {
          type: "streamable-http",
          url: transportUrl,
          headers: {
            Authorization: `Bearer ${activeToken || "<TOKEN>"}`,
          },
        },
      },
    },
    null,
    2,
  );

  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard.writeText(text).catch(() => undefined);
    if (clearCopyRef.current) clearTimeout(clearCopyRef.current);
    setCopiedKey(key);
    clearCopyRef.current = setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const generateToken = useCallback(async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await apiRequest<{ token: string }>(
        `/api/vaults/${encodeURIComponent(vaultId)}/agent-token`,
        { method: "POST" },
      );
      setGeneratedToken(res.token);
      setTokenInput("");
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Erro ao gerar token.");
    } finally {
      setGenerating(false);
    }
  }, [vaultId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2 pr-1">
        <Plug className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Conexão MCP
        </span>
        <button
          type="button"
          onClick={onRequestClose}
          title="Fechar painel"
          aria-label="Fechar painel MCP"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground",
            "hover:bg-muted hover:text-foreground",
          )}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">
          Conecte qualquer cliente MCP a este vault usando um transport Streamable HTTP.
        </p>

        {/* Transport URL */}
        <section className="space-y-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Transport URL
          </p>
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <span className="min-w-0 flex-1 break-all font-mono text-[10px] text-foreground">
              {transportUrl}
            </span>
            <button
              type="button"
              onClick={() => copy(transportUrl, "url")}
              title="Copiar URL"
              className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              {copiedKey === "url" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </section>

        {/* Config JSON */}
        <section className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Configuração (claude_desktop_config.json)
            </p>
            <button
              type="button"
              onClick={() => copy(configJson, "config")}
              title="Copiar configuração"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {copiedKey === "config" ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
              Copiar
            </button>
          </div>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[9.5px] leading-relaxed text-foreground">
            {configJson}
          </pre>
        </section>

        {/* Token */}
        <section className="space-y-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Token de acesso (osk_...)
          </p>

          {generatedToken ? (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
                Guarde este token agora — não será mostrado novamente.
              </p>
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                <span className="min-w-0 flex-1 break-all font-mono text-[10px] text-foreground">
                  {generatedToken}
                </span>
                <button
                  type="button"
                  onClick={() => copy(generatedToken, "token")}
                  title="Copiar token"
                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                >
                  {copiedKey === "token" ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Cole um token existente osk_..."
                  className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                {tokenInput && (
                  <button
                    type="button"
                    onClick={() => copy(tokenInput, "token")}
                    title="Copiar token"
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    {copiedKey === "token" ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                )}
              </div>
              <p className="px-0.5 font-mono text-[9px] text-muted-foreground/60">
                ou gere um novo token abaixo
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void generateToken()}
            disabled={generating}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-[10px]",
              "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <RefreshCw className={cn("size-3", generating && "animate-spin")} />
            {generating ? "A gerar..." : "Gerar novo token"}
          </button>

          {generateError && (
            <p className="font-mono text-[10px] text-destructive">{generateError}</p>
          )}
        </section>
      </div>
    </div>
  );
}
