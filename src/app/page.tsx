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
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkoutAnalysis } from "@/components/workout-analysis";
import { usePreferences } from "@/components/preferences-provider";
import { useAuth } from "@/components/auth-provider";

type ViewMode = "day" | "week" | "month";

interface Workout {
  id: string;
  date: string;
  content: string;
  session?: string | null;
  workout_type?: string | null;
  workout_category?: string | null;
  assigned_to?: string | null;
}

interface SwimmerProfile {
  id: string;
  full_name: string | null;
}

const WORKOUT_TYPES = ["", "Sprint", "Middle distance", "Distance"] as const;
const WORKOUT_CATEGORIES = ["", "Recovery", "Aerobic", "Pace", "Tech suit"] as const;

function workoutLabel(w: Workout): string {
  const type = w.workout_type?.trim();
  const cat = w.workout_category?.trim();
  if (type && cat) return `${type} · ${cat}`;
  if (type) return type;
  if (cat) return cat;
  return "Workout";
}

function WorkoutBlock({
  workout,
  dateKey,
  showLabel,
  feedbackRefreshKey,
  onFeedbackChange,
  className = "mt-4",
  readOnly,
  compact,
}: {
  workout: Workout;
  dateKey: string;
  showLabel: boolean;
  feedbackRefreshKey: number;
  onFeedbackChange?: () => void;
  className?: string;
  readOnly?: boolean;
  compact?: boolean;
}) {
  return (
    <div>
      {showLabel && (workout.workout_type || workout.workout_category) && (
        <p className={`text-sm font-medium text-muted-foreground ${compact ? "mb-1" : "mb-2"}`}>{workoutLabel(workout)}</p>
      )}
      <pre className={`whitespace-pre-wrap font-sans leading-relaxed ${compact ? "text-[14px]" : "text-[15px]"}`}>{workout.content}</pre>
      <WorkoutAnalysis
        content={workout.content}
        date={dateKey}
        workoutId={workout.id}
        refreshKey={feedbackRefreshKey}
        onFeedbackChange={onFeedbackChange}
        className={className}
        readOnly={readOnly}
      />
    </div>
  );
}

