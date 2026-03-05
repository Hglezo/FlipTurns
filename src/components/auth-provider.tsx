"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface Profile {
  id: string;
  full_name: string | null;
  role: "coach" | "swimmer";
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: "coach" | "swimmer" | null;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  signOut: async () => {},
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", userId)
      .single();

    if (data) {
      setProfile(data as Profile);
      return;
    }

    // Profile row is missing (user existed before migration, or trigger failed).
    // Try to create it from the user's auth metadata.
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const meta = authUser?.user_metadata ?? {};
    const role = (meta.role === "coach" || meta.role === "swimmer") ? meta.role : "swimmer";

    const { data: created } = await supabase
      .from("profiles")
      .upsert({ id: userId, full_name: meta.full_name ?? null, role })
      .select()
      .single();

    setProfile(created as Profile | null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, role: profile?.role ?? null, signOut, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
