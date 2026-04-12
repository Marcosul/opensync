"use client";

/**
 * Confirmação modal para apagar itens do explorador (ficheiros/pastas).
 */
export function VaultExplorerDeleteConfirmDialog({
  open,
  title,
  message,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onCancel}
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        role="alertdialog"
        aria-labelledby="vault-explorer-delete-title"
        aria-describedby="vault-explorer-delete-desc"
      >
        <h2 id="vault-explorer-delete-title" className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p
          id="vault-explorer-delete-desc"
          className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap"
        >
          {message}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-muted/80 dark:text-red-400"
            onClick={onConfirm}
          >
            Apagar
          </button>
        </div>
      </div>
    </div>
  );
}
