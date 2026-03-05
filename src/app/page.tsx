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

const badgeClass = "inline-flex items-center rounded-full bg-accent-blue/15 px-2.5 py-0.5 text-xs font-medium text-accent-blue";
const assigneeBadgeClass = "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground";

function WorkoutBlock({
  workout,
  dateKey,
  showLabel,
  feedbackRefreshKey,
  onFeedbackChange,
  assigneeBadge,
  className = "mt-4",
  readOnly,
  compact,
}: {
  workout: Workout;
  dateKey: string;
  showLabel: boolean;
  feedbackRefreshKey: number;
  onFeedbackChange?: () => void;
  assigneeBadge?: React.ReactNode;
  className?: string;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const hasTypeCategory = showLabel && (workout.workout_type?.trim() || workout.workout_category?.trim());
  return (
    <div className="space-y-4">
      {hasTypeCategory && (
        <div className={`flex flex-wrap justify-end gap-1.5 ${compact ? "mb-1" : "mb-2"}`}>
          {workout.workout_type?.trim() && (
            <span className={badgeClass}>{workout.workout_type.trim()}</span>
          )}
          {workout.workout_category?.trim() && (
            <span className={badgeClass}>{workout.workout_category.trim()}</span>
          )}
        </div>
      )}
      <pre className={`whitespace-pre-wrap font-sans leading-relaxed text-foreground/90 ${compact ? "text-[14px]" : "text-[15px]"}`}>{workout.content}</pre>
      <WorkoutAnalysis
        content={workout.content}
        date={dateKey}
        workoutId={workout.id}
        refreshKey={feedbackRefreshKey}
        onFeedbackChange={onFeedbackChange}
        className={className}
        readOnly={readOnly}
      />
      {assigneeBadge && (
        <div className="pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">Assigned to </span>
          {assigneeBadge}
        </div>
      )}
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
  const [editingWorkoutIndex, setEditingWorkoutIndex] = useState<number | null>(null);
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
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "swimmer")
      .order("full_name")
      .then(({ data }) => setSwimmers((data as SwimmerProfile[]) ?? []));
  }, [role]);

  // Fetch workouts for swimmer (day view). null = own, "" = all, uuid = that swimmer
  useEffect(() => {
    if (role !== "swimmer" || viewMode !== "day" || !user) return;

    async function fetchWorkouts() {
      setSwimmerLoading(true);
      let query = supabase
        .from("workouts")
        .select("*")
        .eq("date", dateKey)
        .order("created_at", { ascending: true });
      const filterId = selectedViewSwimmerId === "" ? null : (selectedViewSwimmerId ?? user.id);
      if (filterId) query = query.eq("assigned_to", filterId);

      const { data } = await query;
      setViewWorkouts(
        (data ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey }))
      );
      setSwimmerLoading(false);
    }

    fetchWorkouts();
  }, [dateKey, role, viewMode, user?.id, selectedViewSwimmerId]);

  // Fetch workouts for coach (day view)
  useEffect(() => {
    if (!dateKey || role !== "coach" || viewMode !== "day" || !user) return;
    const isAddingWorkout = addWorkoutForDateRef.current === dateKey;
    if (!isAddingWorkout) setEditingWorkoutIndex(null);

    async function fetchWorkouts() {
      setCoachLoading(true);
      let query = supabase
        .from("workouts")
        .select("*")
        .eq("date", dateKey)
        .order("created_at", { ascending: true });
      if (selectedCoachSwimmerId) query = query.eq("assigned_to", selectedCoachSwimmerId);

      const { data } = await query;
      const rows = (data ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey }));
      if (isAddingWorkout) {
        addWorkoutForDateRef.current = null;
        const newWorkout = { id: "", date: dateKey, content: "", session: null, workout_type: null, workout_category: null, assigned_to: selectedCoachSwimmerId ?? null };
        setCoachWorkouts([...rows, newWorkout]);
        setEditingWorkoutIndex(rows.length);
      } else {
        setCoachWorkouts(rows);
      }
      setCoachLoading(false);
    }

    fetchWorkouts();
  }, [dateKey, role, viewMode, user?.id, selectedCoachSwimmerId]);

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
      const swimmerFilterId = role === "swimmer" ? (selectedViewSwimmerId === "" ? null : (selectedViewSwimmerId ?? user?.id)) : null;
      if (role === "swimmer" && swimmerFilterId) query = query.eq("assigned_to", swimmerFilterId);
      if (role === "coach" && selectedCoachSwimmerId) query = query.eq("assigned_to", selectedCoachSwimmerId);

      const { data } = await query;
      setWeekWorkouts(data ?? []);
      setRangeLoading(false);
    }

    fetchWeekWorkouts();
  }, [selectedDate, viewMode, weekStartsOn, user?.id, role, selectedViewSwimmerId, selectedCoachSwimmerId]);

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
      const swimmerFilterId = role === "swimmer" ? (selectedViewSwimmerId === "" ? null : (selectedViewSwimmerId ?? user?.id)) : null;
      if (role === "swimmer" && swimmerFilterId) query = query.eq("assigned_to", swimmerFilterId);
      if (role === "coach" && selectedCoachSwimmerId) query = query.eq("assigned_to", selectedCoachSwimmerId);

      const { data } = await query;
      setMonthWorkouts(data ?? []);
      setRangeLoading(false);
    }

    fetchMonthWorkouts();
  }, [selectedDate, viewMode, user?.id, role, selectedViewSwimmerId, selectedCoachSwimmerId]);

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
    setEditingWorkoutIndex(null);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveSingleWorkout(index: number) {
    if (!dateKey || index < 0 || index >= coachWorkouts.length) return;
    const workout = coachWorkouts[index];
    setLoading(true);
    setSaved(false);

    if (workout.id) {
      const { error } = await supabase
        .from("workouts")
        .update({
          content: workout.content,
          workout_type: workout.workout_type,
          workout_category: workout.workout_category,
          assigned_to: workout.assigned_to,
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
          workout_type: workout.workout_type,
          workout_category: workout.workout_category,
          assigned_to: workout.assigned_to ?? null,
        })
        .select()
        .single();
      if (error) { alert(error.message); setLoading(false); return; }
      setCoachWorkouts((prev) =>
        prev.map((w, i) => (i === index ? { ...inserted, date: normDate(inserted?.date) ?? dateKey } : w))
      );
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
    setEditingWorkoutIndex(null);
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
      workout_type: null,
      workout_category: null,
      assigned_to: selectedCoachSwimmerId ?? null,
    };
    setCoachWorkouts((prev) => [...prev, newWorkout]);
    setEditingWorkoutIndex(coachWorkouts.length);
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
                    {selectedViewSwimmerId === "" ? "All swimmers" : (selectedViewSwimmerId ? swimmers.find((s) => s.id === selectedViewSwimmerId)?.full_name ?? "Swimmer" : (profile?.full_name ?? "My workouts"))}
                    <ChevronDown className="size-3.5 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[10rem]">
                  <DropdownMenuItem onClick={() => setSelectedViewSwimmerId(null)}>{profile?.full_name ?? "My workouts"}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedViewSwimmerId("")}>All swimmers</DropdownMenuItem>
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
            <Button variant="ghost" size="icon" className="size-9" aria-label="Sign out" onClick={signOut}>
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
              <div className="flex flex-1 flex-col">
                {swimmerLoading ? (
                  <div className="flex flex-1 items-center justify-center py-12">
                    <p className="text-muted-foreground">Loading...</p>
                  </div>
                ) : viewWorkouts.length > 0 ? (
                  <div className="space-y-4">
                    {viewWorkouts.map((workout, i) => {
                      const assignee = swimmers.find((s) => s.id === workout.assigned_to);
                      return (
                        <Card key={workout.id || i} className="py-4">
                          <CardContent className="px-4 py-0">
                            <WorkoutBlock
                              workout={workout}
                              dateKey={dateKey}
                              showLabel
                              feedbackRefreshKey={feedbackRefreshKey}
                              onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                              assigneeBadge={assignee && selectedViewSwimmerId === "" ? (
                                <span className={assigneeBadgeClass}>{assignee.full_name ?? "Swimmer"}</span>
                              ) : undefined}
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
              <div className="flex flex-1 flex-col gap-3">
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
                        <Card
                          key={day.toISOString()}
                          className={`overflow-hidden ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}
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
                                {dayWorkouts.map((workout, i) => {
                                  const assignee = swimmers.find((s) => s.id === workout.assigned_to);
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
                                      assigneeBadge={assignee && selectedViewSwimmerId === "" ? (
                                        <span className={assigneeBadgeClass}>{assignee.full_name ?? "Swimmer"}</span>
                                      ) : undefined}
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
                                              dayWorkouts.map((workout, i) => {
                                                const assignee = swimmers.find((s) => s.id === workout.assigned_to);
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
                                                    assigneeBadge={assignee && selectedViewSwimmerId === "" ? (
                                                      <span className={assigneeBadgeClass}>{assignee.full_name ?? "Swimmer"}</span>
                                                    ) : undefined}
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
          <div className="flex flex-1 flex-col">
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
                        coachWorkouts.map((workout, i) => {
                          const assignedSwimmer = swimmers.find((s) => s.id === workout.assigned_to);
                          const isEditing = editingWorkoutIndex === i;
                          return (
                            <Card key={workout.id || `new-${i}`} className="relative py-4">
                              {isEditing ? (
                                <CardContent className="pl-4 pr-4 py-0">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap gap-2">
                                      <select
                                        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={workout.assigned_to || ""}
                                        onChange={(e) => updateCoachWorkout(i, { assigned_to: e.target.value || null })}
                                      >
                                        <option value="">Assign to swimmer...</option>
                                        {swimmers.map((s) => (
                                          <option key={s.id} value={s.id}>{s.full_name || s.id}</option>
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
                                    <div className="flex gap-2 pt-2">
                                      <Button size="sm" onClick={() => saveSingleWorkout(i)} disabled={loading || coachLoading}>
                                        {saved ? "Saved ✓" : "Save"}
                                      </Button>
                                      <Button variant="outline" size="sm" onClick={() => setEditingWorkoutIndex(null)} disabled={loading}>
                                        Cancel
                                      </Button>
                                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => deleteSingleWorkout(i)} disabled={loading}>
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
                                    onClick={() => setEditingWorkoutIndex(i)}
                                    aria-label="Edit workout"
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                  <CardContent className="pl-4 pr-12 py-0">
                                    <WorkoutBlock
                                      workout={workout}
                                      dateKey={dateKey}
                                      showLabel={coachWorkouts.length > 1}
                                      assigneeBadge={!selectedCoachSwimmerId && assignedSwimmer ? (
                                        <span className={assigneeBadgeClass}>{assignedSwimmer.full_name ?? "Swimmer"}</span>
                                      ) : undefined}
                                      feedbackRefreshKey={feedbackRefreshKey}
                                      onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                                      readOnly
                                    />
                                  </CardContent>
                                </>
                              )}
                            </Card>
                          );
                        })
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
              <div className="flex flex-1 flex-col gap-3">
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
                        <Card
                          key={day.toISOString()}
                          className={`overflow-hidden ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}
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
                          </Card>
                        );
                      });
                    })()
                )}
              </div>
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
