"use client";

import { FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchPublicVaultGitBlob, fetchPublicVaultGitTree } from "@/lib/vault-git-client";
import { cn } from "@/lib/utils";

type PublicVaultViewerProps = {
  token: string;
  vaultTitle: string;
};

export function PublicVaultViewer({ token, vaultTitle }: PublicVaultViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commitHash, setCommitHash] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [blobError, setBlobError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await fetchPublicVaultGitTree(token, { signal: ac.signal });
        if (ac.signal.aborted) return;
        const sorted = [...data.entries.map((e) => e.path)].sort((a, b) => a.localeCompare(b));
        setCommitHash(data.commitHash);
        setPaths(sorted);
      } catch {
        if (ac.signal.aborted) return;
        setError("Não foi possível carregar o cofre. O link pode estar inválido ou expirado.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [token]);

  const loadFile = useCallback(
    async (path: string) => {
      setSelectedPath(path);
      setFileLoading(true);
      setBlobError(null);
      setFileContent(null);
      try {
        const blob = await fetchPublicVaultGitBlob(token, path);
        setFileContent(blob.content ?? "");
      } catch {
        setBlobError("Não foi possível abrir este ficheiro.");
      } finally {
        setFileLoading(false);
      }
    },
    [token],
  );

  const treeRows = useMemo(() => paths, [paths]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">A carregar cofre…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card px-6 py-10 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <aside className="flex max-h-[min(50vh,420px)] min-h-0 w-full shrink-0 flex-col rounded-xl border border-border bg-card lg:max-h-none lg:w-[min(100%,360px)]">
        <div className="border-b border-border px-3 py-2">
          <p className="truncate text-xs font-medium text-muted-foreground">{vaultTitle}</p>
          {commitHash ? (
            <p className="truncate font-mono text-[10px] text-muted-foreground/80" title={commitHash}>
              {commitHash.slice(0, 12)}…
            </p>
          ) : null}
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Ficheiros do cofre">
          {treeRows.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Este cofre ainda não tem ficheiros.</p>
          ) : null}
          <ul className="space-y-0.5">
            {treeRows.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => void loadFile(p)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    selectedPath === p ? "bg-muted font-medium text-foreground" : "text-foreground/90",
                  )}
                >
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate font-mono text-xs">{p}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <section className="flex min-h-[280px] min-w-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Visualização pública · só leitura
          </p>
          {selectedPath ? (
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{selectedPath}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Selecione um ficheiro na lista.</p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {fileLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              A abrir…
            </div>
          ) : blobError ? (
            <p className="text-sm text-destructive">{blobError}</p>
          ) : fileContent !== null ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {fileContent}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">Escolha um ficheiro para ver o conteúdo.</p>
          )}
        </div>
      </section>
    </div>
  );
}
