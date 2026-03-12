"use client";

import { useState, useEffect, useRef } from "react";
import {
  format,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isWithinInterval,
} from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Waves,
  ChevronLeft,
  ChevronRight,
  CalendarIcon,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Settings,
  Plus,
  Pencil,
  LogOut,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkoutAnalysis } from "@/components/workout-analysis";
import { SignOutDropdown } from "@/components/sign-out-dropdown";
import { usePreferences } from "@/components/preferences-provider";
import { useAuth } from "@/components/auth-provider";

type ViewMode = "day" | "week" | "month";

type SwimmerGroup = "Sprint" | "Middle distance" | "Distance";

interface Workout {
  id: string;
  date: string;
  content: string;
  session?: string | null;
  workout_category?: string | null;
  assigned_to?: string | null;
  assigned_to_group?: SwimmerGroup | null;
  assignee_ids?: string[];
}

interface SwimmerProfile {
  id: string;
  full_name: string | null;
  swimmer_group?: SwimmerGroup | null;
}

const SWIMMER_GROUPS: SwimmerGroup[] = ["Sprint", "Middle distance", "Distance"];
const ALL_GROUPS_ID = "__all_groups__" as const;
const WORKOUT_CATEGORIES = ["", "Recovery", "Aerobic", "Pace", "Speed", "Tech suit"] as const;
const SESSION_OPTIONS = ["", "AM", "PM"] as const; // "" = Anytime

function getTimeframe(w: { session?: string | null }): string {
  return (w.session?.trim() || "Anytime");
}

function orAssignFilter(userId: string, group: string | null | undefined): string {
  if (!group) return `assigned_to.eq.${userId}`;
  const escaped = group.includes(" ") ? `"${group}"` : group;
  return `assigned_to.eq.${userId},assigned_to_group.eq.${escaped}`;
}

function workoutLabel(w: Workout): string {
  const cat = w.workout_category?.trim();
  return cat || "Workout";
}

function assignmentLabel(workout: Workout, swimmers: SwimmerProfile[]): string | null {
  if (workout.assigned_to_group) return `${workout.assigned_to_group} Group`;
  const assignee = swimmers.find((s) => s.id === workout.assigned_to);
  return assignee?.full_name ?? (workout.assigned_to ? "Swimmer" : null);
}

