import { supabase } from "./supabase";
import type { Workout, SwimmerProfile, SwimmerGroup } from "./types";
import { SWIMMER_GROUPS, ALL_ID, ONLY_GROUPS_ID, PERSONAL_ASSIGNMENT, isTrainingSwimmerGroup, normDate, getTimeframe } from "./types";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

export async function fetchAssigneesForWorkouts(workoutIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (workoutIds.length === 0) return map;
  const { data } = await supabase.from("workout_assignees").select("workout_id, user_id").in("workout_id", workoutIds);
  for (const row of data ?? []) {
    const list = map.get(row.workout_id) ?? [];
    list.push(row.user_id);
    map.set(row.workout_id, list);
  }
  return map;
}

export function mergeAssigneesIntoWorkouts(workouts: Workout[], assigneesByWorkout: Map<string, string[]>, swimmers: SwimmerProfile[]): Workout[] {
  return workouts.map((w) => {
    if (!w.id) return w;
    const ids = assigneesByWorkout.get(w.id);
    if (w.assigned_to_group) {
      const assigneeIds =
        ids !== undefined
          ? ids
          : w.assigned_to_group === PERSONAL_ASSIGNMENT
            ? (w.assignee_ids ?? [])
            : swimmers.filter((s) => s.swimmer_group === w.assigned_to_group).map((s) => s.id);
      return { ...w, assignee_ids: assigneeIds };
    }
    if (ids !== undefined) return ids.length > 0 ? { ...w, assignee_ids: ids } : { ...w, assignee_ids: [] };
    return w;
  });
}

export async function loadAndMergeWorkouts(rows: Workout[], swimmers: SwimmerProfile[]): Promise<Workout[]> {
  const workoutIds = rows.filter((w) => w.id).map((w) => w.id!);
  if (workoutIds.length === 0) return rows;
  const assigneesMap = await fetchAssigneesForWorkouts(workoutIds);
  return mergeAssigneesIntoWorkouts(rows, assigneesMap, swimmers);
}

export function filterWorkoutsForSwimmer(workouts: Workout[], swimmerId: string, swimmerGroup: SwimmerGroup | null): Workout[] {
  if (swimmerId === "__all__") return workouts;
  if (swimmerId === "__all_groups__" || swimmerId === "__only_groups__") {
    return workouts.filter((w) => isTrainingSwimmerGroup(w.assigned_to_group));
  }
  const byDate = new Map<string, Workout[]>();
  for (const w of workouts) {
    const d = normDate(w.date) ?? w.date;
    const list = byDate.get(d) ?? [];
    list.push(w);
    byDate.set(d, list);
  }
  const out: Workout[] = [];
  for (const [, dayList] of byDate) {
    const byTf = new Map<string, Workout[]>();
    for (const w of dayList) {
      const tf = getTimeframe(w);
      const list = byTf.get(tf) ?? [];
      list.push(w);
      byTf.set(tf, list);
    }
    for (const [, tfList] of byTf) {
      const forMe = tfList.filter((w) => {
        const wc = w as Workout & { created_by?: string | null };
        if (w.assigned_to === swimmerId) return true;
        if (wc.created_by === swimmerId) return true;
        if ((w.assignee_ids ?? []).includes(swimmerId)) return true;
        if (w.assigned_to_group === PERSONAL_ASSIGNMENT) {
          return (w.assignee_ids ?? []).includes(swimmerId);
        }
        if (w.assigned_to_group && swimmerGroup) {
          if (Array.isArray(w.assignee_ids)) {
            if (w.assignee_ids.length === 0) return false;
            return w.assignee_ids.includes(swimmerId);
          }
          return w.assigned_to_group === swimmerGroup;
        }
        return false;
      });
      if (forMe.length > 0) out.push(...forMe);
    }
  }
  return out;
}

