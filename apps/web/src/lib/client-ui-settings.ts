import type { UserSettings } from "@/lib/user-settings";

/** Chave do objeto JSON no `localStorage` (largura do explorador + tema). */
export const CLIENT_UI_SETTINGS_STORAGE_KEY = "opensync_client_ui_settings";

export type ClientUiSettings = {
  sidebarWidth: number;
  /** Largura do painel de backlinks (modo editor), quando aberto. */
  backlinksPanelWidth: number;
  /** Largura do painel de chat de agente (modo editor), quando aberto. */
  agentChatPanelWidth: number;
  /** Largura do painel de histórico de versões (Gitea), quando expandido. */
  versionHistoryPanelWidth: number;
  /** Largura do painel de conexão MCP (modo editor), quando aberto. */
  mcpConnectPanelWidth: number;
  /** Mesmos valores que `UserSettings["baseTheme"]` — no JSON fica como `theme`. */
  theme: UserSettings["baseTheme"];
};

const DEFAULT_SIDEBAR_WIDTH = 260;
export const EXPLORER_SIDEBAR_MIN_WIDTH = 200;
export const EXPLORER_SIDEBAR_MAX_WIDTH = 560;

const DEFAULT_BACKLINKS_PANEL_WIDTH = 260;
export const BACKLINKS_PANEL_MIN_WIDTH = 200;
export const BACKLINKS_PANEL_MAX_WIDTH = 480;

const DEFAULT_AGENT_CHAT_PANEL_WIDTH = 360;
export const AGENT_CHAT_PANEL_MIN_WIDTH = 280;
export const AGENT_CHAT_PANEL_MAX_WIDTH = 640;

const DEFAULT_VERSION_HISTORY_PANEL_WIDTH = 320;
export const VERSION_HISTORY_PANEL_MIN_WIDTH = 260;
export const VERSION_HISTORY_PANEL_MAX_WIDTH = 560;

const DEFAULT_MCP_CONNECT_PANEL_WIDTH = 300;
export const MCP_CONNECT_PANEL_MIN_WIDTH = 260;
export const MCP_CONNECT_PANEL_MAX_WIDTH = 520;

export const defaultClientUiSettings: ClientUiSettings = {
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  backlinksPanelWidth: DEFAULT_BACKLINKS_PANEL_WIDTH,
  agentChatPanelWidth: DEFAULT_AGENT_CHAT_PANEL_WIDTH,
  versionHistoryPanelWidth: DEFAULT_VERSION_HISTORY_PANEL_WIDTH,
  mcpConnectPanelWidth: DEFAULT_MCP_CONNECT_PANEL_WIDTH,
  theme: "system",
};

export function clampExplorerSidebarWidth(n: number): number {
  return Math.round(
    Math.min(EXPLORER_SIDEBAR_MAX_WIDTH, Math.max(EXPLORER_SIDEBAR_MIN_WIDTH, n)),
  );
}

export function clampBacklinksPanelWidth(n: number): number {
  return Math.round(
    Math.min(BACKLINKS_PANEL_MAX_WIDTH, Math.max(BACKLINKS_PANEL_MIN_WIDTH, n)),
  );
}

export function clampAgentChatPanelWidth(n: number): number {
  return Math.round(
    Math.min(AGENT_CHAT_PANEL_MAX_WIDTH, Math.max(AGENT_CHAT_PANEL_MIN_WIDTH, n)),
  );
}

export function clampVersionHistoryPanelWidth(n: number): number {
  return Math.round(
    Math.min(VERSION_HISTORY_PANEL_MAX_WIDTH, Math.max(VERSION_HISTORY_PANEL_MIN_WIDTH, n)),
  );
}

export function clampMcpConnectPanelWidth(n: number): number {
  return Math.round(
    Math.min(MCP_CONNECT_PANEL_MAX_WIDTH, Math.max(MCP_CONNECT_PANEL_MIN_WIDTH, n)),
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
    const backlinksRaw = o.backlinksPanelWidth;
    const backlinksPanelWidth =
      typeof backlinksRaw === "number" && Number.isFinite(backlinksRaw)
        ? clampBacklinksPanelWidth(backlinksRaw)
        : defaultClientUiSettings.backlinksPanelWidth;
    const agentChatRaw = o.agentChatPanelWidth;
    const agentChatPanelWidth =
      typeof agentChatRaw === "number" && Number.isFinite(agentChatRaw)
        ? clampAgentChatPanelWidth(agentChatRaw)
        : defaultClientUiSettings.agentChatPanelWidth;
    const versionHistoryRaw = o.versionHistoryPanelWidth;
    const versionHistoryPanelWidth =
      typeof versionHistoryRaw === "number" && Number.isFinite(versionHistoryRaw)
        ? clampVersionHistoryPanelWidth(versionHistoryRaw)
        : defaultClientUiSettings.versionHistoryPanelWidth;
    const mcpConnectRaw = o.mcpConnectPanelWidth;
    const mcpConnectPanelWidth =
      typeof mcpConnectRaw === "number" && Number.isFinite(mcpConnectRaw)
        ? clampMcpConnectPanelWidth(mcpConnectRaw)
        : defaultClientUiSettings.mcpConnectPanelWidth;
    const theme = isBaseTheme(o.theme) ? o.theme : defaultClientUiSettings.theme;
    return {
      sidebarWidth,
      backlinksPanelWidth,
      agentChatPanelWidth,
      versionHistoryPanelWidth,
      mcpConnectPanelWidth,
      theme,
    };
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
  const backlinksPanelWidth =
    typeof partial.backlinksPanelWidth === "number" && Number.isFinite(partial.backlinksPanelWidth)
      ? clampBacklinksPanelWidth(partial.backlinksPanelWidth)
      : prev.backlinksPanelWidth;
  const agentChatPanelWidth =
    typeof partial.agentChatPanelWidth === "number" && Number.isFinite(partial.agentChatPanelWidth)
      ? clampAgentChatPanelWidth(partial.agentChatPanelWidth)
      : prev.agentChatPanelWidth;
  const versionHistoryPanelWidth =
    typeof partial.versionHistoryPanelWidth === "number" &&
    Number.isFinite(partial.versionHistoryPanelWidth)
      ? clampVersionHistoryPanelWidth(partial.versionHistoryPanelWidth)
      : prev.versionHistoryPanelWidth;
  const mcpConnectPanelWidth =
    typeof partial.mcpConnectPanelWidth === "number" &&
    Number.isFinite(partial.mcpConnectPanelWidth)
      ? clampMcpConnectPanelWidth(partial.mcpConnectPanelWidth)
      : prev.mcpConnectPanelWidth;
  const theme = partial.theme !== undefined && isBaseTheme(partial.theme) ? partial.theme : prev.theme;
  saveClientUiSettings({
    sidebarWidth,
    backlinksPanelWidth,
    agentChatPanelWidth,
    versionHistoryPanelWidth,
    mcpConnectPanelWidth,
    theme,
  });
}
