export type SwimmerGroup = "Sprint" | "Middle distance" | "Distance";
export type ViewMode = "day" | "week" | "month";

export const SWIMMER_GROUPS: SwimmerGroup[] = ["Sprint", "Middle distance", "Distance"];
export const ALL_GROUPS_ID = "__all_groups__" as const;
export const WORKOUT_CATEGORIES = ["", "Recovery", "Aerobic", "Pace", "Speed", "Tech suit"] as const;
export const SESSION_OPTIONS = ["", "AM", "PM"] as const;

export type PoolSize = "LCM" | "SCM" | "SCY";
export const POOL_SIZE_OPTIONS: { value: PoolSize; label: string }[] = [
  { value: "LCM", label: "LCM (50m)" },
  { value: "SCM", label: "SCM (25m)" },
  { value: "SCY", label: "SCY (25yd)" },
];

export interface Workout {
  id: string;
  date: string;
  content: string;
  session?: string | null;
  workout_category?: string | null;
  pool_size?: PoolSize | null;
  assigned_to?: string | null;
  assigned_to_group?: SwimmerGroup | null;
  assignee_ids?: string[];
}

export interface SwimmerProfile {
  id: string;
  full_name: string | null;
  swimmer_group?: SwimmerGroup | null;
}

export interface Profile {
  id: string;
  full_name: string | null;
  role: "coach" | "swimmer";
  created_at: string;
  swimmer_group: SwimmerGroup | null;
}

export function normDate(d: string | undefined): string | undefined {
  return d && typeof d === "string" ? d.slice(0, 10) : d;
}

export function getTimeframe(w: { session?: string | null }): string {
  return w.session?.trim() || "Anytime";
}
