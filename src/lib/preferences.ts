export type PoolSize = "50m" | "25m" | "25y";
export type FirstDayOfWeek = 0 | 1; // 0 = Sunday, 1 = Monday
export type Theme = "light" | "dark";

export interface Profile {
  name: string;
  email: string;
  memberSince: string; // ISO date
}

export interface Preferences {
  poolSize: PoolSize;
  firstDayOfWeek: FirstDayOfWeek;
  defaultTheme: Theme;
}

const PROFILE_KEY = "swim-profile";
const PREFERENCES_KEY = "swim-preferences";

export const DEFAULT_PREFERENCES: Preferences = {
  poolSize: "50m",
  firstDayOfWeek: 1,
  defaultTheme: "dark",
};

export function getProfile(): Profile {
  if (typeof window === "undefined") {
    return { name: "", email: "", memberSince: "" };
  }
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { name: "", email: "", memberSince: "" };
    return JSON.parse(raw) as Profile;
  } catch {
    return { name: "", email: "", memberSince: "" };
  }
}

export function saveProfile(updates: Partial<Profile>): Profile {
  const current = getProfile();
  const next: Profile = {
    name: updates.name ?? current.name,
    email: updates.email ?? current.email,
    memberSince:
      updates.memberSince ??
      current.memberSince ??
      ((updates.name ?? current.name) || (updates.email ?? current.email)
        ? new Date().toISOString().slice(0, 10)
        : ""),
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  }
  return next;
}

export function getPreferences(): Preferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      poolSize: parsed.poolSize ?? DEFAULT_PREFERENCES.poolSize,
      firstDayOfWeek: parsed.firstDayOfWeek ?? DEFAULT_PREFERENCES.firstDayOfWeek,
      defaultTheme: parsed.defaultTheme ?? DEFAULT_PREFERENCES.defaultTheme,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: Partial<Preferences>): Preferences {
  const current = getPreferences();
  const next: Preferences = {
    poolSize: prefs.poolSize ?? current.poolSize,
    firstDayOfWeek: prefs.firstDayOfWeek ?? current.firstDayOfWeek,
    defaultTheme: prefs.defaultTheme ?? current.defaultTheme,
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  }
  return next;
}
