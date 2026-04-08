"use client";

import { ArrowLeft, Copy, KeyRound, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { apiRequest } from "@/api/rest/generic";
import type { AgentDeployKeyResponse } from "@/app/api/vaults/[id]/git/deploy-key/route";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const monoBlockClass =
  "mt-2 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground outline-none sm:text-xs";

export default function VaultGitSetupPage() {
  const params = useParams();
  const vaultId = typeof params.id === "string" ? params.id.trim() : "";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBootstrap, setLastBootstrap] = useState<AgentDeployKeyResponse | null>(null);
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null);

  const storedFingerprint = useMemo(() => {
    if (typeof window === "undefined" || !vaultId) return null;
    try {
      return localStorage.getItem(`opensync-vault-git-${vaultId}-fingerprint`);
    } catch {
      return null;
    }
  }, [vaultId]);

  const handleGenerate = useCallback(async () => {
    if (!vaultId) return;
    setError(null);
    setRevokeMessage(null);
    setBusy(true);
    try {
      const res = await apiRequest<AgentDeployKeyResponse>(
        `/api/vaults/${encodeURIComponent(vaultId)}/git/deploy-key`,
        { method: "POST" },
      );
      setLastBootstrap(res);
      try {
        localStorage.setItem(
          `opensync-vault-git-${vaultId}-fingerprint`,
          res.fingerprint ?? "",
        );
      } catch {
        /* ignore */
      }
    } catch (e) {
      setLastBootstrap(null);
      setError(e instanceof Error ? e.message : "Falha ao gerar deploy key.");
    } finally {
      setBusy(false);
    }
  }, [vaultId]);

  const handleRevoke = useCallback(async () => {
    if (!vaultId) return;
    if (!window.confirm("Revogar a deploy key no Gitea? A VPS deixara de conseguir push ate gerar uma nova chave.")) {
      return;
    }
    setError(null);
    setRevokeMessage(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; removed: boolean }>(
        `/api/vaults/${encodeURIComponent(vaultId)}/git/deploy-key`,
        { method: "DELETE" },
      );
      setRevokeMessage(res.removed ? "Chave revogada no Gitea." : "Nao havia chave registada.");
      setLastBootstrap(null);
      try {
        localStorage.removeItem(`opensync-vault-git-${vaultId}-fingerprint`);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao revogar.");
    } finally {
      setBusy(false);
    }
  }, [vaultId]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.alert("Nao foi possivel copiar. Selecione o texto manualmente.");
    }
  }, []);

  const cronSnippet = useMemo(() => {
    const short = vaultId ? vaultId.slice(0, 8) : "VAULT";
    return `openclaw cron add \\
  --name "OpenSync vault ${short}" \\
  --every 15m \\
  --session isolated \\
  --message "Execute apenas: bash /root/bin/opensync-vps-git-sync.sh — reporte numa linha se ok ou o erro." \\
  --tools exec \\
  --delivery none`;
  }, [vaultId]);

  if (!vaultId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Vault invalido.</p>
        <Link href="/dashboard" className="mt-4 text-sm text-primary underline">
          Voltar ao dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-card/30 px-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Dashboard
        </Link>
        <span className="text-sm font-medium text-foreground/80">Git na VPS</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <section className="mx-auto w-full max-w-2xl space-y-8 rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              OpenClaw + Gitea
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Ligar o agente por Git
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Gere uma deploy key com acesso só a este repositório. Guarde a chave privada na VPS (nunca no
              repositório). O OpenSync não volta a mostrar a privada.
            </p>
          </div>

          {(storedFingerprint || lastBootstrap?.fingerprint) && (
            <p className="text-xs text-muted-foreground">
              Último fingerprint conhecido neste browser:{" "}
              <span className="font-mono text-foreground">
                {lastBootstrap?.fingerprint || storedFingerprint || "—"}
              </span>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void handleGenerate()}>
              <KeyRound className="mr-2 size-4" />
              {busy ? "A processar…" : "Gerar deploy key"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void handleRevoke()}
            >
              <Trash2 className="mr-2 size-4" />
              Revogar key
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {revokeMessage ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{revokeMessage}</p> : null}

          {lastBootstrap ? (
            <div className="space-y-6 border-t border-border pt-6">
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                Copie a chave privada agora. Não será possível recuperá-la depois.
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium">Chave privada (OpenSSH)</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => void copy(lastBootstrap.privateKeyOpenssh)}
                  >
                    <Copy className="mr-1 size-3.5" />
                    Copiar
                  </Button>
                </div>
                <textarea
                  readOnly
                  className={cn(monoBlockClass, "min-h-[140px] resize-y")}
                  value={lastBootstrap.privateKeyOpenssh}
                />
              </div>

              <div>
                <p className="text-sm font-medium">Clone SSH</p>
                <pre className={monoBlockClass}>{lastBootstrap.cloneSshUrl}</pre>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 text-xs"
                  onClick={() => void copy(lastBootstrap.cloneSshUrl)}
                >
                  <Copy className="mr-1 size-3.5" />
                  Copiar URL
                </Button>
              </div>

              <div>
                <p className="text-sm font-medium">Na VPS (resumo)</p>
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>
                    Guarde a privada em{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      /root/.ssh/opensync_vault_{vaultId.slice(0, 8)}_ed25519
                    </code>{" "}
                    com <code className="font-mono text-xs">chmod 600</code>.
                  </li>
                  <li>
                    <code className="font-mono text-xs">export GIT_SSH_COMMAND=&apos;ssh -i … -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new&apos;</code>
                  </li>
                  <li>
                    <code className="font-mono text-xs">git clone {lastBootstrap.cloneSshUrl}</code>
                  </li>
                  <li>
                    Copie o script do repositório OpenSync:{" "}
                    <code className="font-mono text-xs">docs/dev/scripts/opensync-vps-git-sync.sh</code> para{" "}
                    <code className="font-mono text-xs">/root/bin/opensync-vps-git-sync.sh</code> (executável).
                  </li>
                  <li>
                    Adicione um modelo <code className="font-mono text-xs">.gitignore</code> (ver{" "}
                    <code className="font-mono text-xs">docs/dev/templates/vault-gitignore</code>).
                  </li>
                </ol>
              </div>

              <div>
                <p className="text-sm font-medium">Cron OpenClaw (exemplo)</p>
                <pre className={cn(monoBlockClass, "whitespace-pre-wrap")}>{cronSnippet}</pre>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 text-xs"
                  onClick={() => void copy(cronSnippet)}
                >
                  <Copy className="mr-1 size-3.5" />
                  Copiar comando
                </Button>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Documentação: <span className="font-mono">docs/dev/openclaw-agent-sync.md</span> e{" "}
            <span className="font-mono">docs/dev/vault-git-api.md</span>.
          </p>
        </section>
      </div>
    </div>
  );
}
