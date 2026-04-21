import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

async function coachTeamNameFromDb(): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("team_name")
    .eq("role", "coach")
    .not("team_name", "is", null);
  if (error) return null;
  for (const row of data ?? []) {
    const n = (row.team_name ?? "").trim();
    if (n) return n;
  }
  return null;
}

export function useResolvedPdfTeamBrand(
  profileTeamName: string | null | undefined,
  role: "coach" | "swimmer" | null | undefined,
  userId: string | undefined,
  authLoading: boolean,
): string | undefined {
  const [coachName, setCoachName] = useState<string | null>(null);
  useEffect(() => {
    if (authLoading || role !== "swimmer" || !userId) {
      setCoachName(null);
      return;
    }
    let cancelled = false;
    void coachTeamNameFromDb().then((n) => {
      if (!cancelled) setCoachName(n);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, role, userId]);
  return profileTeamName?.trim() || coachName || undefined;
}
