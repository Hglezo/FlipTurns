"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export type { Profile };
export type { SwimmerGroup } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: "coach" | "swimmer" | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  signOut: async () => {},
  refreshProfile: async () => {},
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data: withGroup } = await supabase
      .from("profiles")
      .select("id, full_name, role, created_at, swimmer_group, team_name")
      .eq("id", userId)
      .single();

    if (withGroup) {
      setProfile({ ...withGroup, swimmer_group: withGroup.swimmer_group ?? null, team_name: withGroup.team_name ?? null } as Profile);
      return;
    }

    const { data: base } = await supabase
      .from("profiles")
      .select("id, full_name, role, created_at, team_name")
      .eq("id", userId)
      .single();

    if (base) {
      setProfile({ ...base, swimmer_group: null, team_name: base.team_name ?? null } as Profile);
      return;
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const meta = authUser?.user_metadata ?? {};
    const role = (meta.role === "coach" || meta.role === "swimmer") ? meta.role : "swimmer";

    const { data: created } = await supabase
      .from("profiles")
      .upsert({ id: userId, full_name: meta.full_name ?? null, role })
      .select("id, full_name, role, created_at, team_name")
      .single();

    if (created) {
      setProfile({ ...created, swimmer_group: null, team_name: created.team_name ?? null } as Profile);
    }
  }, []);

  useEffect(() => {
    void supabase.auth.startAutoRefresh();

    const applySession = (session: Session | null, finishInitialLoad: boolean) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        void fetchProfile(currentUser.id).finally(() => {
          if (finishInitialLoad) setLoading(false);
        });
      } else {
        setProfile(null);
        if (finishInitialLoad) setLoading(false);
      }
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session, true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session, false);
    });

    const resume = () => {
      void supabase.auth.startAutoRefresh();
      void supabase.auth.getSession().then(({ data: { session } }) => applySession(session, false));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") resume();
      else void supabase.auth.stopAutoRefresh();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", resume);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", resume);
      void supabase.auth.stopAutoRefresh();
    };
  }, [fetchProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role: profile?.role ?? null,
        signOut: async () => { await supabase.auth.signOut(); },
        refreshProfile: async () => { if (user) await fetchProfile(user.id); },
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