/** Same visibility rules as coach day view: individual, personal assignee list, and group roster. */
export function filterWorkoutsForCoachSwimmerSelection(
  workouts: Workout[],
  selectedCoachSwimmerId: string | null | undefined,
  swimmers: SwimmerProfile[],
): Workout[] {
  if (!selectedCoachSwimmerId || selectedCoachSwimmerId === ALL_ID) return workouts;
  if (selectedCoachSwimmerId === ONLY_GROUPS_ID) {
    return workouts.filter((w) => isTrainingSwimmerGroup(w.assigned_to_group));
  }
  const coachFilterGroup = swimmers.find((s) => s.id === selectedCoachSwimmerId)?.swimmer_group ?? null;
  return workouts.filter((w) => {
    if (w.assigned_to === selectedCoachSwimmerId) return true;
    if (w.assigned_to_group === PERSONAL_ASSIGNMENT) {
      return (w.assignee_ids ?? []).includes(selectedCoachSwimmerId);
    }
    if (w.assigned_to_group && coachFilterGroup) {
      const ids = Array.isArray(w.assignee_ids) ? w.assignee_ids : swimmers.filter((s) => s.swimmer_group === w.assigned_to_group).map((s) => s.id);
      return ids.includes(selectedCoachSwimmerId);
    }
    return false;
  });
}

export function sortCoachWorkouts(workouts: Workout[], swimmers: SwimmerProfile[]): Workout[] {
  return [...workouts].sort((a, b) => {
    const isGroup = (w: Workout) => !!w.assigned_to_group;
    const sessionOrder = (w: Workout) => {
      const s = w.session?.trim();
      if (s === "AM") return 0;
      if (s === "PM") return 1;
      return 2;
    };
    if (isGroup(a) !== isGroup(b)) return isGroup(a) ? -1 : 1;
    const aSession = sessionOrder(a), bSession = sessionOrder(b);
    if (aSession !== bSession) return aSession - bSession;
    const order = (w: Workout) => {
      if (!w.assigned_to_group) return -1;
      if (w.assigned_to_group === PERSONAL_ASSIGNMENT) return SWIMMER_GROUPS.length;
      return SWIMMER_GROUPS.indexOf(w.assigned_to_group);
    };
    const aIdx = order(a), bIdx = order(b);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    const aName = swimmers.find((s) => s.id === a.assigned_to)?.full_name ?? "";
    const bName = swimmers.find((s) => s.id === b.assigned_to)?.full_name ?? "";
    return aName.localeCompare(bName);
  });
}

export function workoutLabel(w: Workout): string {
  return w.workout_category?.trim() || "Workout";
}

/** Format name for display: first name only, or "Firstname L." when multiple swimmers share the same first name */
function formatSwimmerDisplayName(fullName: string | null, swimmers: SwimmerProfile[]): string {
  if (!fullName?.trim()) return "?";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return fullName;
  const firstName = parts[0];
  const lastNameInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";
  const sameFirstNameCount = swimmers.filter((s) => {
    const first = (s.full_name ?? "").trim().split(/\s+/)[0];
    return first && first.toLowerCase() === firstName.toLowerCase();
  }).length;
  if (sameFirstNameCount > 1 && lastNameInitial) {
    return `${firstName} ${lastNameInitial}.`;
  }
  return firstName;
}

export function assignmentLabel(workout: Workout, swimmers: SwimmerProfile[]): string | null {
  if (workout.assigned_to_group === PERSONAL_ASSIGNMENT) {
    const ids = workout.assignee_ids ?? [];
    if (ids.length > 1) return PERSONAL_ASSIGNMENT;
    if (ids.length === 1) {
      const assignee = swimmers.find((s) => s.id === ids[0]);
      return assignee ? formatSwimmerDisplayName(assignee.full_name, swimmers) : "Swimmer";
    }
    return PERSONAL_ASSIGNMENT;
  }
  if (workout.assigned_to_group) return workout.assigned_to_group;
  if (workout.assigned_to) {
    const assignee = swimmers.find((s) => s.id === workout.assigned_to);
    return assignee ? formatSwimmerDisplayName(assignee.full_name, swimmers) : "Swimmer";
  }
  const ids = workout.assignee_ids ?? [];
  if (ids.length === 0) return null;
  if (ids.length === 1) {
    const assignee = swimmers.find((s) => s.id === ids[0]);
    return assignee ? formatSwimmerDisplayName(assignee.full_name, swimmers) : "Swimmer";
  }
  const names = ids.map((id) => swimmers.find((s) => s.id === id)?.full_name ?? id.slice(0, 8)).filter(Boolean);
  return names.length ? names.join(", ") : null;
}

const ASSIGNEE_BADGE_BASE =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium max-md:text-[10px] max-md:px-1.5";

