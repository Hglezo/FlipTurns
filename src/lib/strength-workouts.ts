import { supabase } from "./supabase";
import type { StrengthWorkout, SwimmerProfile, Workout } from "./types";
import { getTimeframe } from "./types";
import { mergeAssigneesIntoWorkouts, resolvedGroupAssigneeIdsForSave } from "./workouts";

export const STRENGTH_WORKOUT_SELECT =
  "id, date, content, session, assigned_to, assigned_to_group, created_at, updated_at, created_by, is_published";

export async function fetchStrengthAssigneesForWorkouts(strengthWorkoutIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (strengthWorkoutIds.length === 0) return map;
  const { data } = await supabase
    .from("strength_workout_assignees")
    .select("strength_workout_id, user_id")
    .in("strength_workout_id", strengthWorkoutIds);
  for (const row of data ?? []) {
    const wid = row.strength_workout_id as string;
    const list = map.get(wid) ?? [];
    list.push(row.user_id as string);
    map.set(wid, list);
  }
  return map;
}

export function mergeStrengthAssigneesIntoWorkouts(
  workouts: StrengthWorkout[],
  assigneesByWorkout: Map<string, string[]>,
  swimmers: SwimmerProfile[],
): StrengthWorkout[] {
  const asWorkout = workouts.map((w) => w as unknown as Workout);
  const merged = mergeAssigneesIntoWorkouts(asWorkout, assigneesByWorkout, swimmers);
  return merged.map((w, i) => ({ ...workouts[i], assignee_ids: w.assignee_ids }));
}

export async function loadAndMergeStrengthWorkouts(rows: StrengthWorkout[], swimmers: SwimmerProfile[]): Promise<StrengthWorkout[]> {
  const ids = rows.filter((w) => w.id).map((w) => w.id);
  if (ids.length === 0) return rows;
  const assigneesMap = await fetchStrengthAssigneesForWorkouts(ids);
  return mergeStrengthAssigneesIntoWorkouts(rows, assigneesMap, swimmers);
}

export function strengthRpcMissingInSchemaCache(error: { message?: string } | null | undefined): boolean {
  const m = error?.message ?? "";
  return (
    m.includes("schema cache") ||
    m.includes("Could not find the function") ||
    (m.includes("function") && m.includes("does not exist"))
  );
}

export async function setStrengthWorkoutPublished(strengthWorkoutId: string, published: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_strength_workout_published", {
    p_id: strengthWorkoutId,
    p_published: published,
  });
  if (!error) return;
  if (!strengthRpcMissingInSchemaCache(error)) throw error;
  const { error: updErr } = await supabase
    .from("strength_workouts")
    .update({ is_published: published, updated_at: new Date().toISOString() })
    .eq("id", strengthWorkoutId);
  if (updErr) throw updErr;
}

export async function saveStrengthAssigneesForIndividualWorkout(strengthWorkoutId: string, assigneeIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("replace_strength_workout_assignees", {
    p_strength_workout_id: strengthWorkoutId,
    p_user_ids: assigneeIds,
  });
  if (error) throw error;
}

export async function persistStrengthGroupAssigneesAcrossRows(
  rows: StrengthWorkout[],
  focal: StrengthWorkout,
  focalSavedId: string,
  swimmers: SwimmerProfile[],
  excludePeerId: string,
  skipSiblingId: string,
): Promise<boolean> {
  const toW = (s: StrengthWorkout) => s as unknown as Workout;
  const tf = getTimeframe(focal);
  const otherIds = rows
    .filter((w) => w.id && w.assigned_to_group && w.id !== excludePeerId && getTimeframe(w) === tf)
    .map((w) => w.id!);
  try {
    await saveStrengthAssigneesForGroupWorkout(
      focalSavedId,
      resolvedGroupAssigneeIdsForSave(toW(focal), swimmers),
      otherIds,
    );
  } catch {
    return false;
  }
  for (const w of rows) {
    if (!w.assigned_to_group || !w.id || w.id === skipSiblingId) continue;
    const t = getTimeframe(w);
    const other = rows
      .filter((x) => x.id && x.assigned_to_group && x.id !== w.id && getTimeframe(x) === t)
      .map((x) => x.id!);
    try {
      await saveStrengthAssigneesForGroupWorkout(w.id, resolvedGroupAssigneeIdsForSave(toW(w), swimmers), other);
    } catch {
      return false;
    }
  }
  return true;
}

export async function saveStrengthAssigneesForGroupWorkout(
  strengthWorkoutId: string,
  assigneeIds: string[],
  otherStrengthWorkoutIdsSameTimeframe: string[],
): Promise<void> {
  const { error } = await supabase.rpc("replace_strength_workout_assignees", {
    p_strength_workout_id: strengthWorkoutId,
    p_user_ids: assigneeIds,
  });
  if (error) throw error;
  if (otherStrengthWorkoutIdsSameTimeframe.length === 0) return;
  for (const uid of assigneeIds) {
    const { error: delErr } = await supabase
      .from("strength_workout_assignees")
      .delete()
      .in("strength_workout_id", otherStrengthWorkoutIdsSameTimeframe)
      .eq("user_id", uid);
    if (delErr) throw delErr;
  }
}

export function strengthWorkoutsAsPrintWorkouts(rows: StrengthWorkout[]): Workout[] {
  return rows.map((s) => ({
    id: s.id,
    date: s.date,
    content: s.content,
    session: s.session,
    workout_category: null,
    pool_size: null,
    assigned_to: s.assigned_to ?? null,
    assigned_to_group: s.assigned_to_group ?? null,
    assignee_ids: s.assignee_ids,
    updated_at: s.updated_at ?? null,
    created_by: s.created_by ?? null,
    is_published: s.is_published,
  }));
}
