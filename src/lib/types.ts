export type SwimmerGroup = "Sprint" | "Middle distance" | "Distance";
/** Multi-assignee workouts not tied to a training group (stored in `assigned_to_group`). */
export const PERSONAL_ASSIGNMENT = "Personal" as const;
export type AssignedToGroupValue = SwimmerGroup | typeof PERSONAL_ASSIGNMENT;
export type ViewMode = "day" | "week" | "month";

export const SWIMMER_GROUPS: SwimmerGroup[] = ["Sprint", "Middle distance", "Distance"];

export function isTrainingSwimmerGroup(g: AssignedToGroupValue | null | undefined): g is SwimmerGroup {
  return g != null && g !== PERSONAL_ASSIGNMENT && SWIMMER_GROUPS.includes(g as SwimmerGroup);
}
export const ALL_GROUPS_ID = "__all_groups__" as const;
export const ALL_ID = "__all__" as const;
export const ONLY_GROUPS_ID = "__only_groups__" as const;
export const WORKOUT_CATEGORIES = ["", "Recovery", "Aerobic", "Pace", "Speed", "Tech suit"] as const;
export const SESSION_OPTIONS = ["", "AM", "PM"] as const;

export type PoolSize = "LCM" | "SCM" | "SCY";
export const POOL_SIZE_OPTIONS: { value: PoolSize; label: string }[] = [
  { value: "LCM", label: "LCM" },
  { value: "SCM", label: "SCM" },
  { value: "SCY", label: "SCY" },
];

export interface Workout {
  id: string;
  date: string;
  content: string;
  session?: string | null;
  workout_category?: string | null;
  pool_size?: PoolSize | null;
  assigned_to?: string | null;
  assigned_to_group?: AssignedToGroupValue | null;
  assignee_ids?: string[];
  updated_at?: string | null;
  created_by?: string | null;
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
  team_name?: string | null;
}

export function normDate(d: string | undefined): string | undefined {
  return d && typeof d === "string" ? d.slice(0, 10) : d;
}

export function getTimeframe(w: { session?: string | null }): string {
  return w.session?.trim() || "Anytime";
}
