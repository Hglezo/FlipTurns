"use client";

import { useState, useEffect } from "react";
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
  min,
} from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { Waves, User, ClipboardList, ChevronLeft, ChevronRight, CalendarIcon, MessageSquare, CalendarDays, CalendarRange, ChevronDown, ChevronUp } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { WorkoutAnalysis } from "@/components/workout-analysis";

type Mode = "coach" | "swimmer";
type ViewMode = "day" | "week" | "month";

interface Workout {
  id: string;
  date: string;
  content: string;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("swimmer");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [workoutContent, setWorkoutContent] = useState("");
  const [viewWorkout, setViewWorkout] = useState<Workout | null>(null);
  const [swimmerLoading, setSwimmerLoading] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [muscleIntensity, setMuscleIntensity] = useState<number | null>(null);
  const [cardioIntensity, setCardioIntensity] = useState<number | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([]);
  const [monthWorkouts, setMonthWorkouts] = useState<Workout[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [expandedMonthDayKey, setExpandedMonthDayKey] = useState<string | null>(null);

  const dateKey = format(selectedDate, "yyyy-MM-dd");

  const PREVIEW_LENGTH = 80;

  // Fetch workout when date changes (swimmer mode) - skip in week view, we have weekWorkouts
  useEffect(() => {
    if (mode !== "swimmer" || viewMode === "week") return;

    async function fetchWorkout() {
      setSwimmerLoading(true);
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .eq("date", dateKey)
        .single();

      setViewWorkout(data ? { ...data, date: dateKey } : null);
      setSwimmerLoading(false);
    }

    fetchWorkout();
  }, [dateKey, mode, viewMode]);

  // Fetch workout when date changes (coach mode)
  useEffect(() => {
    if (!dateKey || mode !== "coach") return;

    async function fetchWorkout() {
      setCoachLoading(true);
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .eq("date", dateKey)
        .single();

      setWorkoutContent(data?.content ?? "");
      setCoachLoading(false);
    }

    fetchWorkout();
  }, [dateKey, mode]);

  // Fetch workouts for week view
  useEffect(() => {
    if (mode !== "swimmer" || viewMode !== "week") return;

    async function fetchWeekWorkouts() {
      setRangeLoading(true);
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
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
  }, [selectedDate, mode, viewMode]);

  // Fetch workouts for month view
  useEffect(() => {
    if (mode !== "swimmer" || viewMode !== "month") return;

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
  }, [selectedDate, mode, viewMode]);

  async function saveWorkout() {
    if (!dateKey) return;

    setLoading(true);
    setSaved(false);

    const { error } = await supabase.from("workouts").upsert(
      { date: dateKey, content: workoutContent, updated_at: new Date().toISOString() },
      { onConflict: "date" }
    );

    setLoading(false);
    if (error) {
      console.error("Failed to save workout:", error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveFeedback() {
    if (muscleIntensity === null || cardioIntensity === null) return;

    setFeedbackSaving(true);
    setFeedbackSaved(false);

    await supabase.from("feedback").insert({
      date: dateKey,
      feedback_text: feedbackText || null,
      muscle_intensity: muscleIntensity,
      cardio_intensity: cardioIntensity,
    });

    setFeedbackSaving(false);
    setFeedbackSaved(true);
    setTimeout(() => {
      setFeedbackSaved(false);
      setFeedbackOpen(false);
      setFeedbackText("");
      setMuscleIntensity(null);
      setCardioIntensity(null);
    }, 1500);
  }

  const changeDate = (delta: number) => {
    if (mode === "coach" || viewMode === "day") {
      setSelectedDate((d) => (delta > 0 ? addDays(d, 1) : subDays(d, 1)));
    } else if (viewMode === "week") {
      setExpandedDayKey(null);
      setSelectedDate((d) => (delta > 0 ? addWeeks(d, 1) : subWeeks(d, 1)));
    } else {
      setSelectedDate((d) => (delta > 0 ? addMonths(d, 1) : subMonths(d, 1)));
    }
  };

  const getDateBarLabel = () => {
    if (mode === "coach" || viewMode === "day") return format(selectedDate, "EEE, MMM d");
    if (viewMode === "week") {
      const wStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const wEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
      return `${format(wStart, "MMM d")} – ${format(wEnd, "MMM d")}`;
    }
    return format(selectedDate, "MMMM yyyy");
  };

  const IntensityScale = ({
    value,
    onChange,
    label,
  }: {
    value: number | null;
    onChange: (n: number) => void;
    label: string;
  }) => (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            type="button"
            variant={value === n ? "default" : "outline"}
            size="icon"
            className="size-10 shrink-0"
            onClick={() => onChange(n)}
          >
            {n}
          </Button>
        ))}
      </div>
    </div>
  );

  const DateToggleBar = () => (
    <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
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
          <Button
            variant="ghost"
            className="min-w-0 flex-1 gap-2 font-medium"
          >
            <CalendarIcon className="size-4 shrink-0" />
            <span className="truncate">{getDateBarLabel()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
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

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-md flex-col px-5 pb-8 pt-6">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="flex flex-1 flex-col">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h1 className="flex shrink-0 items-center gap-2 text-2xl font-bold">
              <Waves className="size-7 text-primary" />
              FlipTurn
            </h1>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <TabsList className="h-9 w-fit">
              <TabsTrigger value="swimmer" className="flex items-center gap-1.5 px-3 text-sm">
                <User className="size-4" />
                Swimmer
              </TabsTrigger>
              <TabsTrigger value="coach" className="flex items-center gap-1.5 px-3 text-sm">
                <ClipboardList className="size-4" />
                Coach
              </TabsTrigger>
            </TabsList>
            </div>
          </div>

          <TabsContent value="swimmer" className="mt-0 flex flex-1 flex-col">
            <DateToggleBar />
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
            {viewMode === "day" && (
              <>
                <Card className="flex flex-1 flex-col">
                  <CardContent className="flex flex-1 flex-col p-5 pt-4">
                    {swimmerLoading ? (
                      <div className="flex flex-1 items-center justify-center py-12">
                        <p className="text-muted-foreground">Loading...</p>
                      </div>
                    ) : viewWorkout?.content ? (
                      <>
                        <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed">
                          {viewWorkout.content}
                        </pre>
                        <WorkoutAnalysis content={viewWorkout.content} className="mt-4" />
                      </>
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                        <p className="text-muted-foreground">
                          No workout for this day.
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground/80">
                          Use the arrows or calendar to pick another date.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                {viewWorkout?.content && (
                  <Sheet open={feedbackOpen} onOpenChange={setFeedbackOpen}>
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        className="mt-4 w-full gap-2"
                      >
                        <MessageSquare className="size-4" />
                        Give feedback
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Workout feedback</SheetTitle>
                      </SheetHeader>
                      <div className="flex flex-col gap-6 p-4">
                        <div className="space-y-2">
                          <label htmlFor="feedback" className="text-sm font-medium text-foreground">
                            Your feedback (optional)
                          </label>
                          <Textarea
                            id="feedback"
                            placeholder="How did the workout feel? Any notes..."
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            className="min-h-[100px] resize-none"
                          />
                        </div>
                        <IntensityScale
                          label="How intense was it muscle-wise? (1–5)"
                          value={muscleIntensity}
                          onChange={setMuscleIntensity}
                        />
                        <IntensityScale
                          label="How intense was it cardio-wise? (1–5)"
                          value={cardioIntensity}
                          onChange={setCardioIntensity}
                        />
                        <Button
                          onClick={saveFeedback}
                          disabled={
                            feedbackSaving ||
                            muscleIntensity === null ||
                            cardioIntensity === null
                          }
                        >
                          {feedbackSaved ? "Submitted ✓" : feedbackSaving ? "Saving..." : "Submit feedback"}
                        </Button>
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
              </>
            )}

            {viewMode === "week" && (
              <>
                <Card className="flex flex-1 flex-col">
                  <CardContent className="flex flex-1 flex-col gap-3 p-4">
                    {rangeLoading ? (
                      <div className="flex flex-1 items-center justify-center py-12">
                        <p className="text-muted-foreground">Loading...</p>
                      </div>
                    ) : (
                      (() => {
                        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
                        const days = eachDayOfInterval({
                          start: weekStart,
                          end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
                        });
                        return days.map((day) => {
                          const dayKey = format(day, "yyyy-MM-dd");
                          const workout = weekWorkouts.find((w) => w.date === dayKey);
                          const isExpanded = expandedDayKey === dayKey;
                          const preview = workout?.content
                            ? workout.content.slice(0, PREVIEW_LENGTH) + (workout.content.length > PREVIEW_LENGTH ? "…" : "")
                            : null;
                          return (
                            <div
                              key={day.toISOString()}
                              className="rounded-lg border bg-card overflow-hidden"
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
                                  {workout?.content ? (
                                    <p className="line-clamp-2 font-sans text-[14px] text-muted-foreground">
                                      {preview}
                                    </p>
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
                              {isExpanded && workout?.content && (
                                <div className="animate-in slide-in-from-top-2 border-t px-4 py-3 duration-200 space-y-3">
                                  <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed">
                                    {workout.content}
                                  </pre>
                                  <WorkoutAnalysis content={workout.content} />
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()
                    )}
                  </CardContent>
                </Card>
                {weekWorkouts.some((w) => w.date === dateKey) && (
                  <Sheet open={feedbackOpen} onOpenChange={setFeedbackOpen}>
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        className="mt-4 w-full gap-2"
                      >
                        <MessageSquare className="size-4" />
                        Give feedback
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Workout feedback</SheetTitle>
                      </SheetHeader>
                      <div className="flex flex-col gap-6 p-4">
                        <div className="space-y-2">
                          <label htmlFor="feedback-week" className="text-sm font-medium text-foreground">
                            Your feedback (optional)
                          </label>
                          <Textarea
                            id="feedback-week"
                            placeholder="How did the workout feel? Any notes..."
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            className="min-h-[100px] resize-none"
                          />
                        </div>
                        <IntensityScale
                          label="How intense was it muscle-wise? (1–5)"
                          value={muscleIntensity}
                          onChange={setMuscleIntensity}
                        />
                        <IntensityScale
                          label="How intense was it cardio-wise? (1–5)"
                          value={cardioIntensity}
                          onChange={setCardioIntensity}
                        />
                        <Button
                          onClick={saveFeedback}
                          disabled={
                            feedbackSaving ||
                            muscleIntensity === null ||
                            cardioIntensity === null
                          }
                        >
                          {feedbackSaved ? "Submitted ✓" : feedbackSaving ? "Saving..." : "Submit feedback"}
                        </Button>
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
              </>
            )}

            {viewMode === "month" && (
              <div className="flex flex-1 flex-col gap-4">
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      month={selectedDate}
                      onMonthChange={(d) => {
                        setSelectedDate(d);
                        setExpandedWeekKey(null);
                        setExpandedMonthDayKey(null);
                      }}
                      modifiers={{
                        hasWorkout: monthWorkouts.map((w) => new Date(w.date + "T12:00:00")),
                      }}
                      modifiersClassNames={{
                        hasWorkout: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1.5 after:rounded-full after:bg-primary",
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
                      let weekStart = monthStart;
                      while (weekStart <= monthEnd) {
                        const weekEnd = min([addDays(weekStart, 6), monthEnd]);
                        weeks.push({
                          start: weekStart,
                          end: weekEnd,
                          key: format(weekStart, "yyyy-MM-dd"),
                        });
                        weekStart = addDays(weekEnd, 1);
                      }
                      return weeks.map(({ start, end, key }) => {
                        const weekWorkoutsList = monthWorkouts.filter((w) =>
                          isWithinInterval(new Date(w.date + "T12:00:00"), { start, end })
                        );
                        const workoutCount = weekWorkoutsList.length;
                        const isExpanded = expandedWeekKey === key;
                        return (
                          <div
                            key={key}
                            className="rounded-lg border bg-card overflow-hidden"
                          >
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
                                  const selectedHasWorkout = weekWorkoutsList.some((w) => w.date === selectedDayKey);
                                  setExpandedMonthDayKey(selectedInWeek && selectedHasWorkout ? selectedDayKey : null);
                                }
                              }}
                            >
                              <span className="text-sm font-medium">
                                Week {weeks.findIndex((w) => w.key === key) + 1}: {format(start, "MMM d")}–{format(end, "MMM d")}
                              </span>
                              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                {workoutCount} workout{workoutCount !== 1 ? "s" : ""}
                                {isExpanded ? (
                                  <ChevronUp className="size-4" />
                                ) : (
                                  <ChevronDown className="size-4" />
                                )}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="animate-in slide-in-from-top-2 border-t px-4 py-3 space-y-2 duration-200">
                                {weekWorkoutsList.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No workouts this week</p>
                                ) : (
                                  (() => {
                                    const daysInWeek = eachDayOfInterval({ start, end });
                                    return daysInWeek.map((day) => {
                                      const dayKey = format(day, "yyyy-MM-dd");
                                      const workout = weekWorkoutsList.find((w) => w.date === dayKey);
                                      const isDayExpanded = expandedMonthDayKey === dayKey;
                                      const preview = workout?.content
                                        ? workout.content.slice(0, PREVIEW_LENGTH) + (workout.content.length > PREVIEW_LENGTH ? "…" : "")
                                        : null;
                                      return (
                                        <div
                                          key={dayKey}
                                          className="rounded-lg border bg-card overflow-hidden"
                                        >
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
                                              {workout?.content ? (
                                                <p className="line-clamp-2 font-sans text-[14px] text-muted-foreground">
                                                  {preview}
                                                </p>
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
                                          {isDayExpanded && workout?.content && (
                                            <div className="animate-in slide-in-from-top-2 border-t px-3 py-2 duration-200 space-y-2">
                                              <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed">
                                                {workout.content}
                                              </pre>
                                              <WorkoutAnalysis content={workout.content} />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    });
                                  })()
                                )}
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
          </TabsContent>

          <TabsContent value="coach" className="mt-0 flex flex-1 flex-col">
            <DateToggleBar />
            <Card className="flex flex-1 flex-col">
              <CardContent className="flex flex-1 flex-col gap-4 p-5 pt-4">
                {coachLoading ? (
                  <div className="flex flex-1 items-center justify-center py-12">
                    <p className="text-muted-foreground">Loading...</p>
                  </div>
                ) : (
                  <>
                    <Textarea
                      placeholder="Warm-up: 200 free, 4×50 kick...
Main set: 8×100 @ 1:30...
Cool-down: 200 easy"
                      value={workoutContent}
                      onChange={(e) => setWorkoutContent(e.target.value)}
                      className="min-h-[min(40rem,60dvh)] flex-1 resize-none"
                    />
                    {workoutContent && (
                      <WorkoutAnalysis content={workoutContent} />
                    )}
                  </>
                )}
                <Button
                  className="w-full"
                  onClick={saveWorkout}
                  disabled={loading || coachLoading}
                >
                  {saved ? "Saved ✓" : "Save workout"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
