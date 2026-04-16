"use client";

type VaultDeleteConfirmDialogProps = {
  open: boolean;
  vaultName: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
};

export function VaultDeleteConfirmDialog({
  open,
  vaultName,
  onCancel,
  onConfirm,
  busy = false,
}: VaultDeleteConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={busy ? undefined : onCancel}
        disabled={busy}
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        role="alertdialog"
        aria-labelledby="vault-dash-delete-title"
        aria-describedby="vault-dash-delete-desc"
      >
        <h2 id="vault-dash-delete-title" className="text-base font-semibold text-foreground">
          Remover o cofre «{vaultName}»?
        </h2>
        <p id="vault-dash-delete-desc" className="mt-2 text-sm text-muted-foreground">
          Esta ação não pode ser anulada. O cofre deixa de estar disponível na sua conta.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-muted/80 disabled:opacity-50 dark:text-red-400"
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? "A remover…" : "Remover"}
          </button>
        </div>
      </div>
    </div>
  );
}