/** Assignee / group pill colors. */
export function assigneeBadgeTwClasses(workout: Pick<Workout, "assigned_to_group">): string {
  const g = workout.assigned_to_group;
  if (!isTrainingSwimmerGroup(g)) {
    return `${ASSIGNEE_BADGE_BASE} bg-orange-500/15 text-orange-700 dark:text-orange-400`;
  }
  if (g === "Sprint") {
    return `${ASSIGNEE_BADGE_BASE} bg-purple-500/15 text-purple-700 dark:text-purple-400`;
  }
  if (g === "Middle distance") {
    return `${ASSIGNEE_BADGE_BASE} bg-accent-blue/15 text-accent-blue`;
  }
  if (g === "Distance") {
    return `${ASSIGNEE_BADGE_BASE} bg-green-500/15 text-green-700 dark:text-green-400`;
  }
  return `${ASSIGNEE_BADGE_BASE} bg-accent-blue/15 text-accent-blue`;
}

export type MonthCalendarAssigneeChip = {
  initials: string;
  className: string;
  column: "am" | "pm";
};

type MonthCalendarAssigneeFields = Pick<Workout, "assigned_to" | "assigned_to_group" | "assignee_ids" | "session">;

export function workoutsByNormDate<T extends { date: string }>(rows: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const w of rows) {
    const k = normDate(w.date);
    if (!k) continue;
    const cur = byDay.get(k);
    if (cur) cur.push(w);
    else byDay.set(k, [w]);
  }
  return byDay;
}

export function monthCalendarAssigneeChip(
  workout: MonthCalendarAssigneeFields,
  swimmers: SwimmerProfile[],
  t: (key: TranslationKey) => string,
): MonthCalendarAssigneeChip {
  const tone = assigneeBadgeTwClasses(workout);
  const chipFrame =
    "inline-flex min-h-[15px] min-w-[15px] max-w-[26px] shrink-0 items-center justify-center px-[3px] py-px text-[9px] font-bold leading-none tracking-tight !rounded-[3px]";
  const g = workout.assigned_to_group;

  let initials: string;
  if (g === "Sprint") initials = t("monthCalendarChip.sprint");
  else if (g === "Middle distance") initials = t("monthCalendarChip.middleDistance");
  else if (g === "Distance") initials = t("monthCalendarChip.distance");
  else if (g === PERSONAL_ASSIGNMENT) initials = t("monthCalendarChip.personal");
  else if (workout.assigned_to) {
    const a = swimmers.find((s) => s.id === workout.assigned_to);
    initials = (a?.full_name?.trim()?.[0] ?? "?").toUpperCase();
  } else {
    const ids = workout.assignee_ids;
    if (ids?.length === 1) {
      const a = swimmers.find((s) => s.id === ids[0]);
      initials = (a?.full_name?.trim()?.[0] ?? "?").toUpperCase();
    } else if (ids && ids.length > 1) initials = "+";
    else initials = "?";
  }

  return {
    initials,
    className: cn(tone, chipFrame),
    column: workout.session?.trim().toUpperCase() === "PM" ? "pm" : "am",
  };
}

export type SwimWorkoutIncompleteMeta = {
  missingWho: boolean;
  missingCategory: boolean;
  missingPool: boolean;
};

export function getSwimWorkoutIncompleteMeta(
  workout: Pick<Workout, "assigned_to" | "assigned_to_group" | "assignee_ids" | "workout_category" | "pool_size">,
  role: "coach" | "swimmer",
): SwimWorkoutIncompleteMeta | null {
  const missingPool = workout.pool_size !== "LCM" && workout.pool_size !== "SCM" && workout.pool_size !== "SCY";
  const missingCategory = !workout.workout_category?.trim();

  let hasWho = false;
  if (role === "coach") {
    if (workout.assigned_to && !workout.assigned_to_group) hasWho = true;
    else if (workout.assigned_to_group === PERSONAL_ASSIGNMENT) hasWho = (workout.assignee_ids?.length ?? 0) > 0;
    else if (workout.assigned_to_group && isTrainingSwimmerGroup(workout.assigned_to_group)) hasWho = true;
  } else if (workout.assigned_to_group === PERSONAL_ASSIGNMENT) {
    hasWho = (workout.assignee_ids?.length ?? 0) > 0;
  } else {
    const ids = workout.assignee_ids?.length ? workout.assignee_ids : workout.assigned_to ? [workout.assigned_to] : [];
    hasWho = ids.length > 0;
  }

  const missingWho = !hasWho;
  if (!missingWho && !missingCategory && !missingPool) return null;
  return { missingWho, missingCategory, missingPool };
}

