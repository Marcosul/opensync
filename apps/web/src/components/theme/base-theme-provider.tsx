"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { apiRequest } from "@/api/rest/generic";
import { applyBaseThemeToDocument, type BaseTheme } from "@/lib/apply-base-theme";
import type { UserSettings } from "@/lib/user-settings";

type BaseThemeContextValue = {
  syncBaseTheme: (theme: BaseTheme) => void;
};

const BaseThemeContext = createContext<BaseThemeContextValue | null>(null);

export function BaseThemeProvider({ children }: { children: ReactNode }) {
  const [baseTheme, setBaseTheme] = useState<BaseTheme | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiRequest<{ ok: boolean; settings: UserSettings }>("/api/settings");
        if (cancelled) return;
        setBaseTheme(response.settings.baseTheme);
      } catch {
        if (cancelled) return;
        setBaseTheme("system");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (baseTheme === null) return;
    applyBaseThemeToDocument(baseTheme);
  }, [baseTheme]);

  useEffect(() => {
    if (baseTheme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyBaseThemeToDocument("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [baseTheme]);

  const syncBaseTheme = useCallback((theme: BaseTheme) => {
    setBaseTheme(theme);
  }, []);

  return (
    <BaseThemeContext.Provider value={{ syncBaseTheme }}>{children}</BaseThemeContext.Provider>
  );
}

export function useSyncBaseTheme(): (theme: BaseTheme) => void {
  return useContext(BaseThemeContext)?.syncBaseTheme ?? (() => {});
}
