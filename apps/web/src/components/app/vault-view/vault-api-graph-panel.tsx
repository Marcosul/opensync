"use client";

import { RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "@/api/rest/generic";
import type { GraphNode, VaultGraphResponse } from "@/app/api/vaults/[id]/graph/route";
import { VaultGraphView } from "@/components/app/vault-graph-view";
import { cn } from "@/lib/utils";

/** Grafo persistido (API) dentro da área do editor do cofre — mantém explorador e barra de abas. */
export function VaultApiGraphPanel({
  vaultId,
  className,
}: {
  vaultId: string;
  className?: string;
}) {
  const [data, setData] = useState<VaultGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const fetchGraph = useCallback(
    async (rebuild = false) => {
      if (!vaultId) return;
      setLoading(true);
      setError(null);
      try {
        const qs = rebuild ? "?rebuild=true" : "";
        const result = await apiRequest<VaultGraphResponse>(
          `/api/vaults/${encodeURIComponent(vaultId)}/graph${qs}`,
        );
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao carregar grafo.");
      } finally {
        setLoading(false);
      }
    },
    [vaultId],
  );

  useEffect(() => {
    void fetchGraph();
  }, [fetchGraph]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card/30 px-3">
        <span className="text-xs font-medium text-foreground/90">Grafo do vault</span>
        {data ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {data.nodes.length} nós · {data.edges.length} ligações
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchGraph(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
            Reconstruir
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-row overflow-hidden">
        {selectedNode ? (
          <aside className="flex w-52 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-card/40 p-3 text-sm sm:w-56">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Arquivo
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-foreground">{selectedNode.path}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Tipo</p>
              <p className="mt-1 text-xs capitalize text-foreground">{selectedNode.type}</p>
            </div>
            <Link
              href={`/vault?vaultId=${encodeURIComponent(vaultId)}&file=${encodeURIComponent(selectedNode.path)}`}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Share2 className="size-3" />
              Abrir no editor
            </Link>
          </aside>
        ) : null}

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/20">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="size-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">A construir grafo…</p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
              <div className="max-w-sm rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center">
                <p className="text-sm font-medium text-destructive">Erro ao carregar grafo</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                <button
                  type="button"
                  onClick={() => void fetchGraph()}
                  className="mt-3 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                >
                  Tentar novamente
                </button>
              </div>
            </div>
          )}

          {data && !loading && data.nodes.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Vault sem arquivos</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sincronize arquivos para ver o grafo de ligações.
                </p>
              </div>
            </div>
          )}

          {data && data.nodes.length > 0 && (
            <VaultGraphView
              data={data}
              onNodeClick={setSelectedNode}
              className="h-full w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}