/** Roster user ids for this workout (no UI excludes). */
export function assigneeUserIdsForWorkout(workout: Workout, swimmers: SwimmerProfile[]): string[] {
  if (workout.assigned_to_group === PERSONAL_ASSIGNMENT) {
    return workout.assignee_ids ?? [];
  }
  if (workout.assigned_to_group) {
    return Array.isArray(workout.assignee_ids)
      ? workout.assignee_ids
      : swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
  }
  if (workout.assigned_to) return [workout.assigned_to];
  return workout.assignee_ids ?? [];
}

/** True when every resolved assignee has no training group (or no profile row). */
export function workoutAssigneesAllWithoutTrainingGroup(workout: Workout, swimmers: SwimmerProfile[]): boolean {
  const ids = assigneeUserIdsForWorkout(workout, swimmers);
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const s = swimmers.find((x) => x.id === id);
    return s == null || s.swimmer_group == null;
  });
}

/** True when the workout is written for exactly one swimmer (individual, single personal assignee, or one picked from a group). */
export function workoutTargetsExactlyOneSwimmer(workout: Workout, swimmers: SwimmerProfile[]): boolean {
  if (workout.assigned_to_group === PERSONAL_ASSIGNMENT) {
    return (workout.assignee_ids ?? []).length === 1;
  }
  if (workout.assigned_to_group) {
    const ids = Array.isArray(workout.assignee_ids)
      ? workout.assignee_ids
      : swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
    return ids.length === 1;
  }
  if (workout.assigned_to) return true;
  return (workout.assignee_ids ?? []).length === 1;
}

/**
 * When true, the UI may omit "Assigned to …" because the workout targets a single swimmer by name.
 * Training-group assignments are never redundant: even with one swimmer in the group, the workout is for the group.
 */
export function assignedToCaptionRedundantForWorkout(workout: Workout, swimmers: SwimmerProfile[]): boolean {
  return workoutTargetsExactlyOneSwimmer(workout, swimmers) && !isTrainingSwimmerGroup(workout.assigned_to_group);
}

export function assignedToNames(workout: Workout, swimmers: SwimmerProfile[], excludeUserIds?: string[]): string | null {
  if (!workout.assigned_to_group) return assignmentLabel(workout, swimmers);
  const defaultGroupIds =
    workout.assigned_to_group === PERSONAL_ASSIGNMENT
      ? []
      : swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
  const ids = Array.isArray(workout.assignee_ids) ? workout.assignee_ids : defaultGroupIds;
  let assignees = swimmers.filter((s) => ids.includes(s.id));
  if (excludeUserIds?.length) assignees = assignees.filter((s) => !excludeUserIds.includes(s.id));
  const groupOrder = (g: SwimmerGroup | null | undefined) => {
    if (workout.assigned_to_group === PERSONAL_ASSIGNMENT) {
      return g == null ? 4 : SWIMMER_GROUPS.indexOf(g) + 1;
    }
    return g === workout.assigned_to_group ? 0 : g == null ? 4 : SWIMMER_GROUPS.indexOf(g) + 1;
  };
  const sorted = [...assignees].sort((a, b) => {
    const diff = groupOrder(a.swimmer_group) - groupOrder(b.swimmer_group);
    return diff !== 0 ? diff : (a.full_name ?? "").localeCompare(b.full_name ?? "");
  });
  const names = sorted.map((s) => formatSwimmerDisplayName(s.full_name, swimmers) || s.id.slice(0, 8));
  return names.length ? names.join(", ") : null;
}

/**
 * Text after "Assigned to …". When there are no resolved swimmer names but the workout targets a group or personal list, returns `nobodyLabel` (localized, e.g. "nobody" / "nadie").
 */
