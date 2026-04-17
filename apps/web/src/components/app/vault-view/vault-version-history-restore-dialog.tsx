"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type VaultRestoreCommitResult =
  | { ok: true; short: string; importedFiles: number }
  | { ok: false; message: string };

type Phase = "confirm" | "busy" | "success" | "error";

/**
 * Confirmação e feedback de progresso ao restaurar o vault a partir de um commit Gitea.
 */
export function VaultVersionHistoryRestoreDialog({
  commitSha,
  onCommitShaChange,
  restore,
  onRestoreSuccessDismiss,
}: {
  commitSha: string | null;
  onCommitShaChange: (sha: string | null) => void;
  restore: (sha: string) => Promise<VaultRestoreCommitResult>;
  /** Chamado após o utilizador fechar o estado de sucesso (fecha o painel de versões no pai). */
  onRestoreSuccessDismiss: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [errorMessage, setErrorMessage] = useState("");
  const [successImported, setSuccessImported] = useState(0);
  const [successShort, setSuccessShort] = useState("");

  useEffect(() => {
    if (commitSha) {
      setPhase("confirm");
      setErrorMessage("");
    }
  }, [commitSha]);

  const closeAll = useCallback(() => {
    onCommitShaChange(null);
  }, [onCommitShaChange]);

  const handleConfirm = useCallback(async () => {
    if (!commitSha) return;
    setPhase("busy");
    const result = await restore(commitSha);
    if (result.ok) {
      setSuccessShort(result.short);
      setSuccessImported(result.importedFiles);
      setPhase("success");
    } else {
      setErrorMessage(result.message);
      setPhase("error");
    }
  }, [commitSha, restore]);

  const handleDismissSuccess = useCallback(() => {
    closeAll();
    onRestoreSuccessDismiss();
  }, [closeAll, onRestoreSuccessDismiss]);

  if (!commitSha) return null;

  const short = commitSha.slice(0, 12);

  return (
    <div
      className="fixed inset-0 z-[340] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        disabled={phase === "busy"}
        onClick={() => {
          if (phase !== "busy") closeAll();
        }}
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        role="alertdialog"
        aria-labelledby="vault-restore-title"
        aria-describedby="vault-restore-desc"
        aria-busy={phase === "busy"}
      >
        {phase === "confirm" ? (
          <>
            <h2 id="vault-restore-title" className="text-base font-semibold text-foreground">
              Reverter para esta versão?
            </h2>
            <p id="vault-restore-desc" className="mt-2 text-sm text-muted-foreground">
              O vault será restaurado para o commit{" "}
              <span className="font-mono text-foreground">{short}</span>. O estado atual no servidor
              será substituído pelo conteúdo deste commit.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={closeAll}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => void handleConfirm()}
              >
                Reverter versão
              </button>
            </div>
          </>
        ) : null}

        {phase === "busy" ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
            <div className="text-center">
              <p id="vault-restore-title" className="text-base font-semibold text-foreground">
                A restaurar…
              </p>
              <p id="vault-restore-desc" className="mt-1 text-sm text-muted-foreground">
                Commit <span className="font-mono">{short}</span>. Aguarde.
              </p>
            </div>
          </div>
        ) : null}

        {phase === "success" ? (
          <>
            <h2 id="vault-restore-title" className="text-base font-semibold text-foreground">
              Restauração concluída
            </h2>
            <p id="vault-restore-desc" className="mt-2 text-sm text-muted-foreground">
              O vault foi atualizado a partir de{" "}
              <span className="font-mono text-foreground">{successShort}</span>.{" "}
              {successImported === 1
                ? "1 ficheiro restaurado."
                : `${successImported} ficheiros restaurados.`}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={handleDismissSuccess}
              >
                Fechar
              </button>
            </div>
          </>
        ) : null}

        {phase === "error" ? (
          <>
            <h2 id="vault-restore-title" className="text-base font-semibold text-destructive">
              Falha ao restaurar
            </h2>
            <p id="vault-restore-desc" className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
              {errorMessage}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="rounded-md px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                onClick={closeAll}
              >
                Fechar
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
