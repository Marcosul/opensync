import { useCallback, useEffect, useState } from "react";
import { LogOut, Plus, RefreshCcw, Folder } from "lucide-react";

import type { UserVault } from "@opensync/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "@opensync/ui";

import { ipc, type AuthSession, type DesktopInfo } from "../lib/ipc";

export interface DashboardViewProps {
  session: AuthSession;
  info: DesktopInfo | null;
  onLogout: () => void | Promise<void>;
}

export function DashboardView({ session, info, onLogout }: DashboardViewProps) {
  const [vaults, setVaults] = useState<UserVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newVaultName, setNewVaultName] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ipc.listVaults();
      setVaults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    if (!newVaultName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await ipc.createVault(newVaultName.trim());
      setVaults((prev) => [created, ...prev]);
      setNewVaultName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Os teus vaults
          </h1>
          <p className="text-sm text-muted-foreground">
            Sessão: <span className="font-medium">{session.email}</span>
            {info ? (
              <span className="ml-2 text-xs">
                · v{info.version} · {info.platform}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCcw className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
            <LogOut />
            Sair
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Criar novo vault</CardTitle>
          <CardDescription>
            Os vaults sincronizam-se entre desktop, web e mobile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={newVaultName}
              onChange={(e) => setNewVaultName(e.target.value)}
              placeholder="ex.: notas-pessoais"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
            />
            <Button
              onClick={() => void handleCreate()}
              disabled={!newVaultName.trim() || creating}
            >
              <Plus />
              {creating ? "A criar…" : "Criar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && vaults.length === 0 ? (
          <p className="text-sm text-muted-foreground col-span-full">
            A carregar vaults…
          </p>
        ) : vaults.length === 0 ? (
          <p className="text-sm text-muted-foreground col-span-full">
            Ainda não tens vaults. Cria um acima para começar.
          </p>
        ) : (
          vaults.map((vault) => (
            <Card key={vault.id} className="transition hover:border-primary/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder className="size-4 text-primary" />
                    <CardTitle className="text-sm">{vault.name}</CardTitle>
                  </div>
                  <Badge variant="outline">{vault.workspaceName}</Badge>
                </div>
                {vault.description ? (
                  <CardDescription>{vault.description}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {vault.createdAt
                  ? `Criado a ${new Date(vault.createdAt).toLocaleDateString()}`
                  : "Sem data de criação"}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
