"use client";

/**
 * Entrada da página do cofre: escolhe o vault ativo (URL + localStorage + API),
 * mostra loading/vazio ou delega para `VaultOpenWorkspace`.
 */
import { Loader2 } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryStates } from "nuqs";

import { apiRequest } from "@/api/rest/generic";
import {
  clearPendingActiveVaultId,
  getHydrationSafeVaultBoot,
  peekPendingActiveVaultId,
  readActiveVaultId,
  clearActiveVaultId,
  readVaultMetas,
  vaultSnapshotKey,
  writeActiveVaultId,
  writeVaultMetas,
  type VaultMeta,
} from "@/components/app/vault-persistence";
import {
  vaultPageQueryOptions,
  vaultPageSearchParams,
} from "@/lib/vault-page-search-params";
import { isBackendSyncVaultId } from "@/lib/vault-sync-flatten";

import { VaultOpenWorkspace } from "./vault-open-workspace";

export function VaultView() {
  const ssrBoot = useMemo(() => getHydrationSafeVaultBoot(), []);
  const [vaultMetas, setVaultMetas] = useState<VaultMeta[]>(() => ssrBoot.metas);
  const [activeVaultId, setActiveVaultId] = useState(() => ssrBoot.id);
  const [serverVaultsFetched, setServerVaultsFetched] = useState(false);

  const [vaultPageQuery, setVaultPageQuery] = useQueryStates(
    vaultPageSearchParams,
    vaultPageQueryOptions,
  );

  const vaultIdFromUrl = vaultPageQuery.vaultId ?? vaultPageQuery.vault;

  const activeVaultMetaRaw = useMemo(
    () => (activeVaultId ? vaultMetas.find((m) => m.id === activeVaultId) : undefined),
    [vaultMetas, activeVaultId],
  );
  // Estabiliza a referência: só produz novo objeto quando os campos relevantes mudam.
  // Evita que cada fetch da lista de vaults dispare `scheduleGitTreeRefresh` desnecessariamente.
  const stableMetaRef = useRef(activeVaultMetaRaw);
  if (
    activeVaultMetaRaw?.id !== stableMetaRef.current?.id ||
    activeVaultMetaRaw?.remoteSync !== stableMetaRef.current?.remoteSync ||
    activeVaultMetaRaw?.kind !== stableMetaRef.current?.kind ||
    activeVaultMetaRaw?.name !== stableMetaRef.current?.name ||
    activeVaultMetaRaw?.managedByProfile !== stableMetaRef.current?.managedByProfile ||
    activeVaultMetaRaw?.deletable !== stableMetaRef.current?.deletable ||
    (activeVaultMetaRaw === undefined) !== (stableMetaRef.current === undefined)
  ) {
    stableMetaRef.current = activeVaultMetaRaw;
  }
  const activeVaultMeta = stableMetaRef.current;

  useEffect(() => {
    if (!vaultPageQuery.vault || vaultPageQuery.vaultId) return;
    void setVaultPageQuery({ vaultId: vaultPageQuery.vault, vault: null });
  }, [vaultPageQuery.vault, vaultPageQuery.vaultId, setVaultPageQuery]);

  useLayoutEffect(() => {
    const metas = readVaultMetas();
    const id = readActiveVaultId(metas);
    setVaultMetas(metas);
    setActiveVaultId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { vaults, scope } = await apiRequest<{
          vaults: VaultMeta[];
          scope: "guest" | "user";
        }>("/api/vaults/list");
        if (cancelled) return;

        if (scope === "user") {
          writeVaultMetas(vaults);
          let activeId = readActiveVaultId(vaults);
          const preferredId = peekPendingActiveVaultId();
          if (preferredId && vaults.some((m) => m.id === preferredId)) {
            activeId = preferredId;
            clearPendingActiveVaultId();
          }
          writeActiveVaultId(activeId);
          setVaultMetas(vaults);
          setActiveVaultId(activeId);
          if (vaults.length === 0) {
            clearActiveVaultId();
            setActiveVaultId("");
          }
        }
      } catch {
        /* mantem estado inicial (localStorage / migracao) */
      } finally {
        if (!cancelled) {
          setServerVaultsFetched(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!serverVaultsFetched || !vaultIdFromUrl) return;
    if (!vaultMetas.some((m) => m.id === vaultIdFromUrl)) return;
    if (vaultIdFromUrl === activeVaultId) return;
    writeActiveVaultId(vaultIdFromUrl);
    setActiveVaultId(vaultIdFromUrl);
  }, [serverVaultsFetched, vaultIdFromUrl, vaultMetas, activeVaultId]);

  useEffect(() => {
    if (!serverVaultsFetched || !activeVaultId) return;
    if (vaultPageQuery.vaultId || vaultPageQuery.vault) return;
    void setVaultPageQuery({ vaultId: activeVaultId });
  }, [
    serverVaultsFetched,
    activeVaultId,
    vaultPageQuery.vaultId,
    vaultPageQuery.vault,
    setVaultPageQuery,
  ]);

  const handleActiveVaultIdChange = useCallback(
    (id: string) => {
      setActiveVaultId(id);
      writeActiveVaultId(id);
      void setVaultPageQuery({
        vaultId: id || null,
        vault: null,
        file: null,
        folder: null,
        view: null,
      });
    },
    [setVaultPageQuery],
  );

  const removeVault = useCallback(
    async (id: string) => {
      const target = vaultMetas.find((m) => m.id === id);
      if (target?.managedByProfile) {
        try {
          await apiRequest<{ ok: boolean }>("/api/vaults/unlink-agent-vault", {
            method: "POST",
            body: { vaultId: id },
          });
        } catch {
          window.alert(
            "Nao foi possivel remover o vault ligado ao agente (servidor ou perfil). Tente de novo.",
          );
          return;
        }
      } else if (isBackendSyncVaultId(id)) {
        try {
          await apiRequest(`/api/vaults/saved?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
        } catch {
          window.alert("Nao foi possivel remover este vault no servidor.");
          return;
        }
      }
      const nextMetas = vaultMetas.filter((m) => m.id !== id);
      writeVaultMetas(nextMetas);
      setVaultMetas(nextMetas);
      try {
        localStorage.removeItem(vaultSnapshotKey(id));
      } catch {
        /* ignore */
      }

      if (id === activeVaultId) {
        const nextId = nextMetas[0]?.id ?? "";
        writeActiveVaultId(nextId);
        setActiveVaultId(nextId);
        if (!nextId) clearActiveVaultId();
        void setVaultPageQuery({
          vaultId: nextId || null,
          vault: null,
          file: null,
          folder: null,
          view: null,
        });
      }
    },
    [vaultMetas, activeVaultId, setVaultPageQuery],
  );

  const hasOpenVault = Boolean(activeVaultMeta);
  const showVaultListLoading = !serverVaultsFetched && !hasOpenVault;

  return (
    <>
      {hasOpenVault && activeVaultMeta ? (
        <VaultOpenWorkspace
          key={activeVaultId}
          vaultId={activeVaultId}
          activeVaultMeta={activeVaultMeta}
          vaultMetas={vaultMetas}
          vaultPageQuery={vaultPageQuery}
          setVaultPageQuery={setVaultPageQuery}
          onActiveVaultIdChange={handleActiveVaultIdChange}
          removeVault={removeVault}
        />
      ) : showVaultListLoading ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 py-12 text-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">A carregar os seus cofres…</p>
        </div>
      ) : (
        <div className="flex h-full overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto bg-background px-6 py-12 text-center">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Nenhum cofre</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Crie um cofre para guardar notas, ligar ao agente e sincronizar com o servidor.
            </p>
            <Link
              href="/vaults/new"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Criar primeiro cofre
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