export function assignedToNamesForCaption(
  workout: Workout,
  swimmers: SwimmerProfile[],
  nobodyLabel: string,
  excludeUserIds?: string[],
): string | null {
  const n = assignedToNames(workout, swimmers, excludeUserIds);
  if (n) return n;
  if (workout.assigned_to_group) return nobodyLabel;
  return null;
}

/** True if the viewer is among this workout's assignees (individual, explicit ids, or group roster). */
export function isViewerInWorkout(workout: Workout, viewerId: string | undefined, swimmers: SwimmerProfile[]): boolean {
  if (!viewerId) return false;
  if (workout.assigned_to === viewerId) return true;
  if (workout.assignee_ids?.includes(viewerId)) return true;
  if (workout.assigned_to_group === PERSONAL_ASSIGNMENT) {
    return (workout.assignee_ids ?? []).includes(viewerId);
  }
  if (workout.assigned_to_group) {
    if (Array.isArray(workout.assignee_ids)) return workout.assignee_ids.includes(viewerId);
    const ids = swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
    return ids.includes(viewerId);
  }
  return false;
}

export function teammateNames(workout: Workout, swimmers: SwimmerProfile[], currentUserId: string | undefined, excludeUserIds?: string[]): string | null {
  if (!currentUserId || !isViewerInWorkout(workout, currentUserId, swimmers)) return null;
  if (!workout.assigned_to_group) return null;
  const ids =
    workout.assigned_to_group === PERSONAL_ASSIGNMENT
      ? (workout.assignee_ids ?? [])
      : Array.isArray(workout.assignee_ids)
        ? workout.assignee_ids
        : swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
  let assignees = swimmers.filter((s) => ids.includes(s.id) && s.id !== currentUserId);
  if (excludeUserIds?.length) assignees = assignees.filter((s) => !excludeUserIds.includes(s.id));
  const names = assignees
    .map((s) => formatSwimmerDisplayName(s.full_name, swimmers) || s.id.slice(0, 8))
    .sort((a, b) => a.localeCompare(b));
  return names.length ? names.join(", ") : null;
}

export function dayPreviewLabel(workout: Workout, swimmers: SwimmerProfile[], defaultAssignee?: string | null): string {
  const assignee = assignmentLabel(workout, swimmers) ?? defaultAssignee;
  const category = workoutLabel(workout);
  return assignee ? `${assignee} - ${category}` : category;
}

/** Group workouts: persist explicit `assignee_ids` when set; if still `undefined`, treat as full group roster (editor default). */
export function resolvedGroupAssigneeIdsForSave(workout: Workout, swimmers: SwimmerProfile[]): string[] {
  if (!workout.assigned_to_group) return [];
  if (workout.assigned_to_group === PERSONAL_ASSIGNMENT) {
    return Array.isArray(workout.assignee_ids) ? workout.assignee_ids : [];
  }
  if (Array.isArray(workout.assignee_ids)) return workout.assignee_ids;
  return swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
}

export async function saveAssigneesForGroupWorkout(workoutId: string, assigneeIds: string[], otherGroupWorkoutIdsSameDay: string[]) {
  const { error: delErr } = await supabase.from("workout_assignees").delete().eq("workout_id", workoutId);
  if (delErr) throw delErr;
  if (assigneeIds.length > 0) {
    const { error: insErr } = await supabase.from("workout_assignees").insert(assigneeIds.map((user_id) => ({ workout_id: workoutId, user_id })));
    if (insErr) throw insErr;
  }
  if (otherGroupWorkoutIdsSameDay.length === 0) return;
  for (const uid of assigneeIds) {
    const { error } = await supabase.from("workout_assignees").delete().in("workout_id", otherGroupWorkoutIdsSameDay).eq("user_id", uid);
    if (error) throw error;
  }
}

export async function setWorkoutPublished(workoutId: string, published: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_workout_published", { p_id: workoutId, p_published: published });
  if (error) throw error;
}

export async function saveAssigneesForIndividualWorkout(workoutId: string, assigneeIds: string[]): Promise<void> {
  const { error: delErr } = await supabase.from("workout_assignees").delete().eq("workout_id", workoutId);
  if (delErr) throw delErr;
  if (assigneeIds.length > 0) {
    const { error: insErr } = await supabase.from("workout_assignees").insert(assigneeIds.map((user_id) => ({ workout_id: workoutId, user_id })));
    if (insErr) throw insErr;
  }
}