function assignedToNames(workout: Workout, swimmers: SwimmerProfile[], excludeUserIds?: string[]): string | null {
  if (workout.assigned_to_group) {
    const defaultGroupIds = swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
    const ids = Array.isArray(workout.assignee_ids) ? workout.assignee_ids : defaultGroupIds;
    let assignees = swimmers.filter((s) => ids.includes(s.id));
    if (excludeUserIds?.length) assignees = assignees.filter((s) => !excludeUserIds.includes(s.id));
    const groupOrder = (g: SwimmerGroup | null | undefined) =>
      g === workout.assigned_to_group ? 0 : g == null ? 4 : COACH_GROUP_ORDER.indexOf(g as (typeof COACH_GROUP_ORDER)[number]) + 1;
    const sorted = [...assignees].sort((a, b) => {
      const ga = groupOrder(a.swimmer_group);
      const gb = groupOrder(b.swimmer_group);
      if (ga !== gb) return ga - gb;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
    const names = sorted.map((s) => s.full_name || s.id.slice(0, 8));
    return names.length ? names.join(", ") : "None";
  }
  return assignmentLabel(workout, swimmers);
}

function teammateNames(workout: Workout, swimmers: SwimmerProfile[], currentUserId: string | undefined): string | null {
  if (!workout.assigned_to_group) return null;
  const ids = workout.assignee_ids?.length ? workout.assignee_ids : swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
  const names = swimmers.filter((s) => ids.includes(s.id) && s.id !== currentUserId).map((s) => s.full_name || s.id.slice(0, 8)).sort((a, b) => a.localeCompare(b));
  return names.length ? names.join(", ") : "None";
}

function dayPreviewLabel(workout: Workout, swimmers: SwimmerProfile[], defaultAssignee?: string | null): string {
  const assignee = assignmentLabel(workout, swimmers) ?? defaultAssignee;
  const category = workoutLabel(workout);
  return assignee ? `${assignee} - ${category}` : category;
}

function swimmerPreviewDefault(selectedViewSwimmerId: string | null, profile: { full_name: string | null } | null, userId: string | undefined, swimmers: SwimmerProfile[]): string | undefined {
  if (selectedViewSwimmerId === ALL_GROUPS_ID) return "All Groups";
  if (selectedViewSwimmerId === null) return (profile?.full_name ?? swimmers.find((s) => s.id === userId)?.full_name) ?? undefined;
  return selectedViewSwimmerId ? swimmers.find((s) => s.id === selectedViewSwimmerId)?.full_name ?? undefined : undefined;
}

const COACH_GROUP_ORDER = ["Sprint", "Middle distance", "Distance"] as const;

function sortCoachWorkouts(workouts: Workout[], swimmers: SwimmerProfile[]): Workout[] {
  return [...workouts].sort((a, b) => {
    const aIdx = a.assigned_to_group ? COACH_GROUP_ORDER.indexOf(a.assigned_to_group as (typeof COACH_GROUP_ORDER)[number]) : -1;
    const bIdx = b.assigned_to_group ? COACH_GROUP_ORDER.indexOf(b.assigned_to_group as (typeof COACH_GROUP_ORDER)[number]) : -1;
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    const aName = swimmers.find((s) => s.id === a.assigned_to)?.full_name ?? "";
    const bName = swimmers.find((s) => s.id === b.assigned_to)?.full_name ?? "";
    return aName.localeCompare(bName);
  });
}

async function fetchAssigneesForWorkouts(workoutIds: string[]): Promise<Map<string, string[]>> {
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

function mergeAssigneesIntoWorkouts(workouts: Workout[], assigneesByWorkout: Map<string, string[]>, swimmers: SwimmerProfile[]): Workout[] {
  return workouts.map((w) => {
    const ids = assigneesByWorkout.get(w.id);
    if (w.assigned_to_group) {
      const assigneeIds = ids?.length ? ids : swimmers.filter((s) => s.swimmer_group === w.assigned_to_group).map((s) => s.id);
      return { ...w, assignee_ids: assigneeIds };
    }
    return w;
  });
}

function filterWorkoutsForSwimmerByDate(workouts: Workout[], swimmerId: string, swimmerGroup: SwimmerGroup | null): Workout[] {
  if (swimmerId === ALL_GROUPS_ID) {
    return workouts.filter((w) => w.assigned_to_group != null && SWIMMER_GROUPS.includes(w.assigned_to_group));
  }
  const norm = (d: string | undefined) => (d && typeof d === "string" ? d.slice(0, 10) : d);
  const byDate = new Map<string, Workout[]>();
  for (const w of workouts) {
    const d = norm(w.date) ?? w.date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(w);
  }
  const out: Workout[] = [];
  for (const [, dayList] of byDate) {
    const byTf = new Map<string, Workout[]>();
    for (const w of dayList) {
      const tf = getTimeframe(w);
      if (!byTf.has(tf)) byTf.set(tf, []);
      byTf.get(tf)!.push(w);
    }
    for (const [, tfList] of byTf) {
      const hasPersonal = tfList.some((w) => w.assigned_to === swimmerId);
      if (hasPersonal) {
        tfList.filter((w) => w.assigned_to === swimmerId).forEach((w) => out.push(w));
      } else if (swimmerGroup) {
        tfList
          .filter((w) => {
            if (!w.assigned_to_group) return false;
            const inList = (w.assignee_ids ?? []).includes(swimmerId);
            const noOverride = !(w.assignee_ids && w.assignee_ids.length > 0);
            const inDefaultGroup = w.assigned_to_group === swimmerGroup;
            return inList || (noOverride && inDefaultGroup);
          })
          .forEach((w) => out.push(w));
      }
    }
  }
  return out;
}

const badgeClass = "inline-flex items-center rounded-full bg-accent-blue/15 px-2.5 py-0.5 text-xs font-medium text-accent-blue";

function WorkoutBlock({
  workout,
  dateKey,
  showLabel,
  feedbackRefreshKey,
  onFeedbackChange,
  assigneeLabel,
  assigneeNames,
  teammateNames,
  className = "mt-4",
  readOnly,
  compact,
}: {
  workout: Workout;
  dateKey: string;
  showLabel: boolean;
  feedbackRefreshKey: number;
  onFeedbackChange?: () => void;
  assigneeLabel?: string | null;
  assigneeNames?: string | null;
  teammateNames?: string | null;
  className?: string;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const hasAssignment = workout.assigned_to_group?.trim() || workout.assigned_to;
  const hasCategory = workout.workout_category?.trim();
  const sessionLabel = workout.session?.trim() === "AM" || workout.session?.trim() === "PM" ? workout.session.trim() : "Anytime";
  const hasBadges = hasAssignment || hasCategory;
  const namesLine = readOnly ? assigneeNames && `Assigned to ${assigneeNames}` : teammateNames != null && `Teammates: ${teammateNames}`;
  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
          sessionLabel === "AM"
            ? "bg-amber-400/15 text-amber-600 dark:text-amber-400"
            : sessionLabel === "PM"
              ? "bg-indigo-400/15 text-indigo-600 dark:text-indigo-400"
              : "bg-muted text-muted-foreground"
        }`}>{sessionLabel}</span>
        {hasBadges && (
          <div className={`flex flex-wrap justify-end gap-1.5 ${compact ? "mb-1" : "mb-2"}`}>
            {assigneeLabel && (
              <span className={badgeClass}>{assigneeLabel}</span>
            )}
            {workout.workout_category?.trim() && (
              <span className={badgeClass}>{workout.workout_category.trim()}</span>
            )}
          </div>
        )}
      </div>
      {namesLine && (
        <p className="text-xs text-muted-foreground -mt-1 mb-2 text-right">{namesLine}</p>
      )}
      <pre className={`whitespace-pre-wrap font-sans leading-relaxed text-foreground/90 ${compact ? "text-[14px]" : "text-[15px]"}`}>{workout.content}</pre>
      <WorkoutAnalysis
        content={workout.content}
        date={dateKey}
        workoutId={workout.id}
        refreshKey={feedbackRefreshKey}
        onFeedbackChange={onFeedbackChange}
        className={className}
        viewerRole={readOnly ? "coach" : "swimmer"}
      />
    </div>
  );
}

export default function Home() {
  const { weekStartsOn } = usePreferences() ?? { weekStartsOn: 1 as 0 | 1 };
  const { user, profile, role, signOut, loading: authLoading } = useAuth();
  const swimmerGroup = profile?.role === "swimmer" ? profile?.swimmer_group : null;
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [coachWorkouts, setCoachWorkouts] = useState<Workout[]>([]);
  const [viewWorkouts, setViewWorkouts] = useState<Workout[]>([]);
  const [swimmerLoading, setSwimmerLoading] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([]);
  const [monthWorkouts, setMonthWorkouts] = useState<Workout[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [expandedMonthDayKey, setExpandedMonthDayKey] = useState<string | null>(null);
  const [feedbackRefreshKey, setFeedbackRefreshKey] = useState(0);
  const [editingWorkoutIndex, setEditingWorkoutIndex] = useState<number | null>(null);
  const [editingWorkoutSnapshot, setEditingWorkoutSnapshot] = useState<Workout | null>(null);
  const [swimmers, setSwimmers] = useState<SwimmerProfile[]>([]);
  const [selectedViewSwimmerId, setSelectedViewSwimmerId] = useState<string | null>(null);
  const [selectedCoachSwimmerId, setSelectedCoachSwimmerId] = useState<string | null>(null);
  const addWorkoutForDateRef = useRef<string | null>(null);

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const normDate = (d: string | undefined) => (d && typeof d === "string" ? d.slice(0, 10) : d);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Swimmers default to own workouts (selectedViewSwimmerId null = "my workouts")

  // Fetch swimmer list (coaches need it for assignment; swimmers need it to show names)
  useEffect(() => {
    if (!role) return;
    async function loadSwimmers() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, swimmer_group")
        .eq("role", "swimmer")
        .order("full_name");
      if (!error && data) {
        setSwimmers((data as SwimmerProfile[]) ?? []);
        return;
      }
      const { data: base } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "swimmer")
        .order("full_name");
      setSwimmers(((base ?? []).map((s) => ({ ...s, swimmer_group: null })) as SwimmerProfile[]));
    }
    loadSwimmers();
  }, [role]);

  // Fetch workouts for swimmer (day view). null = own, ALL_GROUPS_ID = all group workouts, uuid = that swimmer
  useEffect(() => {
    if (role !== "swimmer" || viewMode !== "day" || !user) return;
    const userId = user.id;

    async function fetchWorkouts() {
      setSwimmerLoading(true);
      const isAllGroups = selectedViewSwimmerId === ALL_GROUPS_ID;
      const filterId = isAllGroups ? null : (selectedViewSwimmerId ?? userId);
      const filterGroup = filterId === userId ? swimmerGroup : swimmers.find((s) => s.id === filterId)?.swimmer_group ?? null;
      let query = supabase
        .from("workouts")
        .select("*")
        .eq("date", dateKey)
        .order("created_at", { ascending: true });
      if (isAllGroups) {
        query = query.in("assigned_to_group", SWIMMER_GROUPS);
      } else if (filterId) {
        query = filterGroup ? query.or(orAssignFilter(filterId, filterGroup)) : query.eq("assigned_to", filterId);
      }
      const { data } = await query;
      let rows = (data ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey }));
      const groupWorkoutIds = rows.filter((w) => w.assigned_to_group).map((w) => w.id);
      if (groupWorkoutIds.length > 0) {
        const assigneesMap = await fetchAssigneesForWorkouts(groupWorkoutIds);
        rows = mergeAssigneesIntoWorkouts(rows, assigneesMap, swimmers);
      }
      const me = filterId ?? userId;
      if (!isAllGroups && (filterId || filterGroup)) {
        const byTf = new Map<string, Workout[]>();
        for (const w of rows) {
          const tf = getTimeframe(w);
          if (!byTf.has(tf)) byTf.set(tf, []);
          byTf.get(tf)!.push(w);
        }
        rows = [];
        for (const [, tfList] of byTf) {
          const hasPersonal = tfList.some((w) => w.assigned_to === me);
          if (hasPersonal) {
            rows.push(...tfList.filter((w) => w.assigned_to === me));
          } else if (filterGroup) {
            rows.push(...tfList.filter((w) => {
              if (!w.assigned_to_group) return false;
              const inList = (w.assignee_ids ?? []).includes(me);
              const noOverride = !(w.assignee_ids && w.assignee_ids.length > 0);
              const inDefaultGroup = w.assigned_to_group === filterGroup;
              return inList || (noOverride && inDefaultGroup);
            }));
          }
        }
      } else if (isAllGroups) {
        rows = rows.filter((w) => w.assigned_to_group != null && SWIMMER_GROUPS.includes(w.assigned_to_group));
      }
      setViewWorkouts(rows);
      setSwimmerLoading(false);
    }

    fetchWorkouts();
  }, [dateKey, role, viewMode, user?.id, selectedViewSwimmerId, swimmerGroup, swimmers]);

  // Fetch workouts for coach (day view)
  useEffect(() => {
    if (!dateKey || role !== "coach" || viewMode !== "day" || !user) return;
    const isAddingWorkout = addWorkoutForDateRef.current === dateKey;
    if (!isAddingWorkout) {
      setEditingWorkoutIndex(null);
      setEditingWorkoutSnapshot(null);
    }

    async function fetchWorkouts() {
      setCoachLoading(true);
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .eq("date", dateKey)
        .order("created_at", { ascending: true });
      let rows = (data ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey }));
      const groupWorkoutIds = rows.filter((w) => w.assigned_to_group).map((w) => w.id);
      if (groupWorkoutIds.length > 0) {
        const assigneesMap = await fetchAssigneesForWorkouts(groupWorkoutIds);
        rows = mergeAssigneesIntoWorkouts(rows, assigneesMap, swimmers);
      }
      if (selectedCoachSwimmerId) {
        const coachFilterGroup = swimmers.find((s) => s.id === selectedCoachSwimmerId)?.swimmer_group ?? null;
        rows = rows.filter((w) => {
          if (w.assigned_to === selectedCoachSwimmerId) return true;
          if (w.assigned_to_group && coachFilterGroup) {
            const ids = Array.isArray(w.assignee_ids) ? w.assignee_ids : swimmers.filter((s) => s.swimmer_group === w.assigned_to_group).map((s) => s.id);
            return ids.includes(selectedCoachSwimmerId);
          }
          return false;
        });
      }
      if (isAddingWorkout) {
        addWorkoutForDateRef.current = null;
        const newWorkout = { id: "", date: dateKey, content: "", session: null, workout_category: null, assigned_to: selectedCoachSwimmerId ?? null, assigned_to_group: null };
        setCoachWorkouts([...rows, newWorkout]);
        setEditingWorkoutIndex(rows.length);
      } else {
        setCoachWorkouts(rows);
      }
      setCoachLoading(false);
    }

    fetchWorkouts();
  }, [dateKey, role, viewMode, user?.id, selectedCoachSwimmerId, swimmers]);

  // Fetch workouts for week view
  useEffect(() => {
    if (viewMode !== "week" || !user) return;

    async function fetchWeekWorkouts() {
      setRangeLoading(true);
      const weekStart = startOfWeek(selectedDate, { weekStartsOn });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn });
      let query = supabase
        .from("workouts")
        .select("*")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date", { ascending: true });
      const swimmerFilterId = role === "swimmer" ? (selectedViewSwimmerId === ALL_GROUPS_ID ? ALL_GROUPS_ID : (selectedViewSwimmerId ?? user?.id)) : null;
      const weekFilterId = role === "swimmer" ? swimmerFilterId : selectedCoachSwimmerId;
      const weekFilterGroup = role === "swimmer" && swimmerFilterId === user?.id
        ? swimmerGroup
        : weekFilterId && weekFilterId !== ALL_GROUPS_ID ? swimmers.find((s) => s.id === weekFilterId)?.swimmer_group ?? null : null;
      if (role === "swimmer" && swimmerFilterId) {
        if (swimmerFilterId === ALL_GROUPS_ID) {
          query = query.in("assigned_to_group", SWIMMER_GROUPS);
        } else {
          query = weekFilterGroup ? query.or(orAssignFilter(swimmerFilterId, weekFilterGroup)) : query.eq("assigned_to", swimmerFilterId);
        }
      }
      if (role === "coach" && selectedCoachSwimmerId) {
        const coachGroup = swimmers.find((s) => s.id === selectedCoachSwimmerId)?.swimmer_group ?? null;
        query = coachGroup ? query.or(orAssignFilter(selectedCoachSwimmerId, coachGroup)) : query.eq("assigned_to", selectedCoachSwimmerId);
      }

      const { data } = await query;
      let rows = data ?? [];
      const groupIds = rows.filter((w: Workout) => w.assigned_to_group).map((w: Workout) => w.id);
      if (groupIds.length > 0) {
        const assigneesMap = await fetchAssigneesForWorkouts(groupIds);
        rows = mergeAssigneesIntoWorkouts(rows, assigneesMap, swimmers);
      }
      if (role === "swimmer" && swimmerFilterId) {
        rows = filterWorkoutsForSwimmerByDate(rows, swimmerFilterId, weekFilterGroup ?? null);
      }
      setWeekWorkouts(rows);
      setRangeLoading(false);
    }

    fetchWeekWorkouts();
  }, [selectedDate, viewMode, weekStartsOn, user?.id, role, selectedViewSwimmerId, selectedCoachSwimmerId, swimmerGroup, swimmers]);

  // Fetch workouts for month view
  useEffect(() => {
    if (viewMode !== "month" || !user) return;

    async function fetchMonthWorkouts() {
      setRangeLoading(true);
      const monthStart = startOfMonth(selectedDate);
      const monthEnd = endOfMonth(selectedDate);
      let query = supabase
        .from("workouts")
        .select("*")
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));
      const swimmerFilterId = role === "swimmer" ? (selectedViewSwimmerId === ALL_GROUPS_ID ? ALL_GROUPS_ID : (selectedViewSwimmerId ?? user?.id)) : null;
      const monthFilterId = role === "swimmer" ? swimmerFilterId : selectedCoachSwimmerId;
      const monthFilterGroup = role === "swimmer" && swimmerFilterId === user?.id
        ? swimmerGroup
        : monthFilterId && monthFilterId !== ALL_GROUPS_ID ? swimmers.find((s) => s.id === monthFilterId)?.swimmer_group ?? null : null;
      if (role === "swimmer" && swimmerFilterId) {
        if (swimmerFilterId === ALL_GROUPS_ID) {
          query = query.in("assigned_to_group", SWIMMER_GROUPS);
        } else {
          query = monthFilterGroup ? query.or(orAssignFilter(swimmerFilterId, monthFilterGroup)) : query.eq("assigned_to", swimmerFilterId);
        }
      }
      if (role === "coach" && selectedCoachSwimmerId) {
        const coachGroup = swimmers.find((s) => s.id === selectedCoachSwimmerId)?.swimmer_group ?? null;
        query = coachGroup ? query.or(orAssignFilter(selectedCoachSwimmerId, coachGroup)) : query.eq("assigned_to", selectedCoachSwimmerId);
      }

      const { data } = await query;
      let rows = data ?? [];
      const groupIds = rows.filter((w: Workout) => w.assigned_to_group).map((w: Workout) => w.id);
      if (groupIds.length > 0) {
        const assigneesMap = await fetchAssigneesForWorkouts(groupIds);
        rows = mergeAssigneesIntoWorkouts(rows, assigneesMap, swimmers);
      }
      if (role === "swimmer" && swimmerFilterId) {
        rows = filterWorkoutsForSwimmerByDate(rows, swimmerFilterId, monthFilterGroup ?? null);
      }
      setMonthWorkouts(rows);
      setRangeLoading(false);
    }

    fetchMonthWorkouts();
  }, [selectedDate, viewMode, user?.id, role, selectedViewSwimmerId, selectedCoachSwimmerId, swimmerGroup, swimmers]);

  async function saveWorkouts() {
    if (!dateKey) return;
    setLoading(true);
    setSaved(false);

    const toInsert = coachWorkouts.filter((w) => !w.id);
    const toUpdate = coachWorkouts.filter((w) => w.id);
    const currentIds = new Set(coachWorkouts.map((w) => w.id).filter(Boolean));

    const { data: existing } = await supabase
      .from("workouts")
      .select("id")
      .eq("date", dateKey);
    const toDelete = (existing ?? [])
      .filter((w) => !currentIds.has(w.id))
      .map((w) => w.id);

    if (toDelete.length > 0) {
      const { error } = await supabase.from("workouts").delete().in("id", toDelete);
      if (error) { alert(error.message); setLoading(false); return; }
    }

    for (const w of toUpdate) {
      const { error } = await supabase
        .from("workouts")
        .update({
          content: w.content,
          session: w.session || null,
          workout_category: w.workout_category,
          assigned_to: w.assigned_to,
          assigned_to_group: w.assigned_to_group,
          updated_at: new Date().toISOString(),
        })
        .eq("id", w.id);
      if (error) { alert(error.message); setLoading(false); return; }
    }

    if (toInsert.length > 0) {
      const { data: insertedRows, error } = await supabase
        .from("workouts")
        .insert(
          toInsert.map((w) => ({
            date: dateKey,
            content: w.content ?? "",
            session: w.session || null,
            workout_category: w.workout_category || null,
            assigned_to: w.assigned_to ?? null,
            assigned_to_group: w.assigned_to_group ?? null,
          }))
        )
        .select("id");
      if (error) { alert(error.message); setLoading(false); return; }
      const newIds = (insertedRows ?? []).map((r) => r.id);
      const groupWorkoutsWithIds: { id: string; w: Workout }[] = [];
      let insertIdx = 0;
      for (const w of coachWorkouts) {
        if (!w.assigned_to_group) continue;
        const id = w.id ?? newIds[insertIdx++];
        if (id) groupWorkoutsWithIds.push({ id, w });
      }
      for (const w of groupWorkoutsWithIds) {
        const { id } = w;
        const tf = getTimeframe(w.w);
        const otherIds = groupWorkoutsWithIds.filter((o) => o.id !== id && getTimeframe(o.w) === tf).map((o) => o.id);
        try {
          await saveAssigneesForGroupWorkout(id, w.w.assignee_ids ?? [], otherIds);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Failed to save assignees");
          setLoading(false);
          return;
        }
      }
    } else {
      for (const w of coachWorkouts) {
        if (!w.assigned_to_group || !w.id) continue;
        const tf = getTimeframe(w);
        const otherIds = coachWorkouts.filter((x) => x.id && x.assigned_to_group && x.id !== w.id && getTimeframe(x) === tf).map((x) => x.id!);
        try {
          await saveAssigneesForGroupWorkout(w.id, w.assignee_ids ?? [], otherIds);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Failed to save assignees");
          setLoading(false);
          return;
        }
      }
    }

    const { data: rows } = await supabase
      .from("workouts")
      .select("*")
      .eq("date", dateKey)
      .order("created_at", { ascending: true });

    let merged = (rows ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey }));
    const groupIds = merged.filter((w) => w.assigned_to_group).map((w) => w.id);
    if (groupIds.length > 0) {
      const assigneesMap = await fetchAssigneesForWorkouts(groupIds);
      merged = mergeAssigneesIntoWorkouts(merged, assigneesMap, swimmers);
    }
    setCoachWorkouts(merged);
    setLoading(false);
    setSaved(true);
    setEditingWorkoutIndex(null);
    setEditingWorkoutSnapshot(null);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveAssigneesForGroupWorkout(workoutId: string, assigneeIds: string[], otherGroupWorkoutIdsSameDay: string[]) {
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

  async function saveSingleWorkout(index: number) {
    if (!dateKey || index < 0 || index >= coachWorkouts.length) return;
    const workout = coachWorkouts[index];
    setEditingWorkoutIndex(null);
    setEditingWorkoutSnapshot(null);
    setLoading(true);
    setSaved(false);
    let savedId: string | undefined = workout.id;

    if (workout.id) {
      const { error } = await supabase
        .from("workouts")
        .update({
          content: workout.content,
          session: workout.session || null,
          workout_category: workout.workout_category,
          assigned_to: workout.assigned_to,
          assigned_to_group: workout.assigned_to_group,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workout.id);
      if (error) { alert(error.message); setLoading(false); return; }
    } else {
      const { data: inserted, error } = await supabase
        .from("workouts")
        .insert({
          date: dateKey,
          content: workout.content,
          session: workout.session || null,
          workout_category: workout.workout_category,
          assigned_to: workout.assigned_to ?? null,
          assigned_to_group: workout.assigned_to_group ?? null,
        })
        .select()
        .single();
      if (error) { alert(error.message); setLoading(false); return; }
      savedId = inserted?.id;
      setCoachWorkouts((prev) =>
        prev.map((w, i) => (i === index ? { ...inserted, date: normDate(inserted?.date) ?? dateKey, assignee_ids: (w as Workout).assignee_ids } : w))
      );
    }

    if (workout.assigned_to_group && savedId) {
      const tf = getTimeframe(workout);
      const otherIds = coachWorkouts.filter((w) => w.id && w.assigned_to_group && w.id !== workout.id && getTimeframe(w) === tf).map((w) => w.id!);
      try {
        await saveAssigneesForGroupWorkout(savedId, workout.assignee_ids ?? [], otherIds);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to save assignees");
        setLoading(false);
        return;
      }
      for (const w of coachWorkouts) {
        if (!w.assigned_to_group || !w.id || w.id === workout.id) continue;
        const tfW = getTimeframe(w);
        const otherIdsForW = coachWorkouts.filter((x) => x.id && x.assigned_to_group && x.id !== w.id && getTimeframe(x) === tfW).map((x) => x.id!);
        try {
          await saveAssigneesForGroupWorkout(w.id, w.assignee_ids ?? [], otherIdsForW);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Failed to save assignees");
          setLoading(false);
          return;
        }
      }
    }

    const { data: rows } = await supabase
      .from("workouts")
      .select("*")
      .eq("date", dateKey)
      .order("created_at", { ascending: true });

    let merged = (rows ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey }));
    const groupIds = merged.filter((w) => w.assigned_to_group).map((w) => w.id);
    if (groupIds.length > 0) {
      const assigneesMap = await fetchAssigneesForWorkouts(groupIds);
      merged = mergeAssigneesIntoWorkouts(merged, assigneesMap, swimmers);
    }
    setCoachWorkouts(merged);
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function deleteSingleWorkout(index: number) {
    if (!dateKey || index < 0 || index >= coachWorkouts.length) return;
    const workout = coachWorkouts[index];
    if (!confirm("Delete this workout?")) return;
    setLoading(true);

    if (workout.id) {
      const { error } = await supabase.from("workouts").delete().eq("id", workout.id);
      if (error) { alert(error.message); setLoading(false); return; }
    }

    setCoachWorkouts((prev) => prev.filter((_, i) => i !== index));
    setEditingWorkoutIndex(null);
    setEditingWorkoutSnapshot(null);
    setLoading(false);
  }

  async function deleteAllWorkouts() {
    if (!dateKey || !confirm("Delete all workouts for this day?")) return;
    setLoading(true);
    const { data: existing } = await supabase.from("workouts").select("id").eq("date", dateKey);
    const toDelete = (existing ?? []).map((w) => w.id);
    if (toDelete.length > 0) {
      const { error } = await supabase.from("workouts").delete().in("id", toDelete);
      if (error) { alert(error.message); setLoading(false); return; }
    }
    setCoachWorkouts([]);
    setLoading(false);
  }

  function addCoachWorkout() {
    const newWorkout = {
      id: "",
      date: dateKey,
      content: "",
      session: null,
      workout_category: null,
      assigned_to: selectedCoachSwimmerId ?? null,
      assigned_to_group: null,
    };
    setCoachWorkouts((prev) => [...prev, newWorkout]);
    setEditingWorkoutSnapshot(null);
    setEditingWorkoutIndex(coachWorkouts.length);
  }

  function updateCoachWorkout(index: number, updates: Partial<Workout>) {
    setCoachWorkouts((prev) => {
      let next = prev.map((w, i) => (i === index ? { ...w, ...updates } : w));
      if (updates.assignee_ids && prev[index]?.assigned_to_group) {
        const addedIds = updates.assignee_ids;
        const currentTf = getTimeframe(prev[index]!);
        next = next.map((w, i) => {
          if (i === index) return next[index];
          if (w.assigned_to_group && w.assignee_ids?.length && getTimeframe(w) === currentTf) {
            return { ...w, assignee_ids: w.assignee_ids.filter((id) => !addedIds.includes(id)) };
          }
          return w;
        });
      }
      return next;
    });
  }

  function resetAssigneesToGroup(originalIdx: number) {
    const workout = coachWorkouts[originalIdx];
    if (!workout?.assigned_to_group) return;
    const defaultGroupIds = swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
    setCoachWorkouts((prev) =>
      prev.map((w, i) => {
        if (i === originalIdx) return { ...w, assignee_ids: defaultGroupIds };
        if (w.assigned_to_group) {
          const currentIds = Array.isArray(w.assignee_ids) ? w.assignee_ids : swimmers.filter((s) => s.swimmer_group === w.assigned_to_group).map((s) => s.id);
          return { ...w, assignee_ids: currentIds.filter((id) => !defaultGroupIds.includes(id)) };
        }
        return w;
      })
    );
  }

  function removeCoachWorkout(index: number) {
    setCoachWorkouts((prev) => prev.filter((_, i) => i !== index));
  }

  function startEditingWorkout(index: number) {
    const w = coachWorkouts[index];
    setEditingWorkoutSnapshot(w ? { ...w, assignee_ids: w.assignee_ids ? [...w.assignee_ids] : undefined } : null);
    setEditingWorkoutIndex(index);
  }

  function cancelEditingWorkout() {
    const idx = editingWorkoutIndex;
    const snap = editingWorkoutSnapshot;
    setEditingWorkoutIndex(null);
    setEditingWorkoutSnapshot(null);
    if (idx !== null && snap != null) {
      setCoachWorkouts((prev) => prev.map((w, i) => (i === idx ? snap : w)));
    } else if (idx !== null && coachWorkouts[idx] && !coachWorkouts[idx].id) {
      setCoachWorkouts((prev) => prev.filter((_, i) => i !== idx));
    }
  }

  const changeDate = (delta: number) => {
    if (viewMode === "day") {
      setSelectedDate((d) => (delta > 0 ? addDays(d, 1) : subDays(d, 1)));
    } else if (viewMode === "week") {
      setExpandedDayKey(null);
      setSelectedDate((d) => (delta > 0 ? addWeeks(d, 1) : subWeeks(d, 1)));
    } else {
      setExpandedWeekKey(null);
      setExpandedMonthDayKey(null);
      setSelectedDate((d) => (delta > 0 ? addMonths(d, 1) : subMonths(d, 1)));
    }
  };

  const getDateBarLabel = () => {
    if (viewMode === "day") return format(selectedDate, "EEE, MMM d");
    if (viewMode === "week") {
      const wStart = startOfWeek(selectedDate, { weekStartsOn });
      const wEnd = endOfWeek(selectedDate, { weekStartsOn });
      return `${format(wStart, "MMM d")} – ${format(wEnd, "MMM d")}`;
    }
    return format(selectedDate, "MMMM yyyy");
  };

  const goToDayAndEdit = (day: Date) => {
    setSelectedDate(day);
    setViewMode("day");
  };

  const goToDayAndAddWorkout = (day: Date) => {
    addWorkoutForDateRef.current = format(day, "yyyy-MM-dd");
    setSelectedDate(day);
    setViewMode("day");
  };

  const handleMonthCalendarSelect = (date: Date) => {
    if (!date) return;
    setSelectedDate(date);
    setExpandedWeekKey(format(startOfWeek(date, { weekStartsOn }), "yyyy-MM-dd"));
    setExpandedMonthDayKey(format(date, "yyyy-MM-dd"));
  };

  const DateToggleBar = () => (
    <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
      <Button
        variant="ghost"
        size="icon"
        className="size-10 shrink-0"
        onClick={() => changeDate(-1)}
      >
        <ChevronLeft className="size-5" />
        <span className="sr-only">Previous</span>
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="min-w-0 flex-1 gap-2 font-medium">
            <CalendarIcon className="size-4 shrink-0" />
            <span className="truncate">{getDateBarLabel()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => d && handleMonthCalendarSelect(d)}
            weekStartsOn={weekStartsOn}
          />
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon"
        className="size-10 shrink-0"
        onClick={() => changeDate(1)}
      >
        <ChevronRight className="size-5" />
        <span className="sr-only">Next</span>
      </Button>
    </div>
  );

  const ViewToggle = () => (
    <div className="mb-3 flex gap-1 rounded-lg border bg-card p-1">
      <Button
        variant={viewMode === "day" ? "secondary" : "ghost"}
        size="sm"
        className="flex-1 gap-1.5 text-xs"
        onClick={() => setViewMode("day")}
      >
        <CalendarIcon className="size-3.5" />
        Day
      </Button>
      <Button
        variant={viewMode === "week" ? "secondary" : "ghost"}
        size="sm"
        className="flex-1 gap-1.5 text-xs"
        onClick={() => setViewMode("week")}
      >
        <CalendarDays className="size-3.5" />
        Week
      </Button>
      <Button
        variant={viewMode === "month" ? "secondary" : "ghost"}
        size="sm"
        className="flex-1 gap-1.5 text-xs"
        onClick={() => setViewMode("month")}
      >
        <CalendarRange className="size-3.5" />
        Month
      </Button>
    </div>
  );

  // Show spinner while auth resolves
  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Not logged in — redirect handled by useEffect above
  if (!user) return null;

  // Logged in but no profile row yet (migration not applied, or trigger failed)
  if (!role) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3">
          <p className="font-medium">Setting up your account…</p>
          <p className="text-sm text-muted-foreground">
            If this persists, the database migration may not have been applied yet.
            Try signing out and back in.
          </p>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-md flex-col px-5 py-5 w-full min-w-0">
        {/* Header */}
        <div className="mb-5 flex w-full min-w-0 items-center justify-between gap-2">
          <h1 className="flex shrink-0 items-center gap-2 text-2xl font-bold">
            <Waves className="size-7 text-primary" />
            FlipTurn
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            {role === "swimmer" && swimmers.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 px-2 text-xs font-medium">
                    {selectedViewSwimmerId === ALL_GROUPS_ID ? "All Groups" : (selectedViewSwimmerId ? swimmers.find((s) => s.id === selectedViewSwimmerId)?.full_name ?? "Swimmer" : (profile?.full_name ?? "My workouts"))}
                    <ChevronDown className="size-3.5 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[10rem]">
                  <DropdownMenuItem onClick={() => setSelectedViewSwimmerId(null)}>{profile?.full_name ?? "My workouts"}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedViewSwimmerId(ALL_GROUPS_ID)}>All Groups</DropdownMenuItem>
                  {swimmers.filter((s) => s.id !== user?.id).map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => setSelectedViewSwimmerId(s.id)}>
                      {s.full_name ?? s.id}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : role === "coach" && swimmers.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 px-2 text-xs font-medium">
                    {selectedCoachSwimmerId ? swimmers.find((s) => s.id === selectedCoachSwimmerId)?.full_name ?? "Swimmer" : "All swimmers"}
                    <ChevronDown className="size-3.5 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[10rem]">
                  <DropdownMenuItem onClick={() => setSelectedCoachSwimmerId(null)}>All swimmers</DropdownMenuItem>
                  {swimmers.map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => setSelectedCoachSwimmerId(s.id)}>
                      {s.full_name ?? s.id}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-2 text-xs font-medium capitalize text-muted-foreground">
                {profile?.full_name ?? role}
              </span>
            )}
            <ThemeToggle />
            <Link href="/settings">
              <Button variant="ghost" size="icon" className="size-9" aria-label="Settings">
                <Settings className="size-5" />
              </Button>
            </Link>
            <SignOutDropdown
              trigger={
                <Button variant="ghost" size="icon" className="size-9" aria-label="Sign out">
                  <LogOut className="size-5" />
                </Button>
              }
            />
          </div>
        </div>

        {/* Swimmer view */}
        {role === "swimmer" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <DateToggleBar />
            <ViewToggle />

            {viewMode === "day" && (
              <div className="flex flex-1 flex-col">
                {swimmerLoading ? (
                  <div className="flex flex-1 items-center justify-center py-12">
                    <p className="text-muted-foreground">Loading...</p>
                  </div>
                ) : viewWorkouts.length > 0 ? (
                  <div className="space-y-4">
                    {viewWorkouts.map((workout, i) => {
                      const label = assignmentLabel(workout, swimmers);
                      return (
                        <Card key={workout.id || i} className="py-4">
                          <CardContent className="px-4 py-0">
                            <WorkoutBlock
                              workout={workout}
                              dateKey={dateKey}
                              showLabel
                              feedbackRefreshKey={feedbackRefreshKey}
                              onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                              assigneeLabel={label}
                              teammateNames={teammateNames(workout, swimmers, user?.id)}
                            />
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                    <p className="text-muted-foreground">No workout planned for this day.</p>
                  </div>
                )}
              </div>
            )}

            {viewMode === "week" && (
              <div className="flex flex-1 flex-col gap-1">
                {rangeLoading ? (
                  <div className="flex flex-1 items-center justify-center py-8">
                    <p className="text-muted-foreground">Loading...</p>
                  </div>
                ) : (
                  (() => {
                    const weekStart = startOfWeek(selectedDate, { weekStartsOn });
                    const days = eachDayOfInterval({
                      start: weekStart,
                      end: endOfWeek(selectedDate, { weekStartsOn }),
                    });
                    return days.map((day) => {
                      const dayKey = format(day, "yyyy-MM-dd");
                      const dayWorkouts = weekWorkouts.filter((w) => normDate(w.date) === dayKey);
                      const isExpanded = expandedDayKey === dayKey;
                      return (
                        <Card
                          key={day.toISOString()}
                          className={`overflow-hidden ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between p-2 text-left transition-colors hover:bg-accent/50"
                              onClick={() => {
                                setExpandedDayKey(isExpanded ? null : dayKey);
                                setSelectedDate(day);
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                                  {format(day, "EEE, MMM d")}
                                </p>
                                {dayWorkouts.length > 0 ? (
                                  <div className="space-y-0.5 font-sans text-xs text-muted-foreground">
                                    {dayWorkouts.map((w, wi) => (
                                      <p key={wi} className="truncate">{dayPreviewLabel(w, swimmers, swimmerPreviewDefault(selectedViewSwimmerId, profile, user?.id, swimmers))}</p>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No workout</p>
                                )}
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="size-3.5 shrink-0 text-muted-foreground ml-1" />
                              ) : (
                                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground ml-1" />
                              )}
                            </button>
                            {isExpanded && dayWorkouts.length > 0 && (
                              <div className="animate-in slide-in-from-top-2 border-t px-2 py-1.5 duration-200 space-y-1.5">
                                {dayWorkouts.map((workout, i) => {
                                  const label = assignmentLabel(workout, swimmers);
                                  return (
                                    <WorkoutBlock
                                      key={workout.id || i}
                                      workout={workout}
                                      dateKey={dayKey}
                                      showLabel
                                      feedbackRefreshKey={feedbackRefreshKey}
                                      onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                                      className="mt-1"
                                      compact
                                      assigneeLabel={label}
                                      teammateNames={teammateNames(workout, swimmers, user?.id)}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </Card>
                        );
                      });
                    })()
                )}
              </div>
            )}

            {viewMode === "month" && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                <Card className="min-h-[28rem] shrink-0 w-full overflow-hidden">
                  <CardContent className="p-0 w-full">
                    <Calendar
                      className="w-full min-w-0 p-1.5 [--cell-size:1.25rem]"
                      classNames={{ week: "mt-0 flex w-full h-14", month: "flex w-full flex-col gap-2" }}
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => d && handleMonthCalendarSelect(d)}
                      month={selectedDate}
                      weekStartsOn={weekStartsOn}
                      onMonthChange={(d) => {
                        setSelectedDate(d);
                        setExpandedWeekKey(null);
                        setExpandedMonthDayKey(null);
                      }}
                      modifiers={(() => {
                        const countByDate: Record<string, number> = {};
                        for (const w of monthWorkouts) {
                          const d = normDate(w.date);
                          if (d) countByDate[d] = (countByDate[d] || 0) + 1;
                        }
                        return {
                          workoutDots1: Object.entries(countByDate).filter(([, c]) => c === 1).map(([d]) => new Date(d + "T12:00:00")),
                          workoutDots2: Object.entries(countByDate).filter(([, c]) => c >= 2).map(([d]) => new Date(d + "T12:00:00")),
                        };
                      })()}
                      modifiersClassNames={{
                        workoutDots1: "relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:size-1.5 after:rounded-full after:bg-primary",
                        workoutDots2: "relative before:content-[''] before:absolute before:bottom-0.5 before:left-[calc(50%-6px)] before:size-1.5 before:rounded-full before:bg-primary after:content-[''] after:absolute after:bottom-0.5 after:left-[calc(50%+2px)] after:size-1.5 after:rounded-full after:bg-primary",
                      }}
                    />
                  </CardContent>
                </Card>
                <div className="flex flex-1 flex-col gap-2">
                  {rangeLoading ? (
                    <p className="text-muted-foreground">Loading...</p>
                  ) : (
                    (() => {
                      const monthStart = startOfMonth(selectedDate);
                      const monthEnd = endOfMonth(selectedDate);
                      const weeks: { start: Date; end: Date; key: string }[] = [];
                      let weekStart = startOfWeek(monthStart, { weekStartsOn });
                      while (weekStart <= monthEnd) {
                        const weekEnd = endOfWeek(weekStart, { weekStartsOn });
                        weeks.push({ start: weekStart, end: weekEnd, key: format(weekStart, "yyyy-MM-dd") });
                        weekStart = addDays(weekEnd, 1);
                      }
                      return weeks.map(({ start, end, key }) => {
                        const weekWorkoutsList = monthWorkouts.filter((w) =>
                          isWithinInterval(new Date(w.date + "T12:00:00"), { start, end })
                        );
                        const workoutCount = weekWorkoutsList.length;
                        const isExpanded = expandedWeekKey === key;
                        return (
                          <div key={key} className="rounded-lg border bg-card overflow-hidden">
                            <button
                              type="button"
                              className="flex w-full items-center justify-between px-3 py-2 text-left"
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedWeekKey(null);
                                  setExpandedMonthDayKey(null);
                                } else {
                                  setExpandedWeekKey(key);
                                  setExpandedMonthDayKey(null);
                                }
                              }}
                            >
                              <span className="text-xs font-medium">
                                Week {weeks.findIndex((w) => w.key === key) + 1}: {format(start, "MMM d")}–{format(end, "MMM d")}
                              </span>
                              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                {workoutCount} workout{workoutCount !== 1 ? "s" : ""}
                                {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="animate-in slide-in-from-top-2 border-t px-3 py-2 space-y-1.5 duration-200">
                                {(() => {
                                  const daysInWeek = eachDayOfInterval({ start, end });
                                  return daysInWeek.map((day) => {
                                    const dayKey = format(day, "yyyy-MM-dd");
                                    const dayWorkouts = weekWorkoutsList.filter((w) => normDate(w.date) === dayKey);
                                    const isDayExpanded = expandedMonthDayKey === dayKey;
                                    return (
                                      <div key={dayKey} className="rounded-lg border bg-card overflow-hidden">
                                        <button
                                          type="button"
                                          className="flex w-full items-center justify-between p-2 text-left transition-colors hover:bg-accent/50"
                                          onClick={() => {
                                            setExpandedMonthDayKey(isDayExpanded ? null : dayKey);
                                            setSelectedDate(day);
                                          }}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                                              {format(day, "EEE, MMM d")}
                                            </p>
                                            {dayWorkouts.length > 0 ? (
                                              <div className="space-y-0.5 font-sans text-xs text-muted-foreground">
                                                {dayWorkouts.map((w, wi) => (
                                                  <p key={wi}>{dayPreviewLabel(w, swimmers, swimmerPreviewDefault(selectedViewSwimmerId, profile, user?.id, swimmers))}</p>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="text-xs text-muted-foreground">No workout</p>
                                            )}
                                          </div>
                                          {isDayExpanded ? (
                                            <ChevronUp className="size-4 shrink-0 text-muted-foreground ml-2" />
                                          ) : (
                                            <ChevronDown className="size-4 shrink-0 text-muted-foreground ml-2" />
                                          )}
                                        </button>
                                        {isDayExpanded && (
                                          <div className="animate-in slide-in-from-top-2 border-t px-2 py-1.5 duration-200 space-y-2">
                                            {dayWorkouts.length > 0 ? (
                                              dayWorkouts.map((workout, i) => {
                                                const label = assignmentLabel(workout, swimmers);
                                                return (
                                                  <WorkoutBlock
                                                    key={workout.id || i}
                                                    workout={workout}
                                                    dateKey={dayKey}
                                                    showLabel
                                                    feedbackRefreshKey={feedbackRefreshKey}
                                                    onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                                                    className="mt-2"
                                                    compact
                                                    assigneeLabel={label}
                                                    teammateNames={teammateNames(workout, swimmers, user?.id)}
                                                  />
                                                );
                                              })
                                            ) : (
                                              <p className="text-sm text-muted-foreground">No workout</p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Coach view */}
        {role === "coach" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <DateToggleBar />
            <ViewToggle />

            {viewMode === "day" && (
              <Card className="flex flex-1 flex-col py-4">
                <CardContent className="flex flex-1 flex-col gap-4 px-4 py-0">
                  {coachLoading ? (
                    <div className="flex flex-1 items-center justify-center py-12">
                      <p className="text-muted-foreground">Loading...</p>
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col gap-4">
                      {coachWorkouts.length > 0 ? (
                        (() => {
                          function swimmerIdsInTimeframeExcluding(workoutIdx: number): Set<string> {
                            const w = coachWorkouts[workoutIdx];
                            const tf = getTimeframe(w);
                            const out = new Set<string>();
                            coachWorkouts.forEach((ow, i) => {
                              if (i === workoutIdx) return;
                              if (getTimeframe(ow) !== tf) return;
                              if (ow.assigned_to && !ow.assigned_to_group) out.add(ow.assigned_to);
                              else if (ow.assigned_to_group) {
                                const ids = ow.assignee_ids?.length ? ow.assignee_ids : swimmers.filter((s) => s.swimmer_group === ow.assigned_to_group).map((s) => s.id);
                                ids.forEach((id) => out.add(id));
                              }
                            });
                            return out;
                          }
                          const displayWorkouts = editingWorkoutIndex !== null
                          ? coachWorkouts
                          : sortCoachWorkouts(coachWorkouts, swimmers);
                        return displayWorkouts.map((workout) => {
                          const originalIdx = coachWorkouts.indexOf(workout);
                          const label = assignmentLabel(workout, swimmers);
                          const isEditing = editingWorkoutIndex === originalIdx;
                          return (
                            <Card key={workout.id || `new-${originalIdx}`} className="relative py-4">
                              {isEditing ? (
                                <CardContent className="pl-4 pr-4 py-0">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap gap-2">
                                      <select
                                        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={
                                          workout.assigned_to
                                            ? `swimmer:${workout.assigned_to}`
                                            : workout.assigned_to_group
                                              ? `group:${workout.assigned_to_group}`
                                              : ""
                                        }
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (v.startsWith("swimmer:")) {
                                            const id = v.slice(8) || null;
                                            updateCoachWorkout(originalIdx, { assigned_to: id, assigned_to_group: null, assignee_ids: undefined });
                                          } else if (v.startsWith("group:")) {
                                            const g = v.slice(6) as SwimmerGroup;
                                            updateCoachWorkout(originalIdx, { assigned_to: null, assigned_to_group: g, assignee_ids: undefined });
                                          } else {
                                            updateCoachWorkout(originalIdx, { assigned_to: null, assigned_to_group: null, assignee_ids: undefined });
                                          }
                                        }}
                                      >
                                        <option value="">Assign to...</option>
                                        <optgroup label="Swimmer">
                                          {swimmers.map((s) => (
                                            <option key={s.id} value={`swimmer:${s.id}`}>{s.full_name || s.id}</option>
                                          ))}
                                        </optgroup>
                                        <optgroup label="Group">
                                          {SWIMMER_GROUPS.map((g) => (
                                            <option key={g} value={`group:${g}`}>{g}</option>
                                          ))}
                                        </optgroup>
                                      </select>
                                      <select
                                        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={workout.session || ""}
                                        onChange={(e) => updateCoachWorkout(originalIdx, { session: e.target.value || null })}
                                      >
                                        {SESSION_OPTIONS.map((v) => (
                                          <option key={v || "any"} value={v}>{v || "Anytime"}</option>
                                        ))}
                                      </select>
                                      <select
                                        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={workout.workout_category || ""}
                                        onChange={(e) => updateCoachWorkout(originalIdx, { workout_category: e.target.value || null })}
                                      >
                                        {WORKOUT_CATEGORIES.map((v) => (
                                          <option key={v || "empty"} value={v}>{v || "Category"}</option>
                                        ))}
                                      </select>
                                    </div>
                                    {workout.assigned_to_group && (
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <p className="text-xs font-medium text-muted-foreground">Swimmers in this workout</p>
                                          <button
                                            type="button"
                                            onClick={() => resetAssigneesToGroup(originalIdx)}
                                            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            title="Reset to default group"
                                            aria-label="Reset swimmers to group default"
                                          >
                                            <RotateCcw className="size-3.5" />
                                          </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {(() => {
                                            const conflictIds = swimmerIdsInTimeframeExcluding(originalIdx);
                                            return [...swimmers]
                                            .sort((a, b) => {
                                              const groupOrder = (g: SwimmerGroup | null | undefined) =>
                                                g === workout.assigned_to_group ? 0 : g == null ? 4 : COACH_GROUP_ORDER.indexOf(g as (typeof COACH_GROUP_ORDER)[number]) + 1;
                                              const ga = groupOrder(a.swimmer_group);
                                              const gb = groupOrder(b.swimmer_group);
                                              if (ga !== gb) return ga - gb;
                                              return (a.full_name ?? "").localeCompare(b.full_name ?? "");
                                            })
                                            .map((s) => {
                                            const defaultGroupIds = swimmers.filter((x) => x.swimmer_group === workout.assigned_to_group).map((x) => x.id);
                                            const currentIds = Array.isArray(workout.assignee_ids) ? workout.assignee_ids : defaultGroupIds;
                                            const isIn = currentIds.includes(s.id);
                                            const hasConflict = conflictIds.has(s.id);
                                            const canAdd = !hasConflict || isIn;
                                            return (
                                              <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => {
                                                  if (isIn) {
                                                    updateCoachWorkout(originalIdx, { assignee_ids: currentIds.filter((id) => id !== s.id) });
                                                  } else if (canAdd) {
                                                    updateCoachWorkout(originalIdx, { assignee_ids: [...currentIds, s.id] });
                                                  }
                                                }}
                                                title={hasConflict ? "This swimmer has another workout in the same timeframe (AM/PM/Anytime)" : undefined}
                                                className={
                                                  hasConflict
                                                    ? "rounded-md border border-red-400/80 bg-red-400/10 text-red-800 dark:text-red-200 dark:bg-red-500/15 cursor-not-allowed inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-red-400/20 hover:border-red-500/90 dark:hover:bg-red-500/25"
                                                    : isIn
                                                      ? "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1 border-primary bg-primary/10 text-primary hover:bg-primary/20"
                                                      : "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1 border-input bg-background text-muted-foreground hover:bg-accent disabled:opacity-50"
                                                }
                                              >
                                                {hasConflict && <AlertCircle className="size-3.5 shrink-0" aria-hidden />}
                                                {s.full_name || s.id.slice(0, 8)}
                                              </button>
                                            );
                                          });
                                        })()}
                                        </div>
                                      </div>
                                    )}
                                    <Textarea
                                      placeholder="Warm-up: 200 free, 4×50 kick...
Main set: 8×100 @ 1:30...
Cool-down: 200 easy"
                                      value={workout.content}
                                      onChange={(e) => updateCoachWorkout(originalIdx, { content: e.target.value })}
                                      className="min-h-[200px] resize-none"
                                    />
                                    {workout.content && (
                                      <WorkoutAnalysis
                                        content={workout.content}
                                        date={dateKey}
                                        workoutId={workout.id || undefined}
                                        refreshKey={feedbackRefreshKey}
                                        viewerRole="coach"
                                      />
                                    )}
                                    <div className="flex gap-2 pt-2">
                                      <Button type="button" size="sm" onClick={() => saveSingleWorkout(originalIdx)} disabled={loading || coachLoading}>
                                        {saved ? "Saved ✓" : "Save"}
                                      </Button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          cancelEditingWorkout();
                                        }}
                                        disabled={loading}
                                        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                                      >
                                        Cancel
                                      </button>
                                      <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => deleteSingleWorkout(originalIdx)} disabled={loading}>
                                        Delete
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-2 top-2 size-8 z-10"
                                    onClick={() => startEditingWorkout(originalIdx)}
                                    aria-label="Edit workout"
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                  <CardContent className="pl-4 pr-12 py-0">
                                    <WorkoutBlock
                                      workout={workout}
                                      dateKey={dateKey}
                                      showLabel={coachWorkouts.length > 1}
                                      assigneeLabel={label}
                                      assigneeNames={assignedToNames(workout, swimmers, Array.from(swimmerIdsInTimeframeExcluding(originalIdx)))}
                                      feedbackRefreshKey={feedbackRefreshKey}
                                      onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                                      readOnly
                                    />
                                  </CardContent>
                                </>
                              )}
                            </Card>
                          );
                        });
                        })()
                      ) : null}
                      <div className="flex justify-center pt-2">
                        <Button variant="outline" size="icon" onClick={addCoachWorkout} className="size-10" aria-label="Add workout">
                          <Plus className="size-5" />
                        </Button>
                      </div>
                      {coachWorkouts.length === 0 && (
                        <p className="text-center text-muted-foreground py-4">No workout planned for this day.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {viewMode === "week" && (
              <div className="flex flex-1 flex-col gap-1">
                {rangeLoading ? (
                  <div className="flex flex-1 items-center justify-center py-8">
                    <p className="text-muted-foreground">Loading...</p>
                  </div>
                ) : (
                  (() => {
                    const weekStart = startOfWeek(selectedDate, { weekStartsOn });
                    const days = eachDayOfInterval({
                      start: weekStart,
                      end: endOfWeek(selectedDate, { weekStartsOn }),
                    });
                    return days.map((day) => {
                      const dayKey = format(day, "yyyy-MM-dd");
                      const dayWorkouts = sortCoachWorkouts(weekWorkouts.filter((w) => normDate(w.date) === dayKey), swimmers);
                      const isExpanded = expandedDayKey === dayKey;
                      return (
                        <Card
                          key={day.toISOString()}
                          className={`overflow-hidden ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between p-2 text-left transition-colors hover:bg-accent/50"
                              onClick={() => {
                                setExpandedDayKey(isExpanded ? null : dayKey);
                                setSelectedDate(day);
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                                  {format(day, "EEE, MMM d")}
                                </p>
                                {dayWorkouts.length > 0 ? (
                                  <div className="space-y-0.5 font-sans text-xs text-muted-foreground">
                                    {dayWorkouts.map((w, wi) => (
                                      <p key={wi} className="truncate">
                                        {dayPreviewLabel(w, swimmers, selectedCoachSwimmerId ? swimmers.find((s) => s.id === selectedCoachSwimmerId)?.full_name : undefined)}
                                      </p>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No workout</p>
                                )}
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="size-3.5 shrink-0 text-muted-foreground ml-1" />
                              ) : (
                                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground ml-1" />
                              )}
                            </button>
                            {isExpanded && (
                              <div className="animate-in slide-in-from-top-2 border-t px-2 py-1.5 duration-200 space-y-1.5">
                                {dayWorkouts.length > 0 ? (
                                  <>
                                    {dayWorkouts.map((workout, i) => {
                                      const label = assignmentLabel(workout, swimmers);
                                      return (
                                        <WorkoutBlock
                                          key={workout.id || i}
                                          workout={workout}
                                          dateKey={dayKey}
                                          showLabel={dayWorkouts.length > 1}
                                          feedbackRefreshKey={feedbackRefreshKey}
                                          className="mt-1"
                                          compact
                                          readOnly
                                          assigneeLabel={label}
                                          assigneeNames={assignedToNames(workout, swimmers, [...new Set(dayWorkouts.filter((w) => w.id !== workout.id && getTimeframe(w) === getTimeframe(workout)).flatMap((w) => w.assigned_to && !w.assigned_to_group ? [w.assigned_to] : (w.assignee_ids ?? [])))])}
                                        />
                                      );
                                    })}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="gap-2"
                                      onClick={() => goToDayAndEdit(day)}
                                    >
                                      <Pencil className="size-4" />
                                      Edit day
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => goToDayAndAddWorkout(day)}
                                  >
                                    <Plus className="size-4" />
                                    Add workout
                                  </Button>
                                )}
                              </div>
                            )}
                          </Card>
                        );
                      });
                    })()
                )}
              </div>
            )}

            {viewMode === "month" && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                <Card className="min-h-[28rem] shrink-0 w-full overflow-hidden">
                  <CardContent className="p-0 w-full">
                    <Calendar
                      className="w-full min-w-0 p-1.5 [--cell-size:1.25rem]"
                      classNames={{ week: "mt-0 flex w-full h-14", month: "flex w-full flex-col gap-2" }}
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => d && handleMonthCalendarSelect(d)}
                      month={selectedDate}
                      weekStartsOn={weekStartsOn}
                      onMonthChange={(d) => {
                        setSelectedDate(d);
                        setExpandedWeekKey(null);
                        setExpandedMonthDayKey(null);
                      }}
                      modifiers={(() => {
                        const countByDate: Record<string, number> = {};
                        for (const w of monthWorkouts) {
                          const d = normDate(w.date);
                          if (d) countByDate[d] = (countByDate[d] || 0) + 1;
                        }
                        return {
                          workoutDots1: Object.entries(countByDate).filter(([, c]) => c === 1).map(([d]) => new Date(d + "T12:00:00")),
                          workoutDots2: Object.entries(countByDate).filter(([, c]) => c >= 2).map(([d]) => new Date(d + "T12:00:00")),
                        };
                      })()}
                      modifiersClassNames={{
                        workoutDots1: "relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:size-1.5 after:rounded-full after:bg-primary",
                        workoutDots2: "relative before:content-[''] before:absolute before:bottom-0.5 before:left-[calc(50%-6px)] before:size-1.5 before:rounded-full before:bg-primary after:content-[''] after:absolute after:bottom-0.5 after:left-[calc(50%+2px)] after:size-1.5 after:rounded-full after:bg-primary",
                      }}
                    />
                  </CardContent>
                </Card>
                <div className="flex flex-1 flex-col gap-2">
                  {rangeLoading ? (
                    <p className="text-muted-foreground">Loading...</p>
                  ) : (
                    (() => {
                      const monthStart = startOfMonth(selectedDate);
                      const monthEnd = endOfMonth(selectedDate);
                      const weeks: { start: Date; end: Date; key: string }[] = [];
                      let weekStart = startOfWeek(monthStart, { weekStartsOn });
                      while (weekStart <= monthEnd) {
                        const weekEnd = endOfWeek(weekStart, { weekStartsOn });
                        weeks.push({ start: weekStart, end: weekEnd, key: format(weekStart, "yyyy-MM-dd") });
                        weekStart = addDays(weekEnd, 1);
                      }
                      return weeks.map(({ start, end, key }) => {
                        const weekWorkoutsList = monthWorkouts.filter((w) =>
                          isWithinInterval(new Date(w.date + "T12:00:00"), { start, end })
                        );
                        const workoutCount = weekWorkoutsList.length;
                        const isExpanded = expandedWeekKey === key;
                        return (
                          <div key={key} className="rounded-lg border bg-card overflow-hidden">
                            <button
                              type="button"
                              className="flex w-full items-center justify-between px-3 py-2 text-left"
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedWeekKey(null);
                                  setExpandedMonthDayKey(null);
                                } else {
                                  setExpandedWeekKey(key);
                                  setExpandedMonthDayKey(null);
                                }
                              }}
                            >
                              <span className="text-xs font-medium">
                                Week {weeks.findIndex((w) => w.key === key) + 1}: {format(start, "MMM d")}–{format(end, "MMM d")}
                              </span>
                              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                {workoutCount} workout{workoutCount !== 1 ? "s" : ""}
                                {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="animate-in slide-in-from-top-2 border-t px-3 py-2 space-y-1.5 duration-200">
                                {(() => {
                                  const daysInWeek = eachDayOfInterval({ start, end });
                                  return daysInWeek.map((day) => {
                                    const dayKey = format(day, "yyyy-MM-dd");
                                    const dayWorkouts = sortCoachWorkouts(weekWorkoutsList.filter((w) => normDate(w.date) === dayKey), swimmers);
                                    const isDayExpanded = expandedMonthDayKey === dayKey;
                                    return (
                                      <div key={dayKey} className="rounded-lg border bg-card overflow-hidden">
                                        <button
                                          type="button"
                                          className="flex w-full items-center justify-between p-2 text-left transition-colors hover:bg-accent/50"
                                          onClick={() => {
                                            setExpandedMonthDayKey(isDayExpanded ? null : dayKey);
                                            setSelectedDate(day);
                                          }}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                                              {format(day, "EEE, MMM d")}
                                            </p>
                                            {dayWorkouts.length > 0 ? (
                                              <div className="space-y-0.5 font-sans text-xs text-muted-foreground">
                                                {dayWorkouts.map((w, wi) => (
                                                  <p key={wi}>
                                                    {dayPreviewLabel(w, swimmers, selectedCoachSwimmerId ? swimmers.find((s) => s.id === selectedCoachSwimmerId)?.full_name : undefined)}
                                                  </p>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="text-xs text-muted-foreground">No workout</p>
                                            )}
                                          </div>
                                          {isDayExpanded ? (
                                            <ChevronUp className="size-4 shrink-0 text-muted-foreground ml-2" />
                                          ) : (
                                            <ChevronDown className="size-4 shrink-0 text-muted-foreground ml-2" />
                                          )}
                                        </button>
                                        {isDayExpanded && (
                                          <div className="animate-in slide-in-from-top-2 border-t px-2 py-1.5 duration-200 space-y-2">
                                            {dayWorkouts.length > 0 ? (
                                              <>
                                                {dayWorkouts.map((workout, i) => {
                                                  const label = assignmentLabel(workout, swimmers);
                                                  return (
                                                    <WorkoutBlock
                                                      key={workout.id || i}
                                                      workout={workout}
                                                      dateKey={dayKey}
                                                      showLabel={dayWorkouts.length > 1}
                                                      feedbackRefreshKey={feedbackRefreshKey}
                                                      className="mt-2"
                                                      compact
                                                      readOnly
                                                      assigneeLabel={label}
                                                      assigneeNames={assignedToNames(workout, swimmers, [...new Set(dayWorkouts.filter((w) => w.id !== workout.id && getTimeframe(w) === getTimeframe(workout)).flatMap((w) => w.assigned_to && !w.assigned_to_group ? [w.assigned_to] : (w.assignee_ids ?? [])))])}
                                                    />
                                                  );
                                                })}
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="gap-2"
                                                  onClick={() => goToDayAndEdit(day)}
                                                >
                                                  <Pencil className="size-4" />
                                                  Edit day
                                                </Button>
                                              </>
                                            ) : (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-2"
                                                onClick={() => goToDayAndAddWorkout(day)}
                                              >
                                                <Plus className="size-4" />
                                                Add workout
                                              </Button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
