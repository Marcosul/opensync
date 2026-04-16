"use client";

import { useEffect, useState } from "react";

import { PublicVaultViewer } from "@/components/public-vault/public-vault-viewer";
import { apiRequest } from "@/api/rest/generic";

export function PublicVaultPageClient({ token }: { token: string }) {
  const [title, setTitle] = useState("Cofre partilhado");

  useEffect(() => {
    const t = token?.trim();
    if (!t) return;
    const ac = new AbortController();
    void (async () => {
      try {
        const meta = await apiRequest<{ name: string }>(`/api/public/vault/${encodeURIComponent(t)}/meta`, {
          signal: ac.signal,
        });
        const n = meta.name?.trim();
        if (n) {
          setTitle(n);
          document.title = `${n} · OpenSync`;
        }
      } catch {
        /* ignore */
      }
    })();
    return () => ac.abort();
  }, [token]);

  if (!token?.trim()) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        Link inválido.
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta página é apenas para consulta. Não é possível editar ou sincronizar a partir daqui.
        </p>
      </div>
      <PublicVaultViewer token={token.trim()} vaultTitle={title} />
    </div>
  );
}
