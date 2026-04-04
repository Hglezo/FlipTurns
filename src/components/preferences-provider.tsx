"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { DEFAULT_PREFERENCES, getPreferences, getResolvedTheme, savePreferences, THEME_STORAGE_KEY, type Preferences } from "@/lib/preferences";

type Theme = "light" | "dark";

const PreferencesContext = createContext<{
  preferences: Preferences;
  setPreferences: (updates: Partial<Preferences>) => void;
  weekStartsOn: 0 | 1;
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPrefsState] = useState<Preferences>(() => DEFAULT_PREFERENCES);
  const [theme, setThemeState] = useState<Theme>(() => DEFAULT_PREFERENCES.defaultTheme);

  useLayoutEffect(() => {
    const p = getPreferences();
    const t = getResolvedTheme();
    setPrefsState(p);
    setThemeState(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw !== "light" && raw !== "dark") localStorage.setItem(THEME_STORAGE_KEY, t);
  }, []);

  const setPreferences = (updates: Partial<Preferences>) => {
    const next = savePreferences(updates);
    setPrefsState(next);
    if (updates.defaultTheme === "light" || updates.defaultTheme === "dark") {
      setThemeState(updates.defaultTheme);
      localStorage.setItem(THEME_STORAGE_KEY, updates.defaultTheme);
      document.documentElement.classList.toggle("dark", updates.defaultTheme === "dark");
    }
  };

  const setTheme = (next: Theme) => {
    setThemeState(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setPrefsState(savePreferences({ defaultTheme: next }));
  };

  const weekStartsOn = (preferences.firstDayOfWeek ?? 1) as 0 | 1;

  return (
    <PreferencesContext.Provider value={{ preferences, setPreferences, weekStartsOn, theme, setTheme }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}

export function useTheme() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("useTheme must be used within PreferencesProvider");
  return { theme: ctx.theme, setTheme: ctx.setTheme };
}
