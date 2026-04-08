"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

const NEW_VAULT_HREF = "/vaults/new";

export function AddVaultCard() {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="Adicionar vault"
      onClick={() => router.push(NEW_VAULT_HREF)}
      className="relative z-10 flex h-full min-h-[160px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent p-8 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="pointer-events-none flex size-9 items-center justify-center rounded-lg border border-current/30">
        <Plus className="size-4" />
      </div>
      <span className="pointer-events-none text-sm font-medium">Adicionar vault</span>
    </button>
  );
}
