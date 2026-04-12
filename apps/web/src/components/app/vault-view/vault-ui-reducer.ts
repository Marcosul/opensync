/**
 * Reducer do estado de UI do cofre (tabs, modo editor/grafo).
 * `mergeVaultUiAfterGitTreeRefresh` mantém separadores válidos após sync da árvore remota.
 */
import { collectDocIdsFromTree } from "@/components/app/vault-tree-ops";
import type { TreeEntry } from "@/components/marketing/openclaw-workspace-mock";
import type { VaultUiState, ViewMode } from "@/components/app/vault-persistence";

export type VaultUiAction =
  | { type: "open"; id: string }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "closeMany"; ids: string[] }
  | { type: "replaceDoc"; from: string; to: string }
  | { type: "remapDocIds"; map: Record<string, string> }
  | { type: "reset"; state: VaultUiState }
  | { type: "showGraph" };

export function mergeVaultUiAfterGitTreeRefresh(
  prev: VaultUiState,
  fallback: VaultUiState,
  tree: TreeEntry,
): VaultUiState {
  const children = tree.type === "dir" ? tree.children : [];
  const allowed = new Set(collectDocIdsFromTree(children));

  let openTabs = prev.openTabs.filter((id) => allowed.has(id));
  let activeTabId = prev.activeTabId;

  if (!allowed.has(activeTabId)) {
    activeTabId = openTabs[0] ?? fallback.activeTabId;
  }
  if (!allowed.has(activeTabId)) {
    return fallback;
  }
  if (!openTabs.includes(activeTabId)) {
    openTabs = [...openTabs, activeTabId];
  }

  const viewMode: ViewMode =
    openTabs.length === 0 ? "graph" : prev.viewMode === "graph" ? "graph" : "editor";

  if (viewMode === "editor" && !activeTabId) {
    return fallback;
  }

  return { viewMode, openTabs, activeTabId };
}

export function vaultUiReducer(state: VaultUiState, action: VaultUiAction): VaultUiState {
  switch (action.type) {
    case "open": {
      if (
        state.activeTabId === action.id &&
        state.viewMode === "editor" &&
        state.openTabs.includes(action.id)
      ) {
        return state;
      }
      const openTabs = state.openTabs.includes(action.id)
        ? state.openTabs
        : [...state.openTabs, action.id];
      return {
        ...state,
        viewMode: "editor",
        openTabs,
        activeTabId: action.id,
      };
    }
    case "activate": {
      if (!state.openTabs.includes(action.id)) return state;
      return { ...state, viewMode: "editor", activeTabId: action.id };
    }
    case "close": {
      const idx = state.openTabs.indexOf(action.id);
      if (idx === -1) return state;
      const openTabs = state.openTabs.filter((t) => t !== action.id);
      let activeTabId = state.activeTabId;
      if (activeTabId === action.id) {
        activeTabId =
          openTabs.length === 0 ? "" : (openTabs[Math.max(0, idx - 1)] ?? openTabs[0]);
      }
      const viewMode: ViewMode = openTabs.length === 0 ? "graph" : state.viewMode;
      return { ...state, openTabs, activeTabId, viewMode };
    }
    case "closeMany": {
      const drop = new Set(action.ids);
      const openTabs = state.openTabs.filter((t) => !drop.has(t));
      let activeTabId = state.activeTabId;
      if (drop.has(activeTabId)) {
        const idx = state.openTabs.indexOf(activeTabId);
        activeTabId =
          openTabs.length === 0
            ? ""
            : (openTabs[Math.max(0, idx - 1)] ?? openTabs[0] ?? "");
      }
      const viewMode: ViewMode = openTabs.length === 0 ? "graph" : state.viewMode;
      return { ...state, openTabs, activeTabId, viewMode };
    }
    case "replaceDoc": {
      const openTabs = [...new Set(state.openTabs.map((t) => (t === action.from ? action.to : t)))];
      const activeTabId = state.activeTabId === action.from ? action.to : state.activeTabId;
      return { ...state, openTabs, activeTabId };
    }
    case "remapDocIds": {
      const map = action.map;
      if (Object.keys(map).length === 0) return state;
      const openTabs = [...new Set(state.openTabs.map((t) => map[t] ?? t))];
      const activeTabId = map[state.activeTabId] ?? state.activeTabId;
      const safeActive = openTabs.includes(activeTabId) ? activeTabId : (openTabs[0] ?? "");
      return { ...state, openTabs, activeTabId: safeActive };
    }
    case "reset": {
      const s = action.state;
      if (
        state.viewMode === s.viewMode &&
        state.activeTabId === s.activeTabId &&
        state.openTabs.length === s.openTabs.length &&
        state.openTabs.every((t, i) => t === s.openTabs[i])
      ) {
        return state;
      }
      return s;
    }
    case "showGraph":
      return { ...state, viewMode: "graph" };
    default:
      return state;
  }
}
