import { analyzeWorkout } from "./workout-analyzer";
import type { SwimmerGroup } from "./types";

export type { SwimmerGroup };
export type Aggregation = "day" | "week" | "month";

export interface WorkoutRow {
  id: string;
  date: string;
  content: string;
  assigned_to: string | null;
  assigned_to_group: SwimmerGroup | null;
  assignee_ids?: string[];
}

export interface SwimmerProfile {
  id: string;
  full_name: string | null;
  swimmer_group: SwimmerGroup | null;
}

function groupByDate(workouts: WorkoutRow[]): Map<string, WorkoutRow[]> {
  const map = new Map<string, WorkoutRow[]>();
  for (const w of workouts) {
    const d = typeof w.date === "string" ? w.date.slice(0, 10) : w.date;
    const list = map.get(d) ?? [];
    list.push(w);
    map.set(d, list);
  }
  return map;
}

export function computeSwimmerVolumes(workouts: WorkoutRow[], swimmers: SwimmerProfile[]): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  const byDate = groupByDate(workouts);

  for (const swimmer of swimmers) {
    const volByDate = new Map<string, number>();
    for (const [date, dayWorkouts] of byDate) {
      const personal = dayWorkouts.filter((w) => w.assigned_to === swimmer.id);
      const group = dayWorkouts.filter((w) => {
        if (!w.assigned_to_group) return false;
        return (w.assignee_ids?.length && w.assignee_ids.includes(swimmer.id)) ||
          (!w.assignee_ids?.length && w.assigned_to_group === swimmer.swimmer_group);
      });
      const toSum = personal.length > 0 ? personal : group;
      const total = toSum.reduce((acc, w) => acc + analyzeWorkout(w.content).totalMeters, 0);
      if (total > 0) volByDate.set(date, total);
    }
    result.set(swimmer.id, volByDate);
  }
  return result;
}

export function computeGroupVolumes(
  workouts: WorkoutRow[],
  groups: SwimmerGroup[] = ["Sprint", "Middle distance", "Distance"],
): Map<SwimmerGroup, Map<string, number>> {
  const result = new Map<SwimmerGroup, Map<string, number>>();
  const byDate = groupByDate(workouts);

  for (const group of groups) {
    const volByDate = new Map<string, number>();
    for (const [date, dayWorkouts] of byDate) {
      const total = dayWorkouts
        .filter((w) => w.assigned_to_group === group)
        .reduce((acc, w) => acc + analyzeWorkout(w.content).totalMeters, 0);
      if (total > 0) volByDate.set(date, total);
    }
    result.set(group, volByDate);
  }
  return result;
}

function getWeekStart(d: Date, weekStartsOn: 0 | 1): Date {
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  return start;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function aggregateByPeriod(
  volByDate: Map<string, number>,
  aggregation: Aggregation,
  weekStartsOn: 0 | 1 = 1,
): { label: string; meters: number }[] {
  if (aggregation === "day") {
    return [...volByDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, meters]) => ({ label, meters }));
  }
  const buckets = new Map<string, number>();
  for (const [date, meters] of volByDate) {
    const d = new Date(date + "T12:00:00");
    const key = aggregation === "week" ? fmtDate(getWeekStart(d, weekStartsOn)) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, (buckets.get(key) ?? 0) + meters);
  }
  return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, meters]) => ({ label, meters }));
}

export function fillPeriodsInRange(
  data: { label: string; meters: number }[],
  startStr: string,
  endStr: string,
  aggregation: Aggregation,
  weekStartsOn: 0 | 1,
): { label: string; meters: number }[] {
  const dataMap = new Map(data.map((d) => [d.label, d.meters]));
  const result: { label: string; meters: number }[] = [];

  if (aggregation === "day") {
    const start = new Date(startStr + "T12:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const label = fmtDate(d);
      result.push({ label, meters: dataMap.get(label) ?? 0 });
    }
  } else if (aggregation === "week") {
    const end = new Date(endStr + "T12:00:00");
    const current = new Date(getWeekStart(new Date(startStr + "T12:00:00"), weekStartsOn));
    while (current <= end) {
      const label = fmtDate(current);
      result.push({ label, meters: dataMap.get(label) ?? 0 });
      current.setDate(current.getDate() + 7);
    }
  } else {
    return data;
  }
  return result;
}