export default function Home() {
  const { weekStartsOn } = usePreferences() ?? { weekStartsOn: 1 as 0 | 1 };
  const { user, profile, role, signOut, loading: authLoading } = useAuth();
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
  const [coachEditMode, setCoachEditMode] = useState(false);
  const [swimmers, setSwimmers] = useState<SwimmerProfile[]>([]);
  const addWorkoutForDateRef = useRef<string | null>(null);

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const normDate = (d: string | undefined) => (d && typeof d === "string" ? d.slice(0, 10) : d);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Fetch swimmer list for coach
  useEffect(() => {
    if (role !== "coach") return;
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "swimmer")
      .order("full_name")
      .then(({ data }) => setSwimmers((data as SwimmerProfile[]) ?? []));
  }, [role]);

  // Fetch workouts for swimmer (day view) — RLS restricts to assigned workouts
  useEffect(() => {
    if (role !== "swimmer" || viewMode !== "day" || !user) return;

    async function fetchWorkouts() {
      setSwimmerLoading(true);
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .eq("date", dateKey)
        .order("created_at", { ascending: true });

      setViewWorkouts(
        (data ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey }))
      );
      setSwimmerLoading(false);
    }

    fetchWorkouts();
  }, [dateKey, role, viewMode, user?.id]);

  // Fetch workouts for coach (day view)
  useEffect(() => {
    if (!dateKey || role !== "coach" || viewMode !== "day" || !user) return;
    const isAddingWorkout = addWorkoutForDateRef.current === dateKey;
    if (!isAddingWorkout) setCoachEditMode(false);

    async function fetchWorkouts() {
      setCoachLoading(true);
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .eq("date", dateKey)
        .order("created_at", { ascending: true });

      const rows = (data ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey }));
      if (isAddingWorkout) {
        addWorkoutForDateRef.current = null;
        setCoachWorkouts([
          ...rows,
          { id: "", date: dateKey, content: "", session: null, workout_type: null, workout_category: null, assigned_to: null },
        ]);
        setCoachEditMode(true);
      } else {
        setCoachWorkouts(rows);
      }
      setCoachLoading(false);
    }

    fetchWorkouts();
  }, [dateKey, role, viewMode, user?.id]);

  // Fetch workouts for week view — RLS handles filtering automatically
  useEffect(() => {
    if (viewMode !== "week" || !user) return;

    async function fetchWeekWorkouts() {
      setRangeLoading(true);
      const weekStart = startOfWeek(selectedDate, { weekStartsOn });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn });
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date", { ascending: true });

      setWeekWorkouts(data ?? []);
      setRangeLoading(false);
    }

    fetchWeekWorkouts();
  }, [selectedDate, viewMode, weekStartsOn, user?.id]);

  // Fetch workouts for month view — RLS handles filtering automatically
  useEffect(() => {
    if (viewMode !== "month" || !user) return;

    async function fetchMonthWorkouts() {
      setRangeLoading(true);
      const monthStart = startOfMonth(selectedDate);
      const monthEnd = endOfMonth(selectedDate);
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      setMonthWorkouts(data ?? []);
      setRangeLoading(false);
    }

    fetchMonthWorkouts();
  }, [selectedDate, viewMode, user?.id]);

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
          workout_type: w.workout_type,
          workout_category: w.workout_category,
          assigned_to: w.assigned_to,
          updated_at: new Date().toISOString(),
        })
        .eq("id", w.id);
      if (error) { alert(error.message); setLoading(false); return; }
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("workouts").insert(
        toInsert.map((w) => ({
          date: dateKey,
          content: w.content,
          workout_type: w.workout_type,
          workout_category: w.workout_category,
          assigned_to: w.assigned_to ?? null,
        }))
      );
      if (error) { alert(error.message); setLoading(false); return; }
    }

    const { data: rows } = await supabase
      .from("workouts")
      .select("*")
      .eq("date", dateKey)
      .order("created_at", { ascending: true });

    setCoachWorkouts(
      (rows ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey }))
    );
    setLoading(false);
    setSaved(true);
    setCoachEditMode(false);
    setTimeout(() => setSaved(false), 2000);
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
    setCoachWorkouts((prev) => [
      ...prev,
      { id: "", date: dateKey, content: "", session: null, workout_type: null, workout_category: null, assigned_to: null },
    ]);
  }

  function updateCoachWorkout(index: number, updates: Partial<Workout>) {
    setCoachWorkouts((prev) =>
      prev.map((w, i) => (i === index ? { ...w, ...updates } : w))
    );
  }

  function removeCoachWorkout(index: number) {
    setCoachWorkouts((prev) => prev.filter((_, i) => i !== index));
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
    setCoachEditMode(true);
  };

  const goToDayAndAddWorkout = (day: Date) => {
    addWorkoutForDateRef.current = format(day, "yyyy-MM-dd");
    setSelectedDate(day);
    setViewMode("day");
    setCoachEditMode(true);
  };

  const handleMonthCalendarSelect = (date: Date) => {
    if (!date) return;
    setSelectedDate(date);
    setExpandedWeekKey(format(startOfWeek(date, { weekStartsOn }), "yyyy-MM-dd"));
    setExpandedMonthDayKey(format(date, "yyyy-MM-dd"));
  };

  const DateToggleBar = () => (
    <div className="mb-5 flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
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
    <div className="mb-4 flex gap-1 rounded-lg border bg-card p-1">
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

  // Redirect in progress — render nothing
  if (!user || !role) return null;

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-md flex-col px-5 pb-8 pt-6 w-full min-w-0">
        {/* Header */}
        <div className="mb-5 flex w-full min-w-0 items-center justify-between gap-2">
          <h1 className="flex shrink-0 items-center gap-2 text-2xl font-bold">
            <Waves className="size-7 text-primary" />
            FlipTurn
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <span className="rounded-md border border-input bg-muted/50 px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
              {profile?.full_name ?? role}
            </span>
            <Link href="/settings">
              <Button variant="ghost" size="icon" className="size-9" aria-label="Settings">
                <Settings className="size-5" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Sign out"
              onClick={signOut}
            >
              <LogOut className="size-5" />
            </Button>
          </div>
        </div>

        {/* Swimmer view */}
        {role === "swimmer" && (
          <div className="flex flex-1 flex-col">
            <DateToggleBar />
            <ViewToggle />

            {viewMode === "day" && (
              <Card className="flex flex-1 flex-col">
                <CardContent className="flex flex-1 flex-col p-5 pt-4">
                  {swimmerLoading ? (
                    <div className="flex flex-1 items-center justify-center py-12">
                      <p className="text-muted-foreground">Loading...</p>
                    </div>
                  ) : viewWorkouts.length > 0 ? (
                    <div className="space-y-4">
                      {viewWorkouts.map((workout, i) => (
                        <div key={workout.id || i} className="rounded-lg border bg-card p-4">
                          <WorkoutBlock
                            workout={workout}
                            dateKey={dateKey}
                            showLabel={viewWorkouts.length > 1}
                            feedbackRefreshKey={feedbackRefreshKey}
                            onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                      <p className="text-muted-foreground">No workout planned for this day.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {viewMode === "week" && (
              <Card className="flex flex-1 flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  {rangeLoading ? (
                    <div className="flex flex-1 items-center justify-center py-12">
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
                          <div
                            key={day.toISOString()}
                            className={`rounded-lg border bg-card overflow-hidden ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-accent/50"
                              onClick={() => {
                                setExpandedDayKey(isExpanded ? null : dayKey);
                                setSelectedDate(day);
                              }}
                            >
                              <div>
                                <p className="mb-2 text-sm font-medium text-muted-foreground">
                                  {format(day, "EEE, MMM d")}
                                </p>
                                {dayWorkouts.length > 0 ? (
                                  <div className="space-y-1 font-sans text-[14px] text-muted-foreground">
                                    {dayWorkouts.map((w, wi) => (
                                      <p key={wi}>{workoutLabel(w)}</p>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">No workout</p>
                                )}
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                              )}
                            </button>
                            {isExpanded && dayWorkouts.length > 0 && (
                              <div className="animate-in slide-in-from-top-2 border-t px-4 py-3 duration-200 space-y-4">
                                {dayWorkouts.map((workout, i) => (
                                  <WorkoutBlock
                                    key={workout.id || i}
                                    workout={workout}
                                    dateKey={dayKey}
                                    showLabel={dayWorkouts.length > 1}
                                    feedbackRefreshKey={feedbackRefreshKey}
                                    onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                                    className="mt-2"
                                    compact
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()
                  )}
                </CardContent>
              </Card>
            )}

            {viewMode === "month" && (
              <div className="flex flex-1 flex-col gap-4">
                <Card className="overflow-hidden w-full">
                  <CardContent className="p-0 w-full">
                    <Calendar
                      className="w-full min-w-0"
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
                        workoutDots1: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1.5 after:rounded-full after:bg-primary",
                        workoutDots2: "relative before:content-[''] before:absolute before:bottom-1 before:left-[calc(50%-6px)] before:size-1.5 before:rounded-full before:bg-primary after:content-[''] after:absolute after:bottom-1 after:left-[calc(50%+2px)] after:size-1.5 after:rounded-full after:bg-primary",
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
                              className="flex w-full items-center justify-between px-4 py-3 text-left"
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedWeekKey(null);
                                  setExpandedMonthDayKey(null);
                                } else {
                                  setExpandedWeekKey(key);
                                  const selectedInWeek = isWithinInterval(selectedDate, { start, end });
                                  const selectedDayKey = format(selectedDate, "yyyy-MM-dd");
                                  const selectedHasWorkout = weekWorkoutsList.some((w) => normDate(w.date) === selectedDayKey);
                                  setExpandedMonthDayKey(selectedInWeek && selectedHasWorkout ? selectedDayKey : null);
                                }
                              }}
                            >
                              <span className="text-sm font-medium">
                                Week {weeks.findIndex((w) => w.key === key) + 1}: {format(start, "MMM d")}–{format(end, "MMM d")}
                              </span>
                              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                {workoutCount} workout{workoutCount !== 1 ? "s" : ""}
                                {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="animate-in slide-in-from-top-2 border-t px-4 py-3 space-y-2 duration-200">
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
                                          className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-accent/50"
                                          onClick={() => {
                                            setExpandedMonthDayKey(isDayExpanded ? null : dayKey);
                                            setSelectedDate(day);
                                          }}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="mb-1 text-sm font-medium text-muted-foreground">
                                              {format(day, "EEE, MMM d")}
                                            </p>
                                            {dayWorkouts.length > 0 ? (
                                              <div className="space-y-1 font-sans text-[14px] text-muted-foreground">
                                                {dayWorkouts.map((w, wi) => <p key={wi}>{workoutLabel(w)}</p>)}
                                              </div>
                                            ) : (
                                              <p className="text-sm text-muted-foreground">No workout</p>
                                            )}
                                          </div>
                                          {isDayExpanded ? (
                                            <ChevronUp className="size-4 shrink-0 text-muted-foreground ml-2" />
                                          ) : (
                                            <ChevronDown className="size-4 shrink-0 text-muted-foreground ml-2" />
                                          )}
                                        </button>
                                        {isDayExpanded && (
                                          <div className="animate-in slide-in-from-top-2 border-t px-3 py-2 duration-200 space-y-3">
                                            {dayWorkouts.length > 0 ? (
                                              dayWorkouts.map((workout, i) => (
                                                <WorkoutBlock
                                                  key={workout.id || i}
                                                  workout={workout}
                                                  dateKey={dayKey}
                                                  showLabel={dayWorkouts.length > 1}
                                                  feedbackRefreshKey={feedbackRefreshKey}
                                                  onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                                                  className="mt-2"
                                                  compact
                                                />
                                              ))
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
          <div className="flex flex-1 flex-col">
            <DateToggleBar />
            <ViewToggle />

            {viewMode === "day" && (
              <Card className="flex flex-1 flex-col">
                <CardContent className="flex flex-1 flex-col gap-4 p-5 pt-4">
                  {coachLoading ? (
                    <div className="flex flex-1 items-center justify-center py-12">
                      <p className="text-muted-foreground">Loading...</p>
                    </div>
                  ) : coachEditMode ? (
                    <>
                      <div className="flex flex-1 flex-col gap-4">
                        {coachWorkouts.map((workout, i) => (
                          <div key={workout.id || `new-${i}`} className="space-y-2 rounded-lg border p-4">
                            <div className="flex flex-wrap gap-2">
                              {/* Swimmer assignment */}
                              <select
                                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={workout.assigned_to || ""}
                                onChange={(e) => updateCoachWorkout(i, { assigned_to: e.target.value || null })}
                              >
                                <option value="">Assign to swimmer...</option>
                                {swimmers.length === 0 && (
                                  <option disabled value="">No swimmers registered</option>
                                )}
                                {swimmers.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.full_name || s.id}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={workout.workout_type || ""}
                                onChange={(e) => updateCoachWorkout(i, { workout_type: e.target.value || null })}
                              >
                                {WORKOUT_TYPES.map((v) => (
                                  <option key={v || "empty"} value={v}>{v || "Type"}</option>
                                ))}
                              </select>
                              <select
                                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={workout.workout_category || ""}
                                onChange={(e) => updateCoachWorkout(i, { workout_category: e.target.value || null })}
                              >
                                {WORKOUT_CATEGORIES.map((v) => (
                                  <option key={v || "empty"} value={v}>{v || "Category"}</option>
                                ))}
                              </select>
                            </div>
                            <Textarea
                              placeholder="Warm-up: 200 free, 4×50 kick...
Main set: 8×100 @ 1:30...
Cool-down: 200 easy"
                              value={workout.content}
                              onChange={(e) => updateCoachWorkout(i, { content: e.target.value })}
                              className="min-h-[200px] resize-none"
                            />
                            {workout.content && (
                              <WorkoutAnalysis
                                content={workout.content}
                                date={dateKey}
                                workoutId={workout.id || undefined}
                                refreshKey={feedbackRefreshKey}
                                readOnly
                              />
                            )}
                            {coachWorkouts.length >= 2 && (
                              <div className="flex gap-2 pt-2">
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  onClick={saveWorkouts}
                                  disabled={loading || coachLoading}
                                >
                                  {saved ? "Saved ✓" : "Save"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => removeCoachWorkout(i)}
                                  disabled={loading || coachLoading}
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="flex justify-center pt-2">
                          <Button variant="outline" size="icon" onClick={addCoachWorkout} className="size-10" aria-label="Add workout">
                            <Plus className="size-5" />
                          </Button>
                        </div>
                      </div>
                      {coachWorkouts.length >= 1 && coachWorkouts.length < 2 && (
                        <div className="flex gap-2">
                          <Button className="flex-1" onClick={saveWorkouts} disabled={loading || coachLoading}>
                            {saved ? "Saved ✓" : "Save"}
                          </Button>
                          <Button variant="outline" className="flex-1" onClick={deleteAllWorkouts} disabled={loading || coachLoading}>
                            Delete
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-1 flex-col gap-4">
                      {coachWorkouts.length > 0 ? (
                        coachWorkouts.map((workout, i) => {
                          const assignedSwimmer = swimmers.find((s) => s.id === workout.assigned_to);
                          return (
                            <div key={workout.id || i} className="relative rounded-lg border bg-card p-4">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-2 top-2 size-8"
                                onClick={() => setCoachEditMode(true)}
                                aria-label="Edit workout"
                              >
                                <Pencil className="size-4" />
                              </Button>
                              {assignedSwimmer && (
                                <p className="mb-2 text-xs font-medium text-primary">
                                  {assignedSwimmer.full_name ?? "Swimmer"}
                                </p>
                              )}
                              <WorkoutBlock
                                workout={workout}
                                dateKey={dateKey}
                                showLabel={coachWorkouts.length > 1}
                                feedbackRefreshKey={feedbackRefreshKey}
                                onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                                readOnly
                              />
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-1 flex-col items-center justify-center py-12">
                          <p className="text-muted-foreground">No workout planned for this day.</p>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => { addCoachWorkout(); setCoachEditMode(true); }}
                            className="mt-4 size-10"
                            aria-label="Add workout"
                          >
                            <Plus className="size-5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {viewMode === "week" && (
              <Card className="flex flex-1 flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  {rangeLoading ? (
                    <div className="flex flex-1 items-center justify-center py-12">
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
                          <div
                            key={day.toISOString()}
                            className={`rounded-lg border bg-card overflow-hidden ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-accent/50"
                              onClick={() => {
                                setExpandedDayKey(isExpanded ? null : dayKey);
                                setSelectedDate(day);
                              }}
                            >
                              <div>
                                <p className="mb-2 text-sm font-medium text-muted-foreground">
                                  {format(day, "EEE, MMM d")}
                                </p>
                                {dayWorkouts.length > 0 ? (
                                  <div className="space-y-1 font-sans text-[14px] text-muted-foreground">
                                    {dayWorkouts.map((w, wi) => <p key={wi}>{workoutLabel(w)}</p>)}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">No workout</p>
                                )}
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                              )}
                            </button>
                            {isExpanded && (
                              <div className="animate-in slide-in-from-top-2 border-t px-4 py-3 duration-200 space-y-4">
                                {dayWorkouts.length > 0 ? (
                                  <>
                                    {dayWorkouts.map((workout, i) => (
                                      <WorkoutBlock
                                        key={workout.id || i}
                                        workout={workout}
                                        dateKey={dayKey}
                                        showLabel={dayWorkouts.length > 1}
                                        feedbackRefreshKey={feedbackRefreshKey}
                                        className="mt-2"
                                        compact
                                        readOnly
                                      />
                                    ))}
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
                    })()
                  )}
                </CardContent>
              </Card>
            )}

            {viewMode === "month" && (
              <div className="flex flex-1 flex-col gap-4">
                <Card className="overflow-hidden w-full">
                  <CardContent className="p-0 w-full">
                    <Calendar
                      className="w-full min-w-0"
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
                        workoutDots1: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1.5 after:rounded-full after:bg-primary",
                        workoutDots2: "relative before:content-[''] before:absolute before:bottom-1 before:left-[calc(50%-6px)] before:size-1.5 before:rounded-full before:bg-primary after:content-[''] after:absolute after:bottom-1 after:left-[calc(50%+2px)] after:size-1.5 after:rounded-full after:bg-primary",
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
                              className="flex w-full items-center justify-between px-4 py-3 text-left"
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedWeekKey(null);
                                  setExpandedMonthDayKey(null);
                                } else {
                                  setExpandedWeekKey(key);
                                  const selectedInWeek = isWithinInterval(selectedDate, { start, end });
                                  const selectedDayKey = format(selectedDate, "yyyy-MM-dd");
                                  const selectedHasWorkout = weekWorkoutsList.some((w) => normDate(w.date) === selectedDayKey);
                                  setExpandedMonthDayKey(selectedInWeek && selectedHasWorkout ? selectedDayKey : null);
                                }
                              }}
                            >
                              <span className="text-sm font-medium">
                                Week {weeks.findIndex((w) => w.key === key) + 1}: {format(start, "MMM d")}–{format(end, "MMM d")}
                              </span>
                              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                {workoutCount} workout{workoutCount !== 1 ? "s" : ""}
                                {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="animate-in slide-in-from-top-2 border-t px-4 py-3 space-y-2 duration-200">
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
                                          className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-accent/50"
                                          onClick={() => {
                                            setExpandedMonthDayKey(isDayExpanded ? null : dayKey);
                                            setSelectedDate(day);
                                          }}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="mb-1 text-sm font-medium text-muted-foreground">
                                              {format(day, "EEE, MMM d")}
                                            </p>
                                            {dayWorkouts.length > 0 ? (
                                              <div className="space-y-1 font-sans text-[14px] text-muted-foreground">
                                                {dayWorkouts.map((w, wi) => <p key={wi}>{workoutLabel(w)}</p>)}
                                              </div>
                                            ) : (
                                              <p className="text-sm text-muted-foreground">No workout</p>
                                            )}
                                          </div>
                                          {isDayExpanded ? (
                                            <ChevronUp className="size-4 shrink-0 text-muted-foreground ml-2" />
                                          ) : (
                                            <ChevronDown className="size-4 shrink-0 text-muted-foreground ml-2" />
                                          )}
                                        </button>
                                        {isDayExpanded && (
                                          <div className="animate-in slide-in-from-top-2 border-t px-3 py-2 duration-200 space-y-3">
                                            {dayWorkouts.length > 0 ? (
                                              <>
                                                {dayWorkouts.map((workout, i) => (
                                                  <WorkoutBlock
                                                    key={workout.id || i}
                                                    workout={workout}
                                                    dateKey={dayKey}
                                                    showLabel={dayWorkouts.length > 1}
                                                    feedbackRefreshKey={feedbackRefreshKey}
                                                    className="mt-2"
                                                    compact
                                                    readOnly
                                                  />
                                                ))}
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
