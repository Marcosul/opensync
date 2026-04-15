"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type PendingInvite = {
  id: string;
  workspace: { id: string; name: string };
};

export function PendingInvitesBanner() {
  const router = useRouter();
  const [invites, setInvites] = useState<PendingInvite[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/workspace-invites/pending", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { invites?: PendingInvite[] };
    setInvites(data.invites ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async (inviteId: string) => {
    const res = await fetch("/api/workspace-invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId }),
    });
    if (res.ok) {
      await load();
      router.refresh();
    }
  };

  if (invites.length === 0) return null;

  return (
    <div
      className="mb-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
      role="status"
    >
      <p className="font-medium text-amber-950 dark:text-amber-100">Convites pendentes</p>
      <ul className="mt-2 space-y-2">
        {invites.map((inv) => (
          <li
            key={inv.id}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-muted-foreground">
              Entrar em <span className="font-medium text-foreground">{inv.workspace.name}</span>
            </span>
            <button
              type="button"
              className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => void accept(inv.id)}
            >
              Aceitar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
