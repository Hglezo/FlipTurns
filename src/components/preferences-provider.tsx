"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getPreferences, savePreferences, type Preferences } from "@/lib/preferences";

type Theme = "light" | "dark";

const THEME_KEY = "swim-theme";

const PreferencesContext = createContext<{
  preferences: Preferences | null;
  setPreferences: (updates: Partial<Preferences>) => void;
  weekStartsOn: 0 | 1;
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPrefsState] = useState<Preferences | null>(() =>
    typeof window !== "undefined" ? getPreferences() : null
  );
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setPrefsState(getPreferences());
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    const resolved = stored === "light" || stored === "dark" ? stored : "dark";
    setThemeState(resolved);
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, []);

  const setPreferences = (updates: Partial<Preferences>) => {
    const next = savePreferences(updates);
    setPrefsState(next);
  };

  const setTheme = (next: Theme) => {
    setThemeState(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(THEME_KEY, next);
  };

  const weekStartsOn = (preferences?.firstDayOfWeek ?? 1) as 0 | 1;

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
