"use client";

import { useState, useEffect, useRef } from "react";
import {
  format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isWithinInterval, parseISO,
} from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, CalendarIcon, CalendarDays, CalendarRange,
  ChevronDown, ChevronUp, Settings, Plus, Pencil, LogOut, RotateCcw, AlertCircle,
  Camera, Loader2, Users, BarChart3,
} from "lucide-react";
import { FlipTurnsLogo } from "@/components/flipturns-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkoutAnalysis } from "@/components/workout-analysis";
import { SignOutDropdown } from "@/components/sign-out-dropdown";
import { NotificationBell } from "@/components/notification-bell";
import { usePreferences } from "@/components/preferences-provider";
import { useTranslations } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth-provider";
import type { Workout, SwimmerProfile, ViewMode, SwimmerGroup } from "@/lib/types";
import { SWIMMER_GROUPS, ALL_GROUPS_ID, ALL_ID, ONLY_GROUPS_ID, WORKOUT_CATEGORIES, SESSION_OPTIONS, POOL_SIZE_OPTIONS, normDate, getTimeframe } from "@/lib/types";
import { getCategoryLabel, getPoolLabel, GROUP_KEYS } from "@/lib/i18n";
import {
  loadAndMergeWorkouts, orAssignFilter, filterWorkoutsForSwimmer, sortCoachWorkouts,
  assignmentLabel, assignedToNames, teammateNames, dayPreviewLabel, saveAssigneesForGroupWorkout, saveAssigneesForIndividualWorkout,
} from "@/lib/workouts";

const badgeClass = "inline-flex items-center rounded-full bg-accent-blue/15 px-2.5 py-0.5 text-xs font-medium text-accent-blue";
const badgeClassMuted = "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground";
const WORKOUT_SELECT = "id, date, content, session, workout_category, pool_size, assigned_to, assigned_to_group, created_at, updated_at, created_by";

function WorkoutBlock({
  workout, dateKey, showLabel, feedbackRefreshKey, onFeedbackChange,
  assigneeLabel, assigneeNames: assigneeNamesStr, teammateNames: teammateNamesStr,
  className = "mt-4", readOnly, compact, t,
}: {
  workout: Workout; dateKey: string; showLabel: boolean; feedbackRefreshKey: number;
  onFeedbackChange?: () => void; assigneeLabel?: string | null; assigneeNames?: string | null;
  teammateNames?: string | null; className?: string; readOnly?: boolean; compact?: boolean;
  t: (key: import("@/lib/i18n").TranslationKey) => string;
}) {
  const hasAssignment = workout.assigned_to_group?.trim() || workout.assigned_to;
  const sessionLabel = workout.session?.trim() === "AM" || workout.session?.trim() === "PM" ? workout.session.trim() : t("main.anytime");
  const namesLine = readOnly ? assigneeNamesStr && `${t("main.assignedTo")} ${assigneeNamesStr}` : teammateNamesStr != null && `${t("main.teammates")}: ${teammateNamesStr}`;
  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      <div className="flex items-start justify-between gap-2">
        <div className={`flex flex-wrap items-center gap-1.5 max-md:flex-nowrap max-md:overflow-x-auto max-md:gap-1 max-md:pb-0.5 ${compact ? "mb-1" : "mb-2"}`}>
          {assigneeLabel && <span className={`${badgeClass} max-md:shrink-0 max-md:text-[10px] max-md:px-1.5`}>{assigneeLabel}</span>}
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase max-md:shrink-0 max-md:text-[10px] max-md:px-1.5 ${
            sessionLabel === "AM" ? "bg-amber-400/15 text-amber-600 dark:text-amber-400"
              : sessionLabel === "PM" ? "bg-indigo-400/15 text-indigo-600 dark:text-indigo-400"
                : "bg-muted text-muted-foreground"
          }`}>{sessionLabel}</span>
        </div>
        {(workout.workout_category?.trim() || workout.pool_size) && (
          <div className={`flex flex-wrap justify-end gap-1.5 max-md:flex-nowrap max-md:overflow-x-auto max-md:gap-1 ${compact ? "mb-1" : "mb-2"}`}>
            {workout.pool_size && <span className={`${badgeClassMuted} max-md:shrink-0 max-md:text-[10px] max-md:px-1.5`}>{getPoolLabel(workout.pool_size, t)}</span>}
            {workout.workout_category?.trim() && <span className={`${badgeClassMuted} max-md:shrink-0 max-md:text-[10px] max-md:px-1.5`}>{getCategoryLabel(workout.workout_category.trim(), t)}</span>}
          </div>
        )}
      </div>
      {namesLine && <p className="text-xs text-muted-foreground -mt-1 mb-2 text-right">{namesLine}</p>}
      <pre className={`whitespace-pre-wrap font-sans leading-relaxed text-foreground/90 ${compact ? "text-[14px]" : "text-[15px]"}`}>{workout.content}</pre>
      <WorkoutAnalysis content={workout.content} date={dateKey} workoutId={workout.id} poolSize={workout.pool_size} refreshKey={feedbackRefreshKey}
        onFeedbackChange={onFeedbackChange} className={className} viewerRole={readOnly ? "coach" : "swimmer"} />
    </div>
  );
}

function ExpandableDay({
  day, dayWorkouts, isExpanded, onToggle, previewLabel, renderWorkouts, actions, t, formatDate,
}: {
  day: Date; dayWorkouts: Workout[]; isExpanded: boolean; onToggle: () => void;
  previewLabel: (w: Workout) => string; renderWorkouts: () => React.ReactNode; actions?: React.ReactNode;
  t: (key: import("@/lib/i18n").TranslationKey) => string;
  formatDate: (date: Date, type: import("@/lib/i18n").DateFormatType, endDate?: Date) => string;
}) {
  return (
    <Card className={`overflow-hidden ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}>
      <button type="button" className="flex w-full items-center justify-between p-2 text-left transition-colors hover:bg-accent/50" onClick={onToggle}>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-xs font-medium text-muted-foreground">{formatDate(day, "dateBar")}</p>
          {dayWorkouts.length > 0 ? (
            <div className="space-y-0.5 font-sans text-xs text-muted-foreground">
              {dayWorkouts.map((w, wi) => <p key={wi} className="truncate">{previewLabel(w)}</p>)}
            </div>
          ) : <p className="text-xs text-muted-foreground">{t("main.noWorkout")}</p>}
        </div>
        {isExpanded ? <ChevronUp className="size-3.5 shrink-0 text-muted-foreground ml-1" /> : <ChevronDown className="size-3.5 shrink-0 text-muted-foreground ml-1" />}
      </button>
      {isExpanded && (
        <div className="animate-in slide-in-from-top-2 border-t px-2 py-1.5 duration-200 space-y-1.5">
          {renderWorkouts()}
          {actions}
        </div>
      )}
    </Card>
  );
}

