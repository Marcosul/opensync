"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type WorkspaceSummary = {
  id: string;
  name: string;
  createdAt: string;
  vaultCount?: number;
  isOwner?: boolean;
};

type WorkspaceContextValue = {
  workspaces: WorkspaceSummary[];
  activeId: string | null;
  setActiveId: (id: string) => void;
  reload: () => Promise<void>;
  loaded: boolean;
};

const STORAGE_KEY = "opensync:active-workspace-id";

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { workspaces?: WorkspaceSummary[] };
      const list = data.workspaces ?? [];
      setWorkspaces(list);
      if (typeof window === "undefined") return;
      const stored = localStorage.getItem(STORAGE_KEY);
      const valid = stored && list.some((w) => w.id === stored);
      const next = valid && stored ? stored : (list[0]?.id ?? null);
      setActiveIdState(next);
      if (next) localStorage.setItem(STORAGE_KEY, next);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const value = useMemo(
    () => ({ workspaces, activeId, setActiveId, reload: load, loaded }),
    [workspaces, activeId, setActiveId, load, loaded],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspaceContext must be used within WorkspaceProvider");
  }
  return ctx;
}
