import { supabase } from "./supabase";
import type { Workout, SwimmerProfile, SwimmerGroup } from "./types";
import { SWIMMER_GROUPS, normDate, getTimeframe } from "./types";

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
    if (!w.assigned_to_group) return w;
    const ids = assigneesByWorkout.get(w.id);
    const assigneeIds = ids?.length ? ids : swimmers.filter((s) => s.swimmer_group === w.assigned_to_group).map((s) => s.id);
    return { ...w, assignee_ids: assigneeIds };
  });
}

export async function loadAndMergeWorkouts(rows: Workout[], swimmers: SwimmerProfile[]): Promise<Workout[]> {
  const groupIds = rows.filter((w) => w.assigned_to_group).map((w) => w.id);
  if (groupIds.length > 0) {
    const assigneesMap = await fetchAssigneesForWorkouts(groupIds);
    return mergeAssigneesIntoWorkouts(rows, assigneesMap, swimmers);
  }
  return rows;
}

export function orAssignFilter(userId: string, group: string | null | undefined): string {
  if (!group) return `assigned_to.eq.${userId}`;
  const escaped = group.includes(" ") ? `"${group}"` : group;
  return `assigned_to.eq.${userId},assigned_to_group.eq.${escaped}`;
}

export function filterWorkoutsForSwimmer(workouts: Workout[], swimmerId: string, swimmerGroup: SwimmerGroup | null): Workout[] {
  if (swimmerId === "__all__") return workouts;
  if (swimmerId === "__all_groups__" || swimmerId === "__only_groups__") {
    return workouts.filter((w) => w.assigned_to_group != null && SWIMMER_GROUPS.includes(w.assigned_to_group));
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
      if (tfList.some((w) => w.assigned_to === swimmerId)) {
        out.push(...tfList.filter((w) => w.assigned_to === swimmerId));
      } else if (swimmerGroup) {
        out.push(...tfList.filter((w) => {
          if (!w.assigned_to_group) return false;
          return (w.assignee_ids ?? []).includes(swimmerId) ||
            (!(w.assignee_ids && w.assignee_ids.length > 0) && w.assigned_to_group === swimmerGroup);
        }));
      }
    }
  }
  return out;
}

export function sortCoachWorkouts(workouts: Workout[], swimmers: SwimmerProfile[]): Workout[] {
  return [...workouts].sort((a, b) => {
    const order = (w: Workout) => w.assigned_to_group ? SWIMMER_GROUPS.indexOf(w.assigned_to_group) : -1;
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
  if (workout.assigned_to_group) return workout.assigned_to_group;
  const assignee = swimmers.find((s) => s.id === workout.assigned_to);
  return assignee ? formatSwimmerDisplayName(assignee.full_name, swimmers) : (workout.assigned_to ? "Swimmer" : null);
}

export function assignedToNames(workout: Workout, swimmers: SwimmerProfile[], excludeUserIds?: string[]): string | null {
  if (!workout.assigned_to_group) return assignmentLabel(workout, swimmers);
  const defaultGroupIds = swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
  const ids = Array.isArray(workout.assignee_ids) ? workout.assignee_ids : defaultGroupIds;
  let assignees = swimmers.filter((s) => ids.includes(s.id));
  if (excludeUserIds?.length) assignees = assignees.filter((s) => !excludeUserIds.includes(s.id));
  const groupOrder = (g: SwimmerGroup | null | undefined) =>
    g === workout.assigned_to_group ? 0 : g == null ? 4 : SWIMMER_GROUPS.indexOf(g) + 1;
  const sorted = [...assignees].sort((a, b) => {
    const diff = groupOrder(a.swimmer_group) - groupOrder(b.swimmer_group);
    return diff !== 0 ? diff : (a.full_name ?? "").localeCompare(b.full_name ?? "");
  });
  const names = sorted.map((s) => formatSwimmerDisplayName(s.full_name, swimmers) || s.id.slice(0, 8));
  return names.length ? names.join(", ") : "None";
}

export function teammateNames(workout: Workout, swimmers: SwimmerProfile[], currentUserId: string | undefined): string | null {
  if (!workout.assigned_to_group) return null;
  const ids = workout.assignee_ids?.length ? workout.assignee_ids : swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
  const assignees = swimmers.filter((s) => ids.includes(s.id) && s.id !== currentUserId);
  const names = assignees
    .map((s) => formatSwimmerDisplayName(s.full_name, swimmers) || s.id.slice(0, 8))
    .sort((a, b) => a.localeCompare(b));
  return names.length ? names.join(", ") : "None";
}

export function dayPreviewLabel(workout: Workout, swimmers: SwimmerProfile[], defaultAssignee?: string | null): string {
  const assignee = assignmentLabel(workout, swimmers) ?? defaultAssignee;
  const category = workoutLabel(workout);
  return assignee ? `${assignee} - ${category}` : category;
}

export async function saveAssigneesForGroupWorkout(workoutId: string, assigneeIds: string[], otherGroupWorkoutIdsSameDay: string[]) {
  const { error: delErr } = await supabase.from("workout_assignees").delete().eq("workout_id", workoutId);
  if (delErr) throw delErr;
  if (assigneeIds.length > 0) {
    const { error: insErr } = await supabase.from("workout_assignees").insert(assigneeIds.map((user_id) => ({ workout_id: workoutId, user_id })));
    if (insErr) throw insErr;
  }
  for (const uid of assigneeIds) {
    if (otherGroupWorkoutIdsSameDay.length === 0) continue;
    const { error } = await supabase.from("workout_assignees").delete().in("workout_id", otherGroupWorkoutIdsSameDay).eq("user_id", uid);
    if (error) throw error;
  }
}
