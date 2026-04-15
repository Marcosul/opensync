"use client";

import { Menu } from "@base-ui/react/menu";
import { Building2, Check, ChevronsUpDown, Loader2, Plus, Users } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";

import { WorkspaceMembersDialog } from "@/components/app/workspace-members-dialog";
import { useWorkspaceContext } from "@/components/app/workspace-context";
import { cn } from "@/lib/utils";

const menuItemClass = cn(
  "flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
  "text-foreground data-highlighted:bg-muted"
);

export function WorkspaceSwitcher() {
  const { workspaces, activeId, setActiveId, reload, loaded } = useWorkspaceContext();
  const [createOpen, setCreateOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = workspaces.find((w) => w.id === activeId);

  const onCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Falha ao criar");
      }
      const data = (await res.json()) as { workspace?: { id: string } };
      if (data.workspace?.id) {
        setActiveId(data.workspace.id);
      }
      setNewName("");
      setCreateOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }, [busy, newName, reload, setActiveId]);

  return (
    <>
      <div className="flex min-w-0 flex-col gap-0.5 border-b border-sidebar-border px-1.5 py-1.5">
        <span className="px-1 text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/45">
          Workspace
        </span>
        <Menu.Root>
          <Menu.Trigger
            className={cn(
              "flex w-full min-w-0 items-center gap-1.5 rounded-md bg-sidebar-accent/40 px-2 py-1.5 text-left text-xs font-medium text-sidebar-foreground",
              "outline-none hover:bg-sidebar-accent/70 data-popup-open:bg-sidebar-accent/70"
            )}
            disabled={!loaded}
          >
            {!loaded ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin opacity-70" aria-hidden />
            ) : (
              <Building2 className="size-3.5 shrink-0 opacity-80" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate">
              {active?.name ?? "Selecionar…"}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-[220] outline-none" side="bottom" align="start" sideOffset={4}>
              <Menu.Popup
                className={cn(
                  "min-w-[220px] max-w-[min(100vw-2rem,280px)] origin-[var(--transform-origin)] rounded-lg border border-border bg-card py-1 text-foreground shadow-lg",
                  "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
                )}
              >
                {workspaces.map((w) => (
                  <Menu.Item
                    key={w.id}
                    className={cn(menuItemClass, "justify-between pr-2")}
                    onClick={() => setActiveId(w.id)}
                  >
                    <span className="min-w-0 truncate">{w.name}</span>
                    {w.id === activeId ? (
                      <Check className="size-3.5 shrink-0 opacity-80" aria-hidden />
                    ) : (
                      <span className="size-3.5 shrink-0" aria-hidden />
                    )}
                  </Menu.Item>
                ))}
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.Item className={menuItemClass} onClick={() => setCreateOpen(true)}>
                  <Plus className="size-3.5 text-muted-foreground" aria-hidden />
                  Novo workspace…
                </Menu.Item>
                <Menu.Item
                  className={menuItemClass}
                  disabled={!activeId}
                  onClick={() => activeId && setMembersOpen(true)}
                >
                  <Users className="size-3.5 text-muted-foreground" aria-hidden />
                  Membros e convites…
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {createOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4" role="presentation">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Fechar"
                onClick={() => !busy && setCreateOpen(false)}
              />
              <div
                className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
                role="dialog"
                aria-labelledby="ws-create-title"
              >
                <h2 id="ws-create-title" className="text-base font-semibold text-foreground">
                  Novo workspace
                </h2>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome"
                  className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  disabled={busy}
                />
                {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                    onClick={() => !busy && setCreateOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={busy || !newName.trim()}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    onClick={() => void onCreate()}
                  >
                    {busy ? "…" : "Criar"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <WorkspaceMembersDialog
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        workspaceId={activeId}
        workspaceName={active?.name ?? ""}
        onChanged={() => void reload()}
      />
    </>
  );
}
