import type { UserSettings } from "@/lib/user-settings";

/** Chave do objeto JSON no `localStorage` (largura do explorador + tema). */
export const CLIENT_UI_SETTINGS_STORAGE_KEY = "opensync_client_ui_settings";

export type ClientUiSettings = {
  sidebarWidth: number;
  /** Mesmos valores que `UserSettings["baseTheme"]` — no JSON fica como `theme`. */
  theme: UserSettings["baseTheme"];
};

const DEFAULT_SIDEBAR_WIDTH = 260;
export const EXPLORER_SIDEBAR_MIN_WIDTH = 200;
export const EXPLORER_SIDEBAR_MAX_WIDTH = 560;

export const defaultClientUiSettings: ClientUiSettings = {
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  theme: "system",
};

export function clampExplorerSidebarWidth(n: number): number {
  return Math.round(
    Math.min(EXPLORER_SIDEBAR_MAX_WIDTH, Math.max(EXPLORER_SIDEBAR_MIN_WIDTH, n)),
  );
}

function isBaseTheme(v: unknown): v is ClientUiSettings["theme"] {
  return v === "system" || v === "light" || v === "dark";
}

export function loadClientUiSettings(): ClientUiSettings {
  if (typeof window === "undefined") {
    return { ...defaultClientUiSettings };
  }
  try {
    const raw = window.localStorage.getItem(CLIENT_UI_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...defaultClientUiSettings };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ...defaultClientUiSettings };
    const o = parsed as Record<string, unknown>;
    const sidebarRaw = o.sidebarWidth;
    const sidebarWidth =
      typeof sidebarRaw === "number" && Number.isFinite(sidebarRaw)
        ? clampExplorerSidebarWidth(sidebarRaw)
        : defaultClientUiSettings.sidebarWidth;
    const theme = isBaseTheme(o.theme) ? o.theme : defaultClientUiSettings.theme;
    return { sidebarWidth, theme };
  } catch {
    return { ...defaultClientUiSettings };
  }
}

export function saveClientUiSettings(next: ClientUiSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLIENT_UI_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / privado */
  }
}

export function patchClientUiSettings(partial: Partial<ClientUiSettings>): void {
  const prev = loadClientUiSettings();
  const sidebarWidth =
    typeof partial.sidebarWidth === "number" && Number.isFinite(partial.sidebarWidth)
      ? clampExplorerSidebarWidth(partial.sidebarWidth)
      : prev.sidebarWidth;
  const theme = partial.theme !== undefined && isBaseTheme(partial.theme) ? partial.theme : prev.theme;
  saveClientUiSettings({ sidebarWidth, theme });
}
