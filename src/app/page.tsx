"use client";

import { useState, useEffect } from "react";
import { format, addDays, subDays } from "date-fns";
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
import { Waves, User, ClipboardList, ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";

type Mode = "coach" | "swimmer";

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

  const dateKey = format(selectedDate, "yyyy-MM-dd");

  // Fetch workout when date changes (swimmer mode)
  useEffect(() => {
    if (mode !== "swimmer") return;

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
  }, [dateKey, mode]);

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

  async function saveWorkout() {
    if (!dateKey) return;

    setLoading(true);
    setSaved(false);

    await supabase.from("workouts").upsert(
      { date: dateKey, content: workoutContent, updated_at: new Date().toISOString() },
      { onConflict: "date" }
    );

    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const changeDate = (delta: number) => {
    setSelectedDate((d) => (delta > 0 ? addDays(d, 1) : subDays(d, 1)));
  };

  const DateToggleBar = () => (
    <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
      <Button
        variant="ghost"
        size="icon"
        className="size-10 shrink-0"
        onClick={() => changeDate(-1)}
      >
        <ChevronLeft className="size-5" />
        <span className="sr-only">Previous day</span>
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="min-w-0 flex-1 gap-2 font-medium"
          >
            <CalendarIcon className="size-4 shrink-0" />
            <span className="truncate">{format(selectedDate, "EEE, MMM d")}</span>
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
        <span className="sr-only">Next day</span>
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
              Swim
            </h1>
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

          <TabsContent value="swimmer" className="mt-0 flex flex-1 flex-col">
            <DateToggleBar />
            <Card className="flex flex-1 flex-col">
              <CardContent className="flex flex-1 flex-col p-5 pt-4">
                {swimmerLoading ? (
                  <div className="flex flex-1 items-center justify-center py-12">
                    <p className="text-muted-foreground">Loading...</p>
                  </div>
                ) : viewWorkout?.content ? (
                  <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed">
                    {viewWorkout.content}
                  </pre>
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
                  <Textarea
                    placeholder="Warm-up: 200 free, 4×50 kick...
Main set: 8×100 @ 1:30...
Cool-down: 200 easy"
                    value={workoutContent}
                    onChange={(e) => setWorkoutContent(e.target.value)}
                    className="min-h-[min(40rem,60dvh)] flex-1 resize-none"
                  />
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
