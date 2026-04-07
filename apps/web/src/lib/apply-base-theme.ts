import type { UserSettings } from "@/lib/user-settings";

export type BaseTheme = UserSettings["baseTheme"];

export function isDarkForBaseTheme(baseTheme: BaseTheme): boolean {
  if (baseTheme === "dark") return true;
  if (baseTheme === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyBaseThemeToDocument(baseTheme: BaseTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (isDarkForBaseTheme(baseTheme)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}
