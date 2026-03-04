"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getPreferences,
  savePreferences,
  type Preferences,
  type FirstDayOfWeek,
} from "@/lib/preferences";

const PreferencesContext = createContext<{
  preferences: Preferences | null;
  setPreferences: (updates: Partial<Preferences>) => void;
  weekStartsOn: 0 | 1;
} | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPrefsState] = useState<Preferences | null>(() =>
    typeof window !== "undefined" ? getPreferences() : null
  );

  useEffect(() => {
    setPrefsState(getPreferences());
  }, []);

  const setPreferences = (updates: Partial<Preferences>) => {
    const next = savePreferences(updates);
    setPrefsState(next);
  };

  const weekStartsOn = (preferences?.firstDayOfWeek ?? 1) as 0 | 1;

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        setPreferences,
        weekStartsOn,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  return ctx;
}
