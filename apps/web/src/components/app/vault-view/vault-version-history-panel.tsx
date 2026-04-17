"use client";

import { ChevronLeft, ChevronRight, History, Loader2, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "@/api/rest/generic";
import { fetchVaultGitCommitDiff } from "@/lib/vault-git-client";
import { cn } from "@/lib/utils";

export type VaultCommitRow = {
  sha: string;
  message: string;
  authorName: string;
  authoredAt: string;
};

function diffLineTone(line: string): "add" | "remove" | "hunk" | "meta" | "context" {
  if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("diff --git")) {
    return "meta";
  }
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  return "context";
}

type Props = {
  vaultId: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onRequestClose: () => void;
  onRestoreCommit: (sha: string) => Promise<void>;
  isRestoring: boolean;
};

export function VaultVersionHistoryPanel({
  vaultId,
  collapsed,
  onCollapsedChange,
  onRequestClose,
  onRestoreCommit,
  isRestoring,
}: Props) {
  const [commits, setCommits] = useState<VaultCommitRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [patch, setPatch] = useState<string | null>(null);
  const [patchTruncated, setPatchTruncated] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    setCommits([]);
    setSelectedSha(null);
    setPatch(null);
    setPatchTruncated(false);
    setDiffError(null);
    (async () => {
      try {
        const result = await apiRequest<{ commits: VaultCommitRow[] }>(
          `/api/vaults/${encodeURIComponent(vaultId)}/git/commits?limit=30`,
        );
        if (cancelled) return;
        setCommits(result.commits);
      } catch (e) {
        if (cancelled) return;
        setListError(e instanceof Error ? e.message : "Falha ao carregar commits.");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultId]);

  const loadDiff = useCallback(async (sha: string) => {
    setDiffLoading(true);
    setDiffError(null);
    setPatch(null);
    setPatchTruncated(false);
    try {
      const { patch: p, truncated } = await fetchVaultGitCommitDiff(vaultId, sha);
      setPatch(p);
      setPatchTruncated(truncated);
    } catch (e) {
      setDiffError(e instanceof Error ? e.message : "Falha ao carregar diff.");
    } finally {
      setDiffLoading(false);
    }
  }, [vaultId]);

  const onSelectCommit = useCallback(
    (sha: string) => {
      setSelectedSha(sha);
      void loadDiff(sha);
    },
    [loadDiff],
  );

  const lines = patch ? patch.replace(/\r\n/g, "\n").split("\n") : [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-sidebar/30">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-1.5">
        {!collapsed ? (
          <>
            <History className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-foreground">
              Versões (Gitea)
            </span>
            <button
              type="button"
              title="Recolher painel"
              onClick={() => onCollapsedChange(true)}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Recolher painel"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              title="Fechar"
              onClick={onRequestClose}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Fechar painel de versões"
            >
              <X className="size-4" />
            </button>
          </>
        ) : (
          <div className="flex w-full flex-col items-center gap-1 py-1">
            <button
              type="button"
              title="Expandir painel"
              onClick={() => onCollapsedChange(false)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Expandir painel"
            >
              <ChevronLeft className="size-4" />
            </button>
            <History className="size-3.5 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>

      {!collapsed ? (
        <>
          <div className="flex min-h-0 flex-[0_0_38%] flex-col border-b border-border">
            <div className="shrink-0 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Commits
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
              {listLoading ? (
                <div className="flex items-center gap-2 px-2 py-3 font-mono text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
                  A carregar…
                </div>
              ) : listError ? (
                <p className="px-2 py-2 text-xs text-destructive">{listError}</p>
              ) : commits.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">Nenhum commit encontrado.</p>
              ) : (
                commits.map((c) => {
                  const active = selectedSha === c.sha;
                  return (
                    <button
                      key={c.sha}
                      type="button"
                      onClick={() => onSelectCommit(c.sha)}
                      className={cn(
                        "mb-1 w-full rounded-md border px-2 py-1.5 text-left transition-colors",
                        active
                          ? "border-primary/40 bg-muted"
                          : "border-transparent hover:border-border hover:bg-muted/60",
                      )}
                    >
                      <p className="font-mono text-[10px] text-foreground">{c.sha.slice(0, 12)}</p>
                      <p className="line-clamp-2 text-xs text-foreground">{c.message}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.authorName} · {new Date(c.authoredAt).toLocaleString()}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Alterações
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-0.5 pb-2">
              {!selectedSha ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  Selecione um commit para ver o diff.
                </p>
              ) : diffLoading ? (
                <div className="flex items-center gap-2 px-2 py-3 font-mono text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
                  A carregar diff…
                </div>
              ) : diffError ? (
                <p className="px-2 py-2 text-xs text-destructive">{diffError}</p>
              ) : (
                <div className="rounded border border-border bg-background/50 font-mono text-[10px] leading-relaxed">
                  {patchTruncated ? (
                    <p className="border-b border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-200">
                      Diff truncado no servidor; veja o resto no Gitea se precisar.
                    </p>
                  ) : null}
                  {lines.map((line, i) => {
                    const tone = diffLineTone(line);
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex min-w-0 gap-0.5 border-b border-border/40 px-1 py-0.5 last:border-b-0",
                          tone === "add" &&
                            "bg-green-500/10 text-green-800 dark:text-green-300/90",
                          tone === "remove" && "bg-red-500/10 text-red-800 dark:text-red-300/90",
                          tone === "hunk" && "bg-blue-500/10 text-blue-800 dark:text-blue-300/90",
                          tone === "meta" && "bg-muted/50 text-muted-foreground",
                          tone === "context" && "text-muted-foreground/80",
                        )}
                      >
                        <span className="w-2 shrink-0 select-none text-center opacity-60">
                          {tone === "add" ? "+" : tone === "remove" ? "-" : " "}
                        </span>
                        <span className="min-w-0 whitespace-pre-wrap break-all">{line || " "}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-border p-2">
            <button
              type="button"
              disabled={!selectedSha || isRestoring || diffLoading}
              onClick={() => {
                if (selectedSha) void onRestoreCommit(selectedSha);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-2 py-2 font-mono text-xs font-medium text-primary-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              {isRestoring ? (
                <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
              ) : (
                <RotateCcw className="size-3.5 shrink-0" aria-hidden />
              )}
              Restaurar esta versão
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
