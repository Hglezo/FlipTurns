export type PoolSize = "50m" | "25m" | "25y";
export type FirstDayOfWeek = 0 | 1;

export interface Preferences {
  poolSize: PoolSize;
  firstDayOfWeek: FirstDayOfWeek;
  defaultTheme: "light" | "dark";
}

const PREFERENCES_KEY = "swim-preferences";

export const DEFAULT_PREFERENCES: Preferences = {
  poolSize: "50m",
  firstDayOfWeek: 1,
  defaultTheme: "dark",
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
