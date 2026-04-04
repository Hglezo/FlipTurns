import { analyzeWorkout } from "./workout-analyzer";
import type { SwimmerGroup } from "./types";
import { PERSONAL_ASSIGNMENT } from "./types";

export type { SwimmerGroup };
export type Aggregation = "day" | "week" | "month";

export interface WorkoutRow {
  id: string;
  date: string;
  content: string;
  session?: string | null;
  assigned_to: string | null;
  assigned_to_group: SwimmerGroup | typeof PERSONAL_ASSIGNMENT | null;
  assignee_ids?: string[];
  pool_size?: "LCM" | "SCM" | "SCY" | null;
}

const YARDS_TO_METERS = 0.9144;

export type VolumeDisplayUnit = "meters" | "yards";

export function metersToDisplayDistance(meters: number, unit: VolumeDisplayUnit): number {
  return unit === "yards" ? meters / YARDS_TO_METERS : meters;
}

export function formatVolumeCompact(amount: number): string {
  if (amount <= 0) return "0";
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`;
  return String(Math.round(amount));
}

function toMeters(value: number, poolSize?: "LCM" | "SCM" | "SCY" | null): number {
  return poolSize === "SCY" ? value * YARDS_TO_METERS : value;
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

function filterDayWorkoutsForSwimmer(dayWorkouts: WorkoutRow[], swimmer: SwimmerProfile): WorkoutRow[] {
  const personal = dayWorkouts.filter((w) => w.assigned_to === swimmer.id);
  const group = dayWorkouts.filter((w) => {
    if (!w.assigned_to_group) return false;
    if (w.assigned_to_group === PERSONAL_ASSIGNMENT) {
      return Boolean(w.assignee_ids?.length && w.assignee_ids.includes(swimmer.id));
    }
    return (w.assignee_ids?.length && w.assignee_ids.includes(swimmer.id)) ||
      (!w.assignee_ids?.length && w.assigned_to_group === swimmer.swimmer_group);
  });
  return personal.length > 0 ? personal : group;
}

function sessionSortOrder(session: string | null | undefined): number {
  const t = session?.trim();
  if (t === "AM") return 0;
  if (t === "PM") return 1;
  return 2;
}

export function getDayVolumeBreakdown(
  dateStr: string,
  workouts: WorkoutRow[],
  viewMode: "swimmer" | "group",
  swimmer: SwimmerProfile | null,
  group: SwimmerGroup | null,
): { meters: number; session: string | null | undefined }[] {
  const byDate = groupByDate(workouts);
  const dayWorkouts = byDate.get(dateStr) ?? [];
  let matched: WorkoutRow[];
  if (viewMode === "swimmer" && swimmer) {
    matched = filterDayWorkoutsForSwimmer(dayWorkouts, swimmer);
  } else if (viewMode === "group" && group) {
    matched = dayWorkouts.filter((w) => w.assigned_to_group === group);
  } else {
    matched = [];
  }
  return matched
    .map((w) => ({
      session: w.session,
      meters: toMeters(analyzeWorkout(w.content).totalMeters, w.pool_size),
    }))
    .filter((x) => x.meters > 0)
    .sort((a, b) => sessionSortOrder(a.session) - sessionSortOrder(b.session));
}

export type WeekTooltipDay = { dateStr: string; workouts: { meters: number; session: string | null | undefined }[] };

export function getWeekVolumeBreakdown(
  weekStartStr: string,
  workouts: WorkoutRow[],
  viewMode: "swimmer" | "group",
  swimmer: SwimmerProfile | null,
  group: SwimmerGroup | null,
): WeekTooltipDay[] {
  const start = new Date(weekStartStr + "T12:00:00");
  const out: WeekTooltipDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = toLocalDateStr(d);
    const workoutsDay = getDayVolumeBreakdown(dateStr, workouts, viewMode, swimmer, group);
    if (workoutsDay.length > 0) out.push({ dateStr, workouts: workoutsDay });
  }
  return out;
}

export function computeAllGroupsVolumeChartData(
  workouts: WorkoutRow[],
  aggregation: Aggregation,
  weekStartsOn: 0 | 1,
  dateRangeStart: string,
  dateRangeEnd: string,
  groups: SwimmerGroup[] = ["Sprint", "Middle distance", "Distance"],
): { group: SwimmerGroup; chartData: { label: string; meters: number }[] }[] {
  const groupVols = computeGroupVolumes(workouts, groups);
  return groups.map((group) => {
    const volByDate = groupVols.get(group) ?? new Map();
    const aggregated = aggregateByPeriod(volByDate, aggregation, weekStartsOn);
    const chartData = fillPeriodsInRange(aggregated, dateRangeStart, dateRangeEnd, aggregation, weekStartsOn);
    return { group, chartData };
  });
}

export function computeVolumeChartData(
  workouts: WorkoutRow[],
  swimmers: SwimmerProfile[],
  viewMode: "swimmer" | "group",
  selectedSwimmerId: string | null,
  selectedGroup: SwimmerGroup | null,
  aggregation: Aggregation,
  weekStartsOn: 0 | 1,
  dateRangeStart: string,
  dateRangeEnd: string,
): { label: string; meters: number }[] {
  if (viewMode === "swimmer" && selectedSwimmerId) {
    const volByDate = computeSwimmerVolumes(workouts, swimmers).get(selectedSwimmerId);
    return fillPeriodsInRange(
      volByDate ? aggregateByPeriod(volByDate, aggregation, weekStartsOn) : [],
      dateRangeStart,
      dateRangeEnd,
      aggregation,
      weekStartsOn,
    );
  }
  if (viewMode === "group" && selectedGroup) {
    const volByDate = computeGroupVolumes(workouts).get(selectedGroup);
    return fillPeriodsInRange(
      volByDate ? aggregateByPeriod(volByDate, aggregation, weekStartsOn) : [],
      dateRangeStart,
      dateRangeEnd,
      aggregation,
      weekStartsOn,
    );
  }
  return [];
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
        if (w.assigned_to_group === PERSONAL_ASSIGNMENT) {
          return Boolean(w.assignee_ids?.length && w.assignee_ids.includes(swimmer.id));
        }
        return (w.assignee_ids?.length && w.assignee_ids.includes(swimmer.id)) ||
          (!w.assignee_ids?.length && w.assigned_to_group === swimmer.swimmer_group);
      });
      const toSum = personal.length > 0 ? personal : group;
      const total = toSum.reduce((acc, w) => acc + toMeters(analyzeWorkout(w.content).totalMeters, w.pool_size), 0);
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
        .reduce((acc, w) => acc + toMeters(analyzeWorkout(w.content).totalMeters, w.pool_size), 0);
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

export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    const key = aggregation === "week" ? toLocalDateStr(getWeekStart(d, weekStartsOn)) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
      const label = toLocalDateStr(d);
      result.push({ label, meters: dataMap.get(label) ?? 0 });
    }
  } else if (aggregation === "week") {
    const end = new Date(endStr + "T12:00:00");
    const current = new Date(getWeekStart(new Date(startStr + "T12:00:00"), weekStartsOn));
    while (current <= end) {
      const label = toLocalDateStr(current);
      result.push({ label, meters: dataMap.get(label) ?? 0 });
      current.setDate(current.getDate() + 7);
    }
  } else {
    return data;
  }
  return result;
}
