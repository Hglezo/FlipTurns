import type { Locale } from "./i18n";

export type PoolSize = "LCM" | "SCM" | "SCY";
export type FirstDayOfWeek = 0 | 1;

export interface Preferences {
  poolSize: PoolSize;
  firstDayOfWeek: FirstDayOfWeek;
  defaultTheme: "light" | "dark";
  locale: Locale;
}

const PREFERENCES_KEY = "swim-preferences";

export const THEME_STORAGE_KEY = "swim-theme";

export const DEFAULT_PREFERENCES: Preferences = {
  poolSize: "LCM",
  firstDayOfWeek: 1,
  defaultTheme: "dark",
  locale: "en-US",
};

export function getPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: Partial<Preferences>): Preferences {
  const next = { ...getPreferences(), ...prefs };
  if (typeof window !== "undefined") {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  }
  return next;
}

export function getResolvedTheme(): Preferences["defaultTheme"] {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES.defaultTheme;
  const key = localStorage.getItem(THEME_STORAGE_KEY);
  if (key === "light" || key === "dark") return key;
  return getPreferences().defaultTheme;
}
