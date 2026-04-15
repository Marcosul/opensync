"use client";

import { Loader2, Mail, Trash2, UserMinus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type MemberRow = {
  id: string;
  role: string;
  email: string;
  profileId: string;
  createdAt: string;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};

const roles = ["ADMIN", "EDITOR", "VIEWER"] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  workspaceName: string;
  onChanged: () => void;
};

export function WorkspaceMembersDialog({
  open,
  onClose,
  workspaceId,
  workspaceName,
  onChanged,
}: Props) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>("EDITOR");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId || !open) return;
    setLoading(true);
    setError(null);
    try {
      const [mRes, iRes] = await Promise.all([
        fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`, { cache: "no-store" }),
        fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`, { cache: "no-store" }),
      ]);
      if (mRes.ok) {
        const m = (await mRes.json()) as { members?: MemberRow[] };
        setMembers(m.members ?? []);
      }
      if (iRes.ok) {
        const i = (await iRes.json()) as { invites?: InviteRow[] };
        setInvites(i.invites ?? []);
      }
    } catch {
      setError("Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, [open, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendInvite = async () => {
    if (!workspaceId || !email.trim() || inviteBusy) return;
    setInviteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Falha ao convidar");
      }
      setEmail("");
      onChanged();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setInviteBusy(false);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!workspaceId) return;
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      onChanged();
      await load();
    }
  };

  const cancelInvite = async (inviteId: string) => {
    if (!workspaceId) return;
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      onChanged();
      await load();
    }
  };

  const resendInvite = async (inviteId: string) => {
    if (!workspaceId) return;
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}/resend`,
      { method: "POST" },
    );
    if (!res.ok) {
      const t = await res.text();
      setError(t || "Falha ao reenviar");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/45 p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(560px,90vh)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        role="dialog"
        aria-labelledby="ws-members-title"
      >
        <div className="border-b border-border px-4 py-3">
          <h2 id="ws-members-title" className="text-sm font-semibold text-foreground">
            Membros — {workspaceName || "workspace"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Convide por e-mail. Papéis: Admin (gestão), Editor (sync), Viewer (leitura).
          </p>
        </div>

        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="text-xs text-muted-foreground" htmlFor="inv-email">
              E-mail
            </label>
            <input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              placeholder="colega@empresa.com"
            />
          </div>
          <div className="w-full sm:w-32">
            <label className="text-xs text-muted-foreground" htmlFor="inv-role">
              Papel
            </label>
            <select
              id="inv-role"
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof roles)[number])}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={inviteBusy || !email.trim()}
            onClick={() => void sendInvite()}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {inviteBusy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Convidar
          </button>
        </div>

        {error ? <p className="px-4 text-sm text-destructive">{error}</p> : null}

        <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Membros</p>
              <ul className="space-y-1">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-transparent px-2 py-2 hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{m.email}</p>
                      <p className="text-xs text-muted-foreground">{m.role}</p>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                        "hover:bg-destructive/10 hover:text-destructive"
                      )}
                      title="Remover"
                      onClick={() => void removeMember(m.id)}
                    >
                      <UserMinus className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>

              <p className="mb-2 mt-4 px-1 text-xs font-medium text-muted-foreground">
                Convites pendentes
              </p>
              <ul className="space-y-1">
                {invites.length === 0 ? (
                  <li className="px-2 py-2 text-sm text-muted-foreground">Nenhum convite pendente.</li>
                ) : (
                  invites.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{inv.email}</p>
                        <p className="text-xs text-muted-foreground">{inv.role}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                          onClick={() => void resendInvite(inv.id)}
                        >
                          Reenviar
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                          title="Cancelar"
                          onClick={() => void cancelInvite(inv.id)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            className="w-full rounded-md py-2 text-sm text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
