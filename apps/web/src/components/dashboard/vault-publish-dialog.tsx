"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useCallback, useState } from "react";

type VaultPublishDialogProps = {
  open: boolean;
  vaultName: string;
  publicUrl: string;
  onClose: () => void;
};

export function VaultPublishDialog({
  open,
  vaultName,
  publicUrl,
  onClose,
}: VaultPublishDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [publicUrl]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        role="dialog"
        aria-labelledby="vault-publish-title"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
            <Link2 className="size-5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="vault-publish-title" className="text-base font-semibold text-foreground">
              Link público: {vaultName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Qualquer pessoa com o link pode ver o conteúdo do cofre (somente leitura). Guarde o URL num local
              seguro.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
            {publicUrl}
          </p>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
