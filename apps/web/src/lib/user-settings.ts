export type UserSettings = {
  autoUpdate: boolean;
  language: "pt-BR" | "en-US" | "es-ES";
  defaultTabView: "split" | "preview" | "editing";
  comfortableLineLength: boolean;
  showEditorStatus: boolean;
  defaultOpenFile: "last-opened" | "daily-note" | "home";
  wikilinksEnabled: boolean;
  confirmDelete: boolean;
  baseTheme: "system" | "light" | "dark";
  showTabTitleBar: boolean;
};

export const META_SETTINGS_KEY = "opensync_user_settings";

export const defaultUserSettings: UserSettings = {
  autoUpdate: true,
  language: "pt-BR",
  defaultTabView: "split",
  comfortableLineLength: true,
  showEditorStatus: true,
  defaultOpenFile: "last-opened",
  wikilinksEnabled: true,
  confirmDelete: true,
  baseTheme: "system",
  showTabTitleBar: true,
};

export function sanitizeUserSettings(raw: unknown): UserSettings {
  if (!raw || typeof raw !== "object") {
    return { ...defaultUserSettings };
  }

  const source = raw as Record<string, unknown>;

  return {
    autoUpdate: asBoolean(source.autoUpdate, defaultUserSettings.autoUpdate),
    language: asUnion(source.language, ["pt-BR", "en-US", "es-ES"], defaultUserSettings.language),
    defaultTabView: asUnion(
      source.defaultTabView,
      ["split", "preview", "editing"],
      defaultUserSettings.defaultTabView,
    ),
    comfortableLineLength: asBoolean(
      source.comfortableLineLength,
      defaultUserSettings.comfortableLineLength,
    ),
    showEditorStatus: asBoolean(source.showEditorStatus, defaultUserSettings.showEditorStatus),
    defaultOpenFile: asUnion(
      source.defaultOpenFile,
      ["last-opened", "daily-note", "home"],
      defaultUserSettings.defaultOpenFile,
    ),
    wikilinksEnabled: asBoolean(source.wikilinksEnabled, defaultUserSettings.wikilinksEnabled),
    confirmDelete: asBoolean(source.confirmDelete, defaultUserSettings.confirmDelete),
    baseTheme: asUnion(source.baseTheme, ["system", "light", "dark"], defaultUserSettings.baseTheme),
    showTabTitleBar: asBoolean(source.showTabTitleBar, defaultUserSettings.showTabTitleBar),
  };
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asUnion<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}
