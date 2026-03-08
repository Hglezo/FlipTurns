/**
 * Volume analytics: compute meters per swimmer/group from workouts.
 * Personal workouts take precedence over group workouts per day.
 */

import { analyzeWorkout } from "./workout-analyzer";

export type SwimmerGroup = "Sprint" | "Middle distance" | "Distance";

export interface WorkoutRow {
  id: string;
  date: string;
  content: string;
  assigned_to: string | null;
  assigned_to_group: SwimmerGroup | null;
}

export interface SwimmerProfile {
  id: string;
  full_name: string | null;
  swimmer_group: SwimmerGroup | null;
}

/** Effective volume per swimmer per date: personal takes precedence over group */
export function computeSwimmerVolumes(
  workouts: WorkoutRow[],
  swimmers: SwimmerProfile[]
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  const byDate = groupByDate(workouts);

  for (const swimmer of swimmers) {
    const volByDate = new Map<string, number>();
    for (const [date, dayWorkouts] of byDate) {
      const personal = dayWorkouts.filter((w) => w.assigned_to === swimmer.id);
      const group = swimmer.swimmer_group
        ? dayWorkouts.filter((w) => w.assigned_to_group === swimmer.swimmer_group)
        : [];

      const toSum = personal.length > 0 ? personal : group;
      const total = toSum.reduce((acc, w) => acc + analyzeWorkout(w.content).totalMeters, 0);
      if (total > 0) volByDate.set(date, total);
    }
    result.set(swimmer.id, volByDate);
  }
  return result;
}

/** Volume per group per date: sum of workouts assigned to that group */
export function computeGroupVolumes(
  workouts: WorkoutRow[],
  groups: SwimmerGroup[] = ["Sprint", "Middle distance", "Distance"]
): Map<SwimmerGroup, Map<string, number>> {
  const result = new Map<SwimmerGroup, Map<string, number>>();
  const byDate = groupByDate(workouts);

  for (const group of groups) {
    const volByDate = new Map<string, number>();
    for (const [date, dayWorkouts] of byDate) {
      const groupWorkouts = dayWorkouts.filter((w) => w.assigned_to_group === group);
      const total = groupWorkouts.reduce(
        (acc, w) => acc + analyzeWorkout(w.content).totalMeters,
        0
      );
      if (total > 0) volByDate.set(date, total);
    }
    result.set(group, volByDate);
  }
  return result;
}

function groupByDate(workouts: WorkoutRow[]): Map<string, WorkoutRow[]> {
  const map = new Map<string, WorkoutRow[]>();
  for (const w of workouts) {
    const d = typeof w.date === "string" ? w.date.slice(0, 10) : w.date;
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(w);
  }
  return map;
}

export type Aggregation = "day" | "week" | "month";

/** Aggregate daily volumes by week or month */
export function aggregateByPeriod(
  volByDate: Map<string, number>,
  aggregation: Aggregation,
  weekStartsOn: 0 | 1 = 1
): { label: string; meters: number }[] {
  if (aggregation === "day") {
    return [...volByDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, meters]) => ({ label: date, meters }));
  }

  const buckets = new Map<string, number>();
  for (const [date, meters] of volByDate) {
    const d = new Date(date + "T12:00:00");
    let key: string;
    if (aggregation === "week") {
      const start = getWeekStart(d, weekStartsOn);
      key = formatDate(start);
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    buckets.set(key, (buckets.get(key) ?? 0) + meters);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, meters]) => ({ label, meters }));
}

function getWeekStart(d: Date, weekStartsOn: 0 | 1): Date {
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  return start;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Fill in all periods in range with 0 for missing data */
export function fillPeriodsInRange(
  data: { label: string; meters: number }[],
  startStr: string,
  endStr: string,
  aggregation: Aggregation,
  weekStartsOn: 0 | 1
): { label: string; meters: number }[] {
  const dataMap = new Map(data.map((d) => [d.label, d.meters]));
  const result: { label: string; meters: number }[] = [];

  if (aggregation === "day") {
    const start = new Date(startStr + "T12:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const label = formatDate(d);
      result.push({ label, meters: dataMap.get(label) ?? 0 });
    }
  } else if (aggregation === "week") {
    const start = new Date(startStr + "T12:00:00");
    const end = new Date(endStr + "T12:00:00");
    let current = new Date(getWeekStart(start, weekStartsOn));
    while (current <= end) {
      const label = formatDate(current);
      result.push({ label, meters: dataMap.get(label) ?? 0 });
      current.setDate(current.getDate() + 7);
    }
  } else {
    return data;
  }
  return result;
}