function MonthCalendar({
  selectedDate, weekStartsOn, monthWorkouts, onSelect, onMonthChange,
}: {
  selectedDate: Date; weekStartsOn: 0 | 1; monthWorkouts: Workout[];
  onSelect: (d: Date) => void; onMonthChange: (d: Date) => void;
}) {
  const countByDate: Record<string, number> = {};
  for (const w of monthWorkouts) {
    const d = normDate(w.date);
    if (d) countByDate[d] = (countByDate[d] || 0) + 1;
  }
  return (
    <Card className="min-h-[28rem] shrink-0 w-full overflow-hidden">
      <CardContent className="p-0 w-full">
        <Calendar
          className="w-full min-w-0 p-1.5 [--cell-size:1.25rem]"
          classNames={{ week: "mt-0 flex w-full h-14", month: "flex w-full flex-col gap-2" }}
          mode="single" selected={selectedDate} onSelect={(d) => d && onSelect(d)} month={selectedDate}
          weekStartsOn={weekStartsOn} onMonthChange={onMonthChange}
          modifiers={{
            workoutDots1: Object.entries(countByDate).filter(([, c]) => c === 1).map(([d]) => new Date(d + "T12:00:00")),
            workoutDots2: Object.entries(countByDate).filter(([, c]) => c >= 2).map(([d]) => new Date(d + "T12:00:00")),
          }}
          modifiersClassNames={{
            workoutDots1: "relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:size-1.5 after:rounded-full after:bg-primary",
            workoutDots2: "relative before:content-[''] before:absolute before:bottom-0.5 before:left-[calc(50%-6px)] before:size-1.5 before:rounded-full before:bg-primary after:content-[''] after:absolute after:bottom-0.5 after:left-[calc(50%+2px)] after:size-1.5 after:rounded-full after:bg-primary",
          }}
        />
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const prefs = usePreferences();
  const { t, formatDate } = useTranslations();
  const weekStartsOn = prefs?.weekStartsOn ?? (1 as 0 | 1);
  const defaultPoolSize = prefs?.preferences?.poolSize ?? "LCM";
  const { user, profile, role, signOut, loading: authLoading } = useAuth();
  const swimmerGroup = profile?.role === "swimmer" ? profile?.swimmer_group : null;
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [coachWorkouts, setCoachWorkouts] = useState<Workout[]>([]);
  const [swimmerWorkouts, setSwimmerWorkouts] = useState<Workout[]>([]);
  const [viewWorkouts, setViewWorkouts] = useState<Workout[]>([]);
  const [swimmerLoading, setSwimmerLoading] = useState(false);
  const [swimmerEditingIndex, setSwimmerEditingIndex] = useState<number | null>(null);
  const [swimmerEditingSnapshot, setSwimmerEditingSnapshot] = useState<Workout | null>(null);
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
  const [imageFromWorkoutLoading, setImageFromWorkoutLoading] = useState(false);
  const [imageFromWorkoutError, setImageFromWorkoutError] = useState<string | null>(null);
  const addWorkoutForDateRef = useRef<string | null>(null);
  const imageFromWorkoutIdxRef = useRef<number | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const isCoach = role === "coach";

  useEffect(() => { if (!authLoading && !user) router.push("/login"); }, [authLoading, user, router]);

  useEffect(() => {
    if (!role) return;
    supabase.from("profiles").select("id, full_name, swimmer_group").eq("role", "swimmer").order("full_name")
      .then(({ data, error }) => {
        if (!error && data) { setSwimmers(data as SwimmerProfile[]); return; }
        supabase.from("profiles").select("id, full_name").eq("role", "swimmer").order("full_name")
          .then(({ data: base }) => setSwimmers((base ?? []).map((s) => ({ ...s, swimmer_group: null })) as SwimmerProfile[]));
      });
  }, [role]);

  // Swimmer day fetch
  useEffect(() => {
    if (role !== "swimmer" || viewMode !== "day" || !user) return;
    const userId = user.id;
    (async () => {
      setSwimmerLoading(true);
      const isAll = selectedViewSwimmerId === ALL_ID;
      const isOnlyGroups = selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID;
      const filterId = isAll || isOnlyGroups ? selectedViewSwimmerId : (selectedViewSwimmerId ?? userId);
      const filterGroup = filterId === userId ? swimmerGroup : (filterId !== ALL_ID && filterId !== ONLY_GROUPS_ID && filterId !== ALL_GROUPS_ID) ? swimmers.find((s) => s.id === filterId)?.swimmer_group ?? null : null;
      let query = supabase.from("workouts").select(WORKOUT_SELECT).eq("date", dateKey).order("created_at", { ascending: true });
      if (isOnlyGroups) query = query.in("assigned_to_group", SWIMMER_GROUPS);
      else if (!isAll && filterId) {
        if (filterId === userId) {
          query = query;
        } else {
          query = filterGroup ? query.or(orAssignFilter(filterId, filterGroup)) : query.eq("assigned_to", filterId);
        }
      }
      const { data } = await query;
      let rows = (data ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey })) as Workout[];
      rows = await loadAndMergeWorkouts(rows, swimmers);
      const me = filterId ?? userId;
      rows = filterWorkoutsForSwimmer(rows, me, filterGroup ?? null);
      setViewWorkouts(rows);
      const isMyView = !isAll && !isOnlyGroups && filterId === userId;
      if (isMyView) {
        const isAddingWorkout = addWorkoutForDateRef.current === dateKey;
        if (!isAddingWorkout) { setSwimmerEditingIndex(null); setSwimmerEditingSnapshot(null); }
        const sorted = sortCoachWorkouts(rows, swimmers);
        if (isAddingWorkout) {
          addWorkoutForDateRef.current = null;
          const newWorkout = { id: "", date: dateKey, content: "", session: null, workout_category: null, pool_size: null, assigned_to: userId, assigned_to_group: null };
          setSwimmerWorkouts([...sorted, newWorkout]);
          setSwimmerEditingIndex(sorted.length);
        } else {
          setSwimmerWorkouts(sorted);
        }
      }
      setSwimmerLoading(false);
    })();
  }, [dateKey, role, viewMode, user?.id, selectedViewSwimmerId, swimmerGroup, swimmers]);

  // Coach day fetch
  useEffect(() => {
    if (!dateKey || !isCoach || viewMode !== "day" || !user) return;
    const isAddingWorkout = addWorkoutForDateRef.current === dateKey;
    if (!isAddingWorkout) { setEditingWorkoutIndex(null); setEditingWorkoutSnapshot(null); }
    (async () => {
      setCoachLoading(true);
      const { data, error } = await supabase.rpc("get_workouts_for_date", { p_date: dateKey });
      let rows: Workout[];
      if (error?.message?.includes("function") && error?.message?.includes("does not exist")) {
        const { data: fallback } = await supabase.from("workouts").select(WORKOUT_SELECT).eq("date", dateKey).order("created_at", { ascending: true });
        rows = await loadAndMergeWorkouts((fallback ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey })) as Workout[], swimmers);
      } else if (error) {
        setCoachLoading(false);
        return;
      } else {
        rows = await loadAndMergeWorkouts((data ?? []).map((w: Workout) => ({ ...w, date: normDate(w.date) ?? dateKey })), swimmers);
      }
      if (selectedCoachSwimmerId === ONLY_GROUPS_ID) {
        rows = rows.filter((w) => w.assigned_to_group != null && SWIMMER_GROUPS.includes(w.assigned_to_group));
      } else if (selectedCoachSwimmerId && selectedCoachSwimmerId !== ALL_ID) {
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
      const sortedRows = sortCoachWorkouts(rows, swimmers);
      const assigneeForNew = (selectedCoachSwimmerId && selectedCoachSwimmerId !== ALL_ID && selectedCoachSwimmerId !== ONLY_GROUPS_ID) ? selectedCoachSwimmerId : null;
      if (isAddingWorkout) {
        addWorkoutForDateRef.current = null;
        const newWorkout = { id: "", date: dateKey, content: "", session: null, workout_category: null, pool_size: null, assigned_to: assigneeForNew, assigned_to_group: null };
        setCoachWorkouts([...sortedRows, newWorkout]);
        setEditingWorkoutIndex(sortedRows.length);
      } else {
        setCoachWorkouts(sortedRows);
      }
      setCoachLoading(false);
    })();
  }, [dateKey, role, viewMode, user?.id, selectedCoachSwimmerId, swimmers]);

  // Week/month range fetch (shared for swimmer and coach)
  useEffect(() => {
    if ((viewMode !== "week" && viewMode !== "month") || !user) return;
    (async () => {
      setRangeLoading(true);
      const rangeStart = viewMode === "week" ? startOfWeek(selectedDate, { weekStartsOn }) : startOfMonth(selectedDate);
      const rangeEnd = viewMode === "week" ? endOfWeek(selectedDate, { weekStartsOn }) : endOfMonth(selectedDate);
      let query = supabase.from("workouts").select("*")
        .gte("date", format(rangeStart, "yyyy-MM-dd")).lte("date", format(rangeEnd, "yyyy-MM-dd"));
      if (viewMode === "week") query = query.order("date", { ascending: true });

      const swimmerFilterId = role === "swimmer" ? (selectedViewSwimmerId ?? user.id) : null;
      const filterId = role === "swimmer" ? swimmerFilterId : selectedCoachSwimmerId;
      const filterGroup = role === "swimmer" && swimmerFilterId === user.id ? swimmerGroup
        : filterId && filterId !== ALL_ID && filterId !== ONLY_GROUPS_ID && filterId !== ALL_GROUPS_ID ? swimmers.find((s) => s.id === filterId)?.swimmer_group ?? null : null;

      if (role === "swimmer" && swimmerFilterId) {
        if (selectedViewSwimmerId === ALL_ID) { /* no filter - show all */ }
        else if (selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID) query = query.in("assigned_to_group", SWIMMER_GROUPS);
        else query = filterGroup ? query.or(orAssignFilter(swimmerFilterId, filterGroup)) : query.eq("assigned_to", swimmerFilterId);
      }
      if (isCoach && selectedCoachSwimmerId && selectedCoachSwimmerId !== ALL_ID) {
        if (selectedCoachSwimmerId === ONLY_GROUPS_ID) query = query.in("assigned_to_group", SWIMMER_GROUPS);
        else {
          const coachGroup = swimmers.find((s) => s.id === selectedCoachSwimmerId)?.swimmer_group ?? null;
          query = coachGroup ? query.or(orAssignFilter(selectedCoachSwimmerId, coachGroup)) : query.eq("assigned_to", selectedCoachSwimmerId);
        }
      }

      const { data } = await query;
      let rows = await loadAndMergeWorkouts((data ?? []) as Workout[], swimmers);
      if (role === "swimmer" && swimmerFilterId) {
        const sf = selectedViewSwimmerId ?? user.id;
        rows = filterWorkoutsForSwimmer(rows, sf, filterGroup ?? null);
      }

      if (viewMode === "week") setWeekWorkouts(rows);
      else setMonthWorkouts(rows);
      setRangeLoading(false);
    })();
  }, [selectedDate, viewMode, weekStartsOn, user?.id, role, selectedViewSwimmerId, selectedCoachSwimmerId, swimmerGroup, swimmers]);

  // Coach CRUD operations
  async function saveSingleWorkout(index: number) {
    if (!dateKey || index < 0 || index >= coachWorkouts.length) return;
    const workout = coachWorkouts[index];
    setEditingWorkoutIndex(null); setEditingWorkoutSnapshot(null);
    setLoading(true); setSaved(false);
    let savedId: string | undefined = workout.id;
    const poolSizeToSave = workout.pool_size ?? defaultPoolSize ?? null;
    const updatePayload = {
      content: workout.content, session: workout.session || null,
      workout_category: workout.workout_category, pool_size: poolSizeToSave,
      assigned_to: workout.assigned_to, assigned_to_group: workout.assigned_to_group,
      updated_at: new Date().toISOString(),
    };

    const rpcPayload = {
      p_content: workout.content,
      p_session: workout.session || null,
      p_workout_category: workout.workout_category || null,
      p_pool_size: poolSizeToSave,
      p_assigned_to: workout.assigned_to ?? null,
      p_assigned_to_group: workout.assigned_to_group ?? null,
    };
    if (workout.id) {
      const { error } = await supabase.rpc("update_workout", { p_id: workout.id, ...rpcPayload });
      if (error) {
        if (error.message?.includes("function") && error.message?.includes("does not exist")) {
          const { error: updErr } = await supabase.from("workouts").update(updatePayload).eq("id", workout.id);
          if (updErr) { alert(updErr.message); setLoading(false); return; }
        } else { alert(error.message); setLoading(false); return; }
      }
    } else {
      const { data: newId, error } = await supabase.rpc("insert_workout", { p_date: dateKey, ...rpcPayload });
      if (error) {
        if (error.message?.includes("function") && error.message?.includes("does not exist")) {
          const { data: inserted, error: insErr } = await supabase.from("workouts")
            .insert({ date: dateKey, ...updatePayload, assigned_to: workout.assigned_to ?? null, assigned_to_group: workout.assigned_to_group ?? null })
            .select().single();
          if (insErr) { alert(insErr.message); setLoading(false); return; }
          savedId = inserted?.id;
          setCoachWorkouts((prev) => prev.map((w, i) => i === index ? { ...inserted, date: normDate(inserted?.date) ?? dateKey, assignee_ids: w.assignee_ids } : w));
        } else { alert(error.message); setLoading(false); return; }
      } else {
        savedId = newId ?? undefined;
      }
    }

    if (workout.assigned_to_group && savedId) {
      const tf = getTimeframe(workout);
      const otherIds = coachWorkouts.filter((w) => w.id && w.assigned_to_group && w.id !== workout.id && getTimeframe(w) === tf).map((w) => w.id!);
      try { await saveAssigneesForGroupWorkout(savedId, workout.assignee_ids ?? [], otherIds); } catch (e) { alert((e && typeof e === "object" && "message" in e) ? String((e as { message: string }).message) : "Failed to save assignees"); setLoading(false); return; }
      for (const w of coachWorkouts) {
        if (!w.assigned_to_group || !w.id || w.id === workout.id) continue;
        const tfW = getTimeframe(w);
        const otherIdsForW = coachWorkouts.filter((x) => x.id && x.assigned_to_group && x.id !== w.id && getTimeframe(x) === tfW).map((x) => x.id!);
        try { await saveAssigneesForGroupWorkout(w.id, w.assignee_ids ?? [], otherIdsForW); } catch (e) { alert((e && typeof e === "object" && "message" in e) ? String((e as { message: string }).message) : "Failed to save assignees"); setLoading(false); return; }
      }
    }

    await refreshCoachWorkouts();
    setLoading(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function refreshCoachWorkouts() {
    const { data: rows, error } = await supabase.rpc("get_workouts_for_date", { p_date: dateKey });
    if (error?.message?.includes("function") && error?.message?.includes("does not exist")) {
      const { data: fallback } = await supabase.from("workouts").select(WORKOUT_SELECT).eq("date", dateKey).order("created_at", { ascending: true });
      const merged = await loadAndMergeWorkouts((fallback ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey })) as Workout[], swimmers);
      setCoachWorkouts(sortCoachWorkouts(merged, swimmers));
      return;
    }
    if (error) { alert(error.message); return; }
    let merged = (rows ?? []).map((w: Workout) => ({ ...w, date: normDate(w.date) ?? dateKey }));
    merged = await loadAndMergeWorkouts(merged, swimmers);
    setCoachWorkouts(sortCoachWorkouts(merged, swimmers));
  }

  async function deleteSingleWorkout(index: number) {
    if (index < 0 || index >= coachWorkouts.length || !confirm("Delete this workout?")) return;
    setLoading(true);
    const workout = coachWorkouts[index];
    if (workout.id) {
      const { error } = await supabase.from("workouts").delete().eq("id", workout.id);
      if (error) { alert(error.message); setLoading(false); return; }
    }
    setCoachWorkouts((prev) => prev.filter((_, i) => i !== index));
    setEditingWorkoutIndex(null); setEditingWorkoutSnapshot(null); setLoading(false);
  }

  function updateCoachWorkout(index: number, updates: Partial<Workout>) {
    setCoachWorkouts((prev) => {
      let next = prev.map((w, i) => i === index ? { ...w, ...updates } : w);
      if (updates.assignee_ids && prev[index]?.assigned_to_group) {
        const addedIds = updates.assignee_ids;
        const currentTf = getTimeframe(prev[index]!);
        next = next.map((w, i) => {
          if (i === index || !w.assigned_to_group || !w.assignee_ids?.length || getTimeframe(w) !== currentTf) return i === index ? next[index] : w;
          return { ...w, assignee_ids: w.assignee_ids.filter((id) => !addedIds.includes(id)) };
        });
      }
      return next;
    });
  }

  function startEditingWorkout(index: number) {
    const w = coachWorkouts[index];
    setEditingWorkoutSnapshot(w ? { ...w, assignee_ids: w.assignee_ids ? [...w.assignee_ids] : undefined } : null);
    setEditingWorkoutIndex(index);
  }

  function cancelEditingWorkout() {
    const idx = editingWorkoutIndex;
    const snap = editingWorkoutSnapshot;
    setEditingWorkoutIndex(null); setEditingWorkoutSnapshot(null);
    if (idx !== null && snap != null) setCoachWorkouts((prev) => prev.map((w, i) => i === idx ? snap : w));
    else if (idx !== null && coachWorkouts[idx] && !coachWorkouts[idx].id) setCoachWorkouts((prev) => prev.filter((_, i) => i !== idx));
  }

  const isSwimmerOwnView = !isCoach && (selectedViewSwimmerId === null || selectedViewSwimmerId === user?.id);
  const isSwimmerMyView = isSwimmerOwnView && viewMode === "day";

  async function saveSingleWorkoutSwimmer(index: number) {
    if (!dateKey || !user || index < 0 || index >= swimmerWorkouts.length) return;
    const workout = swimmerWorkouts[index];
    setSwimmerEditingIndex(null); setSwimmerEditingSnapshot(null);
    setLoading(true); setSaved(false);
    const poolSizeToSave = workout.pool_size ?? defaultPoolSize ?? null;
    const assigneeIds = workout.assignee_ids?.length ? workout.assignee_ids : (workout.assigned_to ? [workout.assigned_to] : []);
    const singleAssignee = assigneeIds.length === 1 ? assigneeIds[0]! : null;

    if (workout.id) {
      const { error } = await supabase.rpc("update_workout_swimmer", {
        p_id: workout.id,
        p_content: workout.content,
        p_session: workout.session || null,
        p_workout_category: workout.workout_category || null,
        p_pool_size: poolSizeToSave,
        p_assigned_to: singleAssignee,
      });
      if (error) {
        if (error.message?.includes("function") && error.message?.includes("does not exist")) {
          const { error: updErr } = await supabase.from("workouts").update({
            content: workout.content, session: workout.session || null, workout_category: workout.workout_category,
            pool_size: poolSizeToSave, assigned_to: singleAssignee, assigned_to_group: null, updated_at: new Date().toISOString(),
          }).eq("id", workout.id).eq("created_by", user.id);
          if (updErr) { alert(updErr.message); setLoading(false); return; }
        } else { alert(error.message); setLoading(false); return; }
      }
      if (assigneeIds.length > 1) {
        try { await saveAssigneesForIndividualWorkout(workout.id, assigneeIds); } catch (e) { alert("Failed to save assignees"); setLoading(false); return; }
      }
    } else {
      const { data: newId, error } = await supabase.rpc("insert_workout_swimmer", {
        p_date: dateKey,
        p_content: workout.content,
        p_session: workout.session || null,
        p_workout_category: workout.workout_category || null,
        p_pool_size: poolSizeToSave,
        p_assigned_to: singleAssignee,
      });
      if (error) {
        if (error.message?.includes("function") && error.message?.includes("does not exist")) {
          const { data: inserted, error: insErr } = await supabase.from("workouts").insert({
            date: dateKey, content: workout.content, session: workout.session || null, workout_category: workout.workout_category,
            pool_size: poolSizeToSave, assigned_to: singleAssignee, assigned_to_group: null, created_by: user.id, updated_at: new Date().toISOString(),
          }).select().single();
          if (insErr) { alert(insErr.message); setLoading(false); return; }
          if (assigneeIds.length > 1) {
            try { await saveAssigneesForIndividualWorkout(inserted.id, assigneeIds); } catch (e) { alert("Failed to save assignees"); setLoading(false); return; }
          }
          setSwimmerWorkouts((prev) => prev.map((w, i) => i === index ? { ...inserted, date: dateKey, assignee_ids: workout.assignee_ids } : w));
        } else { alert(error.message); setLoading(false); return; }
      } else if (newId && assigneeIds.length > 1) {
        try { await saveAssigneesForIndividualWorkout(newId, assigneeIds); } catch (e) { alert("Failed to save assignees"); setLoading(false); return; }
      }
    }

    await refreshSwimmerWorkouts();
    setLoading(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function refreshSwimmerWorkouts() {
    const { data } = await supabase.from("workouts").select(WORKOUT_SELECT).eq("date", dateKey).order("created_at", { ascending: true });
    let rows = await loadAndMergeWorkouts((data ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey })) as Workout[], swimmers);
    rows = filterWorkoutsForSwimmer(rows, user?.id ?? "", swimmerGroup);
    setSwimmerWorkouts(sortCoachWorkouts(rows, swimmers));
    setViewWorkouts(rows);
  }

  async function deleteSingleWorkoutSwimmer(index: number) {
    if (index < 0 || index >= swimmerWorkouts.length || !user || !confirm("Delete this workout?")) return;
    setLoading(true);
    const workout = swimmerWorkouts[index];
    if (workout.id) {
      const { data: w } = await supabase.from("workouts").select("created_by").eq("id", workout.id).single();
      if (w?.created_by !== user.id) { alert("Not authorized"); setLoading(false); return; }
      const { error } = await supabase.from("workouts").delete().eq("id", workout.id);
      if (error) { alert(error.message); setLoading(false); return; }
    }
    setSwimmerWorkouts((prev) => prev.filter((_, i) => i !== index));
    setSwimmerEditingIndex(null); setSwimmerEditingSnapshot(null); setLoading(false);
  }

  function updateSwimmerWorkout(index: number, updates: Partial<Workout>) {
    setSwimmerWorkouts((prev) => prev.map((w, i) => i === index ? { ...w, ...updates } : w));
  }

  function swimmerIdsInTimeframeExcludingSwimmer(workoutIdx: number): Set<string> {
    const w = swimmerWorkouts[workoutIdx];
    const tf = getTimeframe(w);
    const out = new Set<string>();
    swimmerWorkouts.forEach((ow, i) => {
      if (i === workoutIdx || getTimeframe(ow) !== tf) return;
      if (ow.assigned_to) out.add(ow.assigned_to);
      (ow.assignee_ids ?? []).forEach((id) => out.add(id));
    });
    return out;
  }

  async function handleImageFromWorkout(e: React.ChangeEvent<HTMLInputElement>) {
    const idx = imageFromWorkoutIdxRef.current;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (idx === null || !file) return;
    const isHeic = /^image\/(heic|heif)$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    if (!isHeic && !file.type.startsWith("image/")) return;
    setImageFromWorkoutError(null);
    setImageFromWorkoutLoading(true);
    try {
      let blob: Blob = file;
      if (isHeic) {
        const heic2any = (await import("heic2any")).default;
        const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
        blob = Array.isArray(converted) ? converted[0]! : converted;
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Failed to read image"));
        r.readAsDataURL(blob);
      });
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/workout/from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: base64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to analyze image");
      setImageFromWorkoutError(null);
      if (swimmerEditingIndex === idx) updateSwimmerWorkout(idx, { content: data.content ?? "" });
      else updateCoachWorkout(idx, { content: data.content ?? "" });
    } catch (err) {
      setImageFromWorkoutError(err instanceof Error ? err.message : "Failed to process image");
    } finally {
      setImageFromWorkoutLoading(false);
      imageFromWorkoutIdxRef.current = null;
    }
  }

  const changeDate = (delta: number) => {
    if (viewMode === "day") setSelectedDate((d) => delta > 0 ? addDays(d, 1) : subDays(d, 1));
    else if (viewMode === "week") { setExpandedDayKey(null); setSelectedDate((d) => delta > 0 ? addWeeks(d, 1) : subWeeks(d, 1)); }
    else { setExpandedWeekKey(null); setExpandedMonthDayKey(null); setSelectedDate((d) => delta > 0 ? addMonths(d, 1) : subMonths(d, 1)); }
  };

  const getDateBarLabel = () => {
    if (viewMode === "day") return formatDate(selectedDate, "dateBar");
    if (viewMode === "week") {
      const wStart = startOfWeek(selectedDate, { weekStartsOn });
      return formatDate(wStart, "weekRange", endOfWeek(selectedDate, { weekStartsOn }));
    }
    return formatDate(selectedDate, "monthYear");
  };

  const handleMonthCalendarSelect = (date: Date) => {
    setSelectedDate(date);
    setExpandedWeekKey(format(startOfWeek(date, { weekStartsOn }), "yyyy-MM-dd"));
    setExpandedMonthDayKey(format(date, "yyyy-MM-dd"));
  };

  const goToDayAndEdit = (day: Date) => { setSelectedDate(day); setViewMode("day"); };
  const goToDayAndAddWorkout = (day: Date) => { addWorkoutForDateRef.current = format(day, "yyyy-MM-dd"); setSelectedDate(day); setViewMode("day"); };

  const swimmerIdsInTimeframeExcluding = (workoutIdx: number): Set<string> => {
    const w = coachWorkouts[workoutIdx];
    const tf = getTimeframe(w);
    const out = new Set<string>();
    coachWorkouts.forEach((ow, i) => {
      if (i === workoutIdx || getTimeframe(ow) !== tf) return;
      if (ow.assigned_to && !ow.assigned_to_group) out.add(ow.assigned_to);
      else if (ow.assigned_to_group) {
        (ow.assignee_ids?.length ? ow.assignee_ids : swimmers.filter((s) => s.swimmer_group === ow.assigned_to_group).map((s) => s.id)).forEach((id) => out.add(id));
      }
    });
    return out;
  };

  const getPreviewDefault = () => {
    if (isCoach) {
      if (selectedCoachSwimmerId === ALL_ID) return t("main.allWorkouts");
      if (selectedCoachSwimmerId === ONLY_GROUPS_ID) return t("main.groupWorkouts");
      return selectedCoachSwimmerId ? swimmers.find((s) => s.id === selectedCoachSwimmerId)?.full_name : undefined;
    }
    if (selectedViewSwimmerId === ALL_ID) return t("main.allWorkouts");
    if (selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID) return t("main.groupWorkouts");
    if (!selectedViewSwimmerId) return profile?.full_name ?? swimmers.find((s) => s.id === user?.id)?.full_name ?? undefined;
    return swimmers.find((s) => s.id === selectedViewSwimmerId)?.full_name ?? undefined;
  };

  if (authLoading) return <div className="min-h-dvh flex items-center justify-center bg-background"><p className="text-muted-foreground">{t("common.loading")}</p></div>;
  if (!user) return null;
  if (!role) return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-3">
        <p className="font-medium">{t("main.settingUpAccount")}</p>
        <p className="text-sm text-muted-foreground">{t("main.setupPersist")}</p>
        <Button variant="outline" onClick={signOut}>{t("common.signOut")}</Button>
      </div>
    </div>
  );

  const workoutsForRange = viewMode === "week" ? weekWorkouts : monthWorkouts;
  const previewDefault = getPreviewDefault();

  const renderWorkoutBlock = (workout: Workout, dayKey: string, opts: { readOnly?: boolean; compact?: boolean; showLabel?: boolean; excludeIds?: string[] }) => {
    const rawLabel = assignmentLabel(workout, swimmers);
    const label = rawLabel && GROUP_KEYS[rawLabel] ? t(GROUP_KEYS[rawLabel]) : rawLabel;
    return (
      <WorkoutBlock key={workout.id || dayKey} workout={workout} dateKey={dayKey} showLabel={opts.showLabel ?? true}
        feedbackRefreshKey={feedbackRefreshKey} onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
        className={opts.compact ? "mt-1" : "mt-4"} compact={opts.compact} readOnly={opts.readOnly} assigneeLabel={label}
        assigneeNames={opts.readOnly ? assignedToNames(workout, swimmers, opts.excludeIds) : undefined}
        teammateNames={!opts.readOnly ? teammateNames(workout, swimmers, user?.id) : undefined} t={t} />
    );
  };

  const renderWeekView = () => {
    if (rangeLoading) return <div className="flex flex-1 items-center justify-center py-8"><p className="text-muted-foreground">{t("common.loading")}</p></div>;
    const days = eachDayOfInterval({ start: startOfWeek(selectedDate, { weekStartsOn }), end: endOfWeek(selectedDate, { weekStartsOn }) });
    return days.map((day) => {
      const dayKey = format(day, "yyyy-MM-dd");
      const dayWorkouts = isCoach ? sortCoachWorkouts(weekWorkouts.filter((w) => normDate(w.date) === dayKey), swimmers) : weekWorkouts.filter((w) => normDate(w.date) === dayKey);
      return (
        <ExpandableDay key={day.toISOString()} day={day} dayWorkouts={dayWorkouts}
          isExpanded={expandedDayKey === dayKey} onToggle={() => { setExpandedDayKey(expandedDayKey === dayKey ? null : dayKey); setSelectedDate(day); }}
          previewLabel={(w) => {
            const raw = dayPreviewLabel(w, swimmers, previewDefault);
            const parts = raw.split(" - ");
            const assignee = parts.length > 1 ? parts[0] : null;
            const category = parts.length > 1 ? parts[1] : parts[0];
            const translatedAssignee = assignee && GROUP_KEYS[assignee] ? t(GROUP_KEYS[assignee]) : assignee;
            const translatedCategory = getCategoryLabel(category === "Workout" ? "" : category, t) || t("category.workout");
            return assignee ? `${translatedAssignee} - ${translatedCategory}` : translatedCategory;
          }}
          t={t} formatDate={formatDate}
          renderWorkouts={() => dayWorkouts.length > 0 ? dayWorkouts.map((w) => {
            const excludeIds = isCoach ? [...new Set(dayWorkouts.filter((x) => x.id !== w.id && getTimeframe(x) === getTimeframe(w)).flatMap((x) => x.assigned_to && !x.assigned_to_group ? [x.assigned_to] : (x.assignee_ids ?? [])))] : undefined;
            return renderWorkoutBlock(w, dayKey, { readOnly: isCoach, compact: true, showLabel: dayWorkouts.length > 1, excludeIds });
          }) : <p className="text-xs text-muted-foreground">{t("main.noWorkout")}</p>}
          actions={(isCoach || isSwimmerOwnView) && expandedDayKey === dayKey ? (
            dayWorkouts.length > 0
              ? <Button variant="outline" size="sm" className="gap-2" onClick={() => goToDayAndEdit(day)}><Pencil className="size-4" />{t("main.editDay")}</Button>
              : <Button variant="outline" size="sm" className="gap-2" onClick={() => goToDayAndAddWorkout(day)}><Plus className="size-4" />{t("main.addWorkout")}</Button>
          ) : undefined}
        />
      );
    });
  };

  const renderMonthView = () => {
    if (rangeLoading) return <p className="text-muted-foreground">{t("common.loading")}</p>;
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const weeks: { start: Date; end: Date; key: string }[] = [];
    let ws = startOfWeek(monthStart, { weekStartsOn });
    while (ws <= monthEnd) {
      const we = endOfWeek(ws, { weekStartsOn });
      weeks.push({ start: ws, end: we, key: format(ws, "yyyy-MM-dd") });
      ws = addDays(we, 1);
    }
    return weeks.map(({ start, end, key }) => {
      const weekWorkoutsList = monthWorkouts.filter((w) => isWithinInterval(new Date(w.date + "T12:00:00"), { start, end }));
      const isExpanded = expandedWeekKey === key;
      return (
        <div key={key} className="rounded-lg border bg-card overflow-hidden">
          <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left"
            onClick={() => { setExpandedWeekKey(isExpanded ? null : key); setExpandedMonthDayKey(null); }}>
            <span className="text-xs font-medium">{t("settings.week")} {weeks.findIndex((w) => w.key === key) + 1}: {formatDate(start, "weekRange", end)}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {weekWorkoutsList.length} {weekWorkoutsList.length !== 1 ? t("main.weekWorkoutsPlural") : t("main.weekWorkouts")}
              {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </span>
          </button>
          {isExpanded && (
            <div className="animate-in slide-in-from-top-2 border-t px-3 py-2 space-y-1.5 duration-200">
              {eachDayOfInterval({ start, end }).map((day) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const dayWorkouts = isCoach ? sortCoachWorkouts(weekWorkoutsList.filter((w) => normDate(w.date) === dayKey), swimmers) : weekWorkoutsList.filter((w) => normDate(w.date) === dayKey);
                const isDayExpanded = expandedMonthDayKey === dayKey;
                return (
                  <div key={dayKey} className="rounded-lg border bg-card overflow-hidden">
                    <button type="button" className="flex w-full items-center justify-between p-2 text-left transition-colors hover:bg-accent/50"
                      onClick={() => { setExpandedMonthDayKey(isDayExpanded ? null : dayKey); setSelectedDate(day); }}>
                      <div className="min-w-0 flex-1">
                        <p className="mb-0.5 text-xs font-medium text-muted-foreground">{formatDate(day, "dateBar")}</p>
                        {dayWorkouts.length > 0 ? (
                          <div className="space-y-0.5 font-sans text-xs text-muted-foreground">
                            {dayWorkouts.map((w, wi) => <p key={wi}>{dayPreviewLabel(w, swimmers, previewDefault)}</p>)}
                          </div>
                        ) : <p className="text-xs text-muted-foreground">{t("main.noWorkout")}</p>}
                      </div>
                      {isDayExpanded ? <ChevronUp className="size-4 shrink-0 text-muted-foreground ml-2" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground ml-2" />}
                    </button>
                    {isDayExpanded && (
                      <div className="animate-in slide-in-from-top-2 border-t px-2 py-1.5 duration-200 space-y-2">
                        {dayWorkouts.length > 0 ? (
                          <>
                            {dayWorkouts.map((w) => {
                              const excludeIds = isCoach ? [...new Set(dayWorkouts.filter((x) => x.id !== w.id && getTimeframe(x) === getTimeframe(w)).flatMap((x) => x.assigned_to && !x.assigned_to_group ? [x.assigned_to] : (x.assignee_ids ?? [])))] : undefined;
                              return renderWorkoutBlock(w, dayKey, { readOnly: isCoach, compact: true, showLabel: dayWorkouts.length > 1, excludeIds });
                            })}
                            {(isCoach || isSwimmerOwnView) && <Button variant="outline" size="sm" className="gap-2" onClick={() => goToDayAndEdit(day)}><Pencil className="size-4" />{t("main.editDay")}</Button>}
                          </>
                        ) : (isCoach || isSwimmerOwnView) ? (
                          <Button variant="outline" size="sm" className="gap-2" onClick={() => goToDayAndAddWorkout(day)}><Plus className="size-4" />{t("main.addWorkout")}</Button>
                        ) : <p className="text-sm text-muted-foreground">{t("main.noWorkout")}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-md flex-col px-5 py-5 w-full min-w-0">
        {/* Header */}
        <div className="mb-5 flex w-full min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <h1 className="flex shrink-0 items-center gap-1.5 text-lg font-bold"><FlipTurnsLogo className="size-5 shrink-0" size={20} />{t("app.title")}</h1>
            <div className="shrink-0"><ThemeToggle /></div>
            {role === "swimmer" && swimmers.length > 0 ? (
              <div className="min-w-0 flex-1 overflow-hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-full min-w-0 justify-between gap-1.5 px-2 text-left text-xs font-medium">
                      <span className="truncate">{selectedViewSwimmerId === ALL_ID ? t("main.allWorkouts") : selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID ? t("main.groupWorkouts") : selectedViewSwimmerId ? swimmers.find((s) => s.id === selectedViewSwimmerId)?.full_name ?? t("login.swimmer") : profile?.full_name ?? t("main.myWorkouts")}</span>
                      <ChevronDown className="size-3.5 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[10rem]">
                  <DropdownMenuItem onClick={() => setSelectedViewSwimmerId(null)}>{profile?.full_name ?? t("main.myWorkouts")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedViewSwimmerId(ALL_ID)}>{t("main.allWorkouts")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedViewSwimmerId(ONLY_GROUPS_ID)}>{t("main.groupWorkouts")}</DropdownMenuItem>
                  {swimmers.filter((s) => s.id !== user?.id).map((s) => <DropdownMenuItem key={s.id} onClick={() => setSelectedViewSwimmerId(s.id)}>{s.full_name ?? s.id}</DropdownMenuItem>)}
                </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : isCoach && swimmers.length > 0 ? (
              <div className="min-w-0 flex-1 overflow-hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-full min-w-0 justify-between gap-1.5 px-2 text-left text-xs font-medium">
                      <span className="truncate">{selectedCoachSwimmerId === ALL_ID ? t("main.allWorkouts") : selectedCoachSwimmerId === ONLY_GROUPS_ID ? t("main.groupWorkouts") : selectedCoachSwimmerId ? swimmers.find((s) => s.id === selectedCoachSwimmerId)?.full_name ?? t("login.swimmer") : t("main.allWorkouts")}</span>
                      <ChevronDown className="size-3.5 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[10rem]">
                    <DropdownMenuItem onClick={() => setSelectedCoachSwimmerId(ALL_ID)}>{t("main.allWorkouts")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSelectedCoachSwimmerId(ONLY_GROUPS_ID)}>{t("main.groupWorkouts")}</DropdownMenuItem>
                    {swimmers.map((s) => <DropdownMenuItem key={s.id} onClick={() => setSelectedCoachSwimmerId(s.id)}>{s.full_name ?? s.id}</DropdownMenuItem>)}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="min-w-0 flex-1 overflow-hidden">
                <span className="flex h-9 w-full min-w-0 items-center truncate rounded-md border border-input bg-muted/50 px-2 text-xs font-medium capitalize text-muted-foreground">{profile?.full_name ?? role}</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {role && user?.id && (
              <NotificationBell role={role} userId={user.id} swimmerGroup={swimmerGroup ?? null} swimmers={swimmers}
              onWorkoutNotificationClick={role === "swimmer" ? (_, date) => { setSelectedDate(parseISO(date + "T12:00:00")); setViewMode("day"); } : undefined} />
            )}
            <Link href="/settings"><Button variant="ghost" size="icon" className="size-9" aria-label="Settings"><Settings className="size-5" /></Button></Link>
            <SignOutDropdown trigger={<Button variant="ghost" size="icon" className="size-9" aria-label="Sign out"><LogOut className="size-5" /></Button>} />
          </div>
        </div>

        {/* Main menu: Team Management & Analytics */}
        <nav className={`mb-3 grid gap-2 ${isCoach ? "grid-cols-2" : "grid-cols-1"}`}>
          {isCoach && (
            <Link
              href="/team-management"
              className="flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-4 transition-colors hover:bg-accent/50"
            >
              <Users className="size-6 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{t("settings.teamManagement")}</span>
            </Link>
          )}
          <Link
            href="/analytics"
            className="flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-4 transition-colors hover:bg-accent/50"
          >
            <BarChart3 className="size-6 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">{t("settings.volumeAnalytics")}</span>
          </Link>
        </nav>

        {/* Date bar */}
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
          <Button variant="ghost" size="icon" className="size-10 shrink-0" onClick={() => changeDate(-1)}><ChevronLeft className="size-5" /><span className="sr-only">Previous</span></Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="min-w-0 flex-1 gap-2 font-medium"><CalendarIcon className="size-4 shrink-0" /><span className="truncate">{getDateBarLabel()}</span></Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && handleMonthCalendarSelect(d)} weekStartsOn={weekStartsOn} />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="size-10 shrink-0" onClick={() => changeDate(1)}><ChevronRight className="size-5" /><span className="sr-only">Next</span></Button>
        </div>

        {/* View toggle */}
        <div className="mb-3 flex gap-1 rounded-lg border bg-card p-1">
          {([["day", CalendarIcon, t("main.day")], ["week", CalendarDays, t("main.week")], ["month", CalendarRange, t("main.month")]] as const).map(([mode, Icon, label]) => (
            <Button key={mode} variant={viewMode === mode ? "secondary" : "ghost"} size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => setViewMode(mode as ViewMode)}>
              <Icon className="size-3.5" />{label}
            </Button>
          ))}
        </div>

        {/* Day view - swimmer */}
        {viewMode === "day" && !isCoach && !isSwimmerMyView && (
          <div className="flex flex-1 flex-col">
            {swimmerLoading ? <div className="flex flex-1 items-center justify-center py-12"><p className="text-muted-foreground">{t("common.loading")}</p></div>
              : viewWorkouts.length > 0 ? (
                <div className="space-y-4">
                  {viewWorkouts.map((workout, i) => (
                    <Card key={workout.id || i} className="py-4">
                      <CardContent className="px-4 py-0">
                        {renderWorkoutBlock(workout, dateKey, { compact: false })}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : <div className="flex flex-1 flex-col items-center justify-center py-12 text-center"><p className="text-muted-foreground">{t("main.noWorkoutForDay")}</p></div>}
          </div>
        )}

        {/* Day view - swimmer editor (my workouts) */}
        {viewMode === "day" && isSwimmerMyView && (
          <Card className="flex flex-1 flex-col py-4">
            <input ref={imageFileInputRef} type="file" accept="image/*,image/heic,image/heif,.heic,.heif" capture="environment" className="hidden" onChange={handleImageFromWorkout} />
            <CardContent className="flex flex-1 flex-col gap-4 px-4 py-0">
              {swimmerLoading ? <div className="flex flex-1 items-center justify-center py-12"><p className="text-muted-foreground">{t("common.loading")}</p></div> : (
                <div className="flex flex-1 flex-col gap-4">
                  {swimmerWorkouts.length > 0 && swimmerWorkouts.map((workout) => {
                    const originalIdx = swimmerWorkouts.indexOf(workout);
                    const rawLabel = workout.assigned_to ? (swimmers.find((s) => s.id === workout.assigned_to)?.full_name ?? workout.assigned_to) : (workout.assignee_ids?.length ? assignedToNames(workout, swimmers) : null);
                    const label = rawLabel && GROUP_KEYS[rawLabel as keyof typeof GROUP_KEYS] ? t(GROUP_KEYS[rawLabel as keyof typeof GROUP_KEYS]) : rawLabel;
                    const isEditing = swimmerEditingIndex === originalIdx;
                    const assigneeIds = workout.assignee_ids?.length ? workout.assignee_ids : (workout.assigned_to ? [workout.assigned_to] : []);
                    const conflictIds = swimmerIdsInTimeframeExcludingSwimmer(originalIdx);
                    return (
                      <Card key={workout.id || `new-${originalIdx}`} className="relative py-4">
                        {isEditing ? (
                          <CardContent className="pl-4 pr-4 py-0">
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={assigneeIds.length === 1 ? `swimmer:${assigneeIds[0]}` : assigneeIds.length > 1 ? `swimmer:${assigneeIds[0]}` : ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v.startsWith("swimmer:")) {
                                      const id = v.slice(8) || null;
                                      updateSwimmerWorkout(originalIdx, { assigned_to: id, assigned_to_group: null, assignee_ids: id ? [id] : undefined });
                                    } else {
                                      updateSwimmerWorkout(originalIdx, { assigned_to: null, assigned_to_group: null, assignee_ids: undefined });
                                    }
                                  }}>
                                  <option value="">{t("main.assignTo")}</option>
                                  <optgroup label={t("coach.swimmer")}>
                                    {swimmers.map((s) => <option key={s.id} value={`swimmer:${s.id}`}>{s.full_name || s.id}</option>)}
                                  </optgroup>
                                </select>
                                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={workout.session || ""}
                                  onChange={(e) => updateSwimmerWorkout(originalIdx, { session: e.target.value || null })}>
                                  {SESSION_OPTIONS.map((v) => <option key={v || "any"} value={v}>{v === "AM" ? t("session.am") : v === "PM" ? t("session.pm") : t("main.anytime")}</option>)}
                                </select>
                                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={workout.workout_category || ""}
                                  onChange={(e) => updateSwimmerWorkout(originalIdx, { workout_category: e.target.value || null })}>
                                  {WORKOUT_CATEGORIES.map((v) => <option key={v || "empty"} value={v}>{getCategoryLabel(v, t)}</option>)}
                                </select>
                                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={workout.pool_size ?? defaultPoolSize ?? ""}
                                  onChange={(e) => updateSwimmerWorkout(originalIdx, { pool_size: (e.target.value || null) as "LCM" | "SCM" | "SCY" | null })}>
                                  <option value="">{t("main.pool")}</option>
                                  {POOL_SIZE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{getPoolLabel(opt.value, t)}</option>)}
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-xs font-medium text-muted-foreground">{t("coach.swimmersInWorkout")}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {swimmers.map((s) => {
                                    const isIn = assigneeIds.includes(s.id);
                                    const hasConflict = conflictIds.has(s.id);
                                    return (
                                      <button key={s.id} type="button"
                                        onClick={() => {
                                          if (isIn) {
                                            const next = assigneeIds.filter((id) => id !== s.id);
                                            updateSwimmerWorkout(originalIdx, { assignee_ids: next, assigned_to: next.length === 1 ? next[0]! : null });
                                          } else if (!hasConflict) {
                                            const next = [...assigneeIds, s.id];
                                            updateSwimmerWorkout(originalIdx, { assignee_ids: next, assigned_to: next.length === 1 ? next[0]! : null });
                                          }
                                        }}
                                        title={hasConflict ? t("coach.workoutConflict") : undefined}
                                        className={hasConflict ? "rounded-md border border-red-400/80 bg-red-400/10 text-red-800 dark:text-red-200 dark:bg-red-500/15 cursor-not-allowed inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium"
                                          : isIn ? "rounded-md border px-2.5 py-1.5 text-xs font-medium border-primary bg-primary/10"
                                            : "rounded-md border px-2.5 py-1.5 text-xs font-medium border-input bg-background text-muted-foreground hover:bg-accent"}>
                                        {hasConflict && <AlertCircle className="size-3.5 shrink-0" />}
                                        {s.full_name || s.id.slice(0, 8)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={imageFromWorkoutLoading}
                                  onClick={() => { imageFromWorkoutIdxRef.current = originalIdx; imageFileInputRef.current?.click(); }}>
                                  {imageFromWorkoutLoading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                                  {imageFromWorkoutLoading ? "Analyzing..." : "Take picture"}
                                </Button>
                                {imageFromWorkoutError && swimmerEditingIndex === originalIdx && (
                                  <span className="text-sm text-destructive">{imageFromWorkoutError}</span>
                                )}
                              </div>
                              <Textarea placeholder="Warm-up: 200 free..." value={workout.content} onChange={(e) => updateSwimmerWorkout(originalIdx, { content: e.target.value })} className="min-h-[200px] resize-none" />
                              {workout.content && <WorkoutAnalysis content={workout.content} date={dateKey} workoutId={workout.id || undefined} refreshKey={feedbackRefreshKey} viewerRole="swimmer" />}
                              <div className="flex gap-2 pt-2">
                                <Button type="button" size="sm" onClick={() => saveSingleWorkoutSwimmer(originalIdx)} disabled={loading || swimmerLoading}>{saved ? t("main.saved") : t("common.save")}</Button>
                                <button type="button" onClick={() => {
                                  const idx = swimmerEditingIndex; const snap = swimmerEditingSnapshot;
                                  setSwimmerEditingIndex(null); setSwimmerEditingSnapshot(null);
                                  if (idx !== null && snap != null) setSwimmerWorkouts((prev) => prev.map((w, i) => i === idx ? snap : w));
                                  else if (idx !== null && swimmerWorkouts[idx] && !swimmerWorkouts[idx].id) setSwimmerWorkouts((prev) => prev.filter((_, i) => i !== idx));
                                }} disabled={loading}
                                  className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent">{t("common.cancel")}</button>
                                <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => deleteSingleWorkoutSwimmer(originalIdx)} disabled={loading}>{t("common.delete")}</Button>
                              </div>
                            </div>
                          </CardContent>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-8 z-10" onClick={() => { setSwimmerEditingSnapshot(workout ? { ...workout, assignee_ids: workout.assignee_ids ? [...workout.assignee_ids] : undefined } : null); setSwimmerEditingIndex(originalIdx); }} aria-label="Edit workout"><Pencil className="size-4" /></Button>
                            <CardContent className="pl-4 pr-12 py-0">
                              <WorkoutBlock workout={workout} dateKey={dateKey} showLabel={swimmerWorkouts.length > 1} assigneeLabel={label}
                                assigneeNames={assignedToNames(workout, swimmers, Array.from(conflictIds))}
                                feedbackRefreshKey={feedbackRefreshKey} onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)} readOnly t={t} />
                            </CardContent>
                          </>
                        )}
                      </Card>
                    );
                  })}
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" size="icon" onClick={() => {
                      const newWorkout = { id: "", date: dateKey, content: "", session: null, workout_category: null, pool_size: null, assigned_to: user?.id ?? null, assigned_to_group: null };
                      setSwimmerWorkouts((prev) => [...prev, newWorkout]);
                      setSwimmerEditingSnapshot(null);
                      setSwimmerEditingIndex(swimmerWorkouts.length);
                    }} className="size-10" aria-label="Add workout"><Plus className="size-5" /></Button>
                  </div>
                  {swimmerWorkouts.length === 0 && <p className="text-center text-muted-foreground py-4">{t("main.noWorkoutForDay")}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {viewMode === "day" && isCoach && (
          <Card className="flex flex-1 flex-col py-4">
            <input ref={imageFileInputRef} type="file" accept="image/*,image/heic,image/heif,.heic,.heif" capture="environment" className="hidden" onChange={handleImageFromWorkout} />
            <CardContent className="flex flex-1 flex-col gap-4 px-4 py-0">
              {coachLoading ? <div className="flex flex-1 items-center justify-center py-12"><p className="text-muted-foreground">{t("common.loading")}</p></div> : (
                <div className="flex flex-1 flex-col gap-4">
                  {coachWorkouts.length > 0 && coachWorkouts.map((workout) => {
                    const originalIdx = coachWorkouts.indexOf(workout);
                    const rawLabel = assignmentLabel(workout, swimmers);
                    const label = rawLabel && GROUP_KEYS[rawLabel] ? t(GROUP_KEYS[rawLabel]) : rawLabel;
                    const isEditing = editingWorkoutIndex === originalIdx;
                    return (
                      <Card key={workout.id || `new-${originalIdx}`} className="relative py-4">
                        {isEditing ? (
                          <CardContent className="pl-4 pr-4 py-0">
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={workout.assigned_to ? `swimmer:${workout.assigned_to}` : workout.assigned_to_group ? `group:${workout.assigned_to_group}` : ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v.startsWith("swimmer:")) updateCoachWorkout(originalIdx, { assigned_to: v.slice(8) || null, assigned_to_group: null, assignee_ids: undefined });
                                    else if (v.startsWith("group:")) updateCoachWorkout(originalIdx, { assigned_to: null, assigned_to_group: v.slice(6) as SwimmerGroup, assignee_ids: undefined });
                                    else updateCoachWorkout(originalIdx, { assigned_to: null, assigned_to_group: null, assignee_ids: undefined });
                                  }}>
                                  <option value="">{t("main.assignTo")}</option>
                                  <optgroup label={t("coach.swimmer")}>{swimmers.map((s) => <option key={s.id} value={`swimmer:${s.id}`}>{s.full_name || s.id}</option>)}</optgroup>
                                  <optgroup label={t("coach.group")}>{SWIMMER_GROUPS.map((g) => <option key={g} value={`group:${g}`}>{t(GROUP_KEYS[g])}</option>)}</optgroup>
                                </select>
                                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={workout.session || ""}
                                  onChange={(e) => updateCoachWorkout(originalIdx, { session: e.target.value || null })}>
                                  {SESSION_OPTIONS.map((v) => <option key={v || "any"} value={v}>{v === "AM" ? t("session.am") : v === "PM" ? t("session.pm") : t("main.anytime")}</option>)}
                                </select>
                                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={workout.workout_category || ""}
                                  onChange={(e) => updateCoachWorkout(originalIdx, { workout_category: e.target.value || null })}>
                                  {WORKOUT_CATEGORIES.map((v) => <option key={v || "empty"} value={v}>{getCategoryLabel(v, t)}</option>)}
                                </select>
                                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={workout.pool_size ?? defaultPoolSize ?? ""}
                                  onChange={(e) => updateCoachWorkout(originalIdx, { pool_size: (e.target.value || null) as "LCM" | "SCM" | "SCY" | null })}>
                                  <option value="">{t("main.pool")}</option>
                                  {POOL_SIZE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{getPoolLabel(opt.value, t)}</option>)}
                                </select>
                              </div>
                              {workout.assigned_to_group && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs font-medium text-muted-foreground">{t("coach.swimmersInWorkout")}</p>
                                    <button type="button" onClick={() => {
                                      const defaultGroupIds = swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
                                      setCoachWorkouts((prev) => prev.map((w, i) => {
                                        if (i === originalIdx) return { ...w, assignee_ids: defaultGroupIds };
                                        if (w.assigned_to_group) {
                                          const currentIds = Array.isArray(w.assignee_ids) ? w.assignee_ids : swimmers.filter((s) => s.swimmer_group === w.assigned_to_group).map((s) => s.id);
                                          return { ...w, assignee_ids: currentIds.filter((id) => !defaultGroupIds.includes(id)) };
                                        }
                                        return w;
                                      }));
                                    }} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" title={t("coach.resetToDefault")} aria-label={t("coach.resetToDefault")}>
                                      <RotateCcw className="size-3.5" />
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {(() => {
                                      const conflictIds = swimmerIdsInTimeframeExcluding(originalIdx);
                                      const defaultGroupIds = swimmers.filter((x) => x.swimmer_group === workout.assigned_to_group).map((x) => x.id);
                                      const currentIds = Array.isArray(workout.assignee_ids) ? workout.assignee_ids : defaultGroupIds;
                                      return [...swimmers].sort((a, b) => {
                                        const go = (g: SwimmerGroup | null | undefined) => g === workout.assigned_to_group ? 0 : g == null ? 4 : SWIMMER_GROUPS.indexOf(g) + 1;
                                        const diff = go(a.swimmer_group) - go(b.swimmer_group);
                                        return diff !== 0 ? diff : (a.full_name ?? "").localeCompare(b.full_name ?? "");
                                      }).map((s) => {
                                        const isIn = currentIds.includes(s.id);
                                        const hasConflict = conflictIds.has(s.id);
                                        return (
                                          <button key={s.id} type="button"
                                            onClick={() => {
                                              if (isIn) updateCoachWorkout(originalIdx, { assignee_ids: currentIds.filter((id) => id !== s.id) });
                                              else if (!hasConflict || isIn) updateCoachWorkout(originalIdx, { assignee_ids: [...currentIds, s.id] });
                                            }}
                                            title={hasConflict ? t("coach.workoutConflict") : undefined}
                                            className={hasConflict ? "rounded-md border border-red-400/80 bg-red-400/10 text-red-800 dark:text-red-200 dark:bg-red-500/15 cursor-not-allowed inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-red-400/20"
                                              : isIn ? "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1 border-primary bg-primary/10 text-primary hover:bg-primary/20"
                                                : "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1 border-input bg-background text-muted-foreground hover:bg-accent disabled:opacity-50"}>
                                            {hasConflict && <AlertCircle className="size-3.5 shrink-0" aria-hidden />}
                                            {s.full_name || s.id.slice(0, 8)}
                                          </button>
                                        );
                                      });
                                    })()}
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={imageFromWorkoutLoading}
                                  onClick={() => { imageFromWorkoutIdxRef.current = originalIdx; imageFileInputRef.current?.click(); }}>
                                  {imageFromWorkoutLoading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                                  {imageFromWorkoutLoading ? "Analyzing..." : "Take picture"}
                                </Button>
                                {imageFromWorkoutError && editingWorkoutIndex === originalIdx && (
                                  <span className="text-sm text-destructive">{imageFromWorkoutError}</span>
                                )}
                                {imageFromWorkoutError && editingWorkoutIndex === originalIdx && (
                                  <button type="button" onClick={() => setImageFromWorkoutError(null)} className="text-xs text-muted-foreground hover:underline">Dismiss</button>
                                )}
                              </div>
                              <Textarea placeholder="Warm-up: 200 free, 4×50 kick...&#10;Main set: 8×100 @ 1:30...&#10;Cool-down: 200 easy"
                                value={workout.content} onChange={(e) => updateCoachWorkout(originalIdx, { content: e.target.value })} className="min-h-[200px] resize-none" />
                              {workout.content && <WorkoutAnalysis content={workout.content} date={dateKey} workoutId={workout.id || undefined} refreshKey={feedbackRefreshKey} viewerRole="coach" />}
                              <div className="flex gap-2 pt-2">
                                <Button type="button" size="sm" onClick={() => saveSingleWorkout(originalIdx)} disabled={loading || coachLoading}>{saved ? t("main.saved") : t("common.save")}</Button>
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); cancelEditingWorkout(); }} disabled={loading}
                                  className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-50">{t("common.cancel")}</button>
                                <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => deleteSingleWorkout(originalIdx)} disabled={loading}>{t("common.delete")}</Button>
                              </div>
                            </div>
                          </CardContent>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-8 z-10" onClick={() => startEditingWorkout(originalIdx)} aria-label="Edit workout"><Pencil className="size-4" /></Button>
                            <CardContent className="pl-4 pr-12 py-0">
                              <WorkoutBlock workout={workout} dateKey={dateKey} showLabel={coachWorkouts.length > 1} assigneeLabel={label}
                                assigneeNames={assignedToNames(workout, swimmers, Array.from(swimmerIdsInTimeframeExcluding(originalIdx)))}
                                feedbackRefreshKey={feedbackRefreshKey} onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)} readOnly t={t} />
                            </CardContent>
                          </>
                        )}
                      </Card>
                    );
                  })}
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" size="icon" onClick={() => {
                      const assigneeForNew = (selectedCoachSwimmerId && selectedCoachSwimmerId !== ALL_ID && selectedCoachSwimmerId !== ONLY_GROUPS_ID) ? selectedCoachSwimmerId : null;
                      const newWorkout = { id: "", date: dateKey, content: "", session: null, workout_category: null, pool_size: null, assigned_to: assigneeForNew, assigned_to_group: null };
                      setCoachWorkouts((prev) => [...prev, newWorkout]); setEditingWorkoutSnapshot(null); setEditingWorkoutIndex(coachWorkouts.length);
                    }} className="size-10" aria-label="Add workout"><Plus className="size-5" /></Button>
                  </div>
                  {coachWorkouts.length === 0 && <p className="text-center text-muted-foreground py-4">{t("main.noWorkoutForDay")}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Week view (shared) */}
        {viewMode === "week" && <div className="flex flex-1 flex-col gap-1">{renderWeekView()}</div>}

        {/* Month view (shared) */}
        {viewMode === "month" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <MonthCalendar selectedDate={selectedDate} weekStartsOn={weekStartsOn} monthWorkouts={monthWorkouts}
              onSelect={handleMonthCalendarSelect} onMonthChange={(d) => { setSelectedDate(d); setExpandedWeekKey(null); setExpandedMonthDayKey(null); }} />
            <div className="flex flex-1 flex-col gap-2">{renderMonthView()}</div>
          </div>
        )}
      </div>
    </div>
  );
}
