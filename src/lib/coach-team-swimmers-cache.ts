import { supabase } from "@/lib/supabase";
import type { SwimmerGroup } from "@/lib/types";

export type CoachTeamSwimmerRow = {
  id: string;
  full_name: string | null;
  swimmer_group: SwimmerGroup | null;
};

let cachedRows: CoachTeamSwimmerRow[] | null = null;
let cachedForUserId: string | null = null;

const inflightByUser = new Map<string, Promise<CoachTeamSwimmerRow[]>>();

export function readCoachTeamSwimmersCache(userId: string): CoachTeamSwimmerRow[] | null {
  if (cachedForUserId !== userId || !cachedRows) return null;
  return cachedRows;
}

export function writeCoachTeamSwimmersCache(userId: string, rows: CoachTeamSwimmerRow[]) {
  cachedForUserId = userId;
  cachedRows = rows;
}

export function invalidateCoachTeamSwimmersCache() {
  cachedRows = null;
  cachedForUserId = null;
  inflightByUser.clear();
}

export function patchCoachTeamSwimmerGroup(swimmerId: string, group: SwimmerGroup | null) {
  if (!cachedRows) return;
  cachedRows = cachedRows.map((s) => (s.id === swimmerId ? { ...s, swimmer_group: group } : s));
}

export function removeCoachTeamSwimmerFromCache(swimmerId: string) {
  if (!cachedRows) return;
  cachedRows = cachedRows.filter((s) => s.id !== swimmerId);
}

/**
 * Fetches team swimmers for the signed-in coach (RLS-scoped). Deduplicates in-flight requests
 * and updates the module cache so /, /team-management, and /analytics share one list.
 */
export async function fetchCoachTeamSwimmers(userId: string): Promise<CoachTeamSwimmerRow[]> {
  const existing = inflightByUser.get(userId);
  if (existing) return existing;

  const p = (async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, swimmer_group")
        .eq("role", "swimmer")
        .order("full_name");
      if (!error && data) {
        const rows = data as CoachTeamSwimmerRow[];
        writeCoachTeamSwimmersCache(userId, rows);
        return rows;
      }
      const { data: base } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "swimmer")
        .order("full_name");
      const rows = (base ?? []).map((s) => ({ ...s, swimmer_group: null })) as CoachTeamSwimmerRow[];
      writeCoachTeamSwimmersCache(userId, rows);
      return rows;
    } finally {
      inflightByUser.delete(userId);
    }
  })();

  inflightByUser.set(userId, p);
  return p;
}
