export type AgentChatCredentials = {
  gatewayUrl: string;
  token: string;
  /** ID do agente no gateway (ex: "main"). Padrão: "main". */
  agentId?: string;
};

export type AgentChatSettings = {
  credentials: AgentChatCredentials | null;
};

const AGENT_CHAT_SETTINGS_KEY = "opensync_agent_chat_settings";

const defaultSettings: AgentChatSettings = { credentials: null };

export function loadAgentChatSettings(): AgentChatSettings {
  if (typeof window === "undefined") return { ...defaultSettings };
  try {
    const raw = window.localStorage.getItem(AGENT_CHAT_SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ...defaultSettings };
    const o = parsed as Record<string, unknown>;
    if (
      o.credentials &&
      typeof o.credentials === "object" &&
      typeof (o.credentials as Record<string, unknown>).gatewayUrl === "string" &&
      typeof (o.credentials as Record<string, unknown>).token === "string"
    ) {
      const creds = o.credentials as Record<string, unknown>;
      return {
        credentials: {
          gatewayUrl: creds.gatewayUrl as string,
          token: creds.token as string,
        },
      };
    }
    return { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveAgentChatSettings(settings: AgentChatSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGENT_CHAT_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* quota / privado */
  }
}

export function saveAgentChatCredentials(credentials: AgentChatCredentials): void {
  saveAgentChatSettings({ credentials });
}

export function clearAgentChatCredentials(): void {
  saveAgentChatSettings({ credentials: null });
}
