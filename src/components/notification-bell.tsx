"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import { loadAndMergeWorkouts } from "@/lib/workouts";
import type { Workout, SwimmerProfile, SwimmerGroup } from "@/lib/types";
import { format, isToday, isTomorrow, isYesterday, isThisWeek, parseISO } from "date-fns";

const DISMISSED_IDS_KEY = "flipturn_notification_dismissed_ids";

function getDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_IDS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function addDismissedId(id: string) {
  if (typeof window === "undefined") return;
  const set = getDismissedIds();
  set.add(id);
  localStorage.setItem(DISMISSED_IDS_KEY, JSON.stringify([...set]));
}

function getCoachFirstName(fullName: string | null): string | null {
  if (!fullName?.trim()) return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first.toLowerCase() === "coach" ? null : first;
}

function formatWorkoutDateLine(dateStr: string, session: string | null): string {
  const d = parseISO(dateStr + "T12:00:00");
  const label = session?.trim() === "AM" || session?.trim() === "PM" ? session.trim() : "Anytime";
  if (isToday(d)) return `Today ${label}`;
  if (isTomorrow(d)) return `Tomorrow ${label}`;
  if (isThisWeek(d)) return `This week: ${format(d, "EEEE, MMMM d")} ${label}`;
  return `${format(d, "MMMM d, yyyy")} ${label}`;
}

function formatFeedbackDateLine(dateStr: string, session: string | null): string {
  const d = parseISO(dateStr + "T12:00:00");
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return `This week: ${format(d, "EEEE, MMMM d")}`;
  const label = session?.trim() === "AM" || session?.trim() === "PM" ? session.trim() : "Anytime";
  return `${format(d, "MMMM d, yyyy")} ${label}`;
}

interface NotificationItem {
  id: string;
  type: "workout_saved" | "feedback_added";
  date: string;
  title: string;
  subtitle?: string;
  workoutDate?: string;
}

interface NotificationBellProps {
  role: "coach" | "swimmer";
  userId: string;
  swimmerGroup: SwimmerGroup | null;
  swimmers: SwimmerProfile[];
  onWorkoutNotificationClick?: (workoutId: string, date: string) => void;
}

export function NotificationBell({ role, userId, swimmerGroup, swimmers, onWorkoutNotificationClick }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => getDismissedIds());

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      if (role === "swimmer") {
        const { data } = await supabase
          .from("workouts")
          .select("id, date, content, session, workout_category, assigned_to, assigned_to_group, updated_at, created_by")
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(50);
        const rows = (data ?? []) as Workout[];
        const merged = await loadAndMergeWorkouts(rows, swimmers);
        const forMe = merged.filter((w) => {
          if (w.assigned_to === userId) return true;
          if (w.assigned_to_group && swimmerGroup) {
            const ids = w.assignee_ids?.length ? w.assignee_ids : swimmers.filter((s) => s.swimmer_group === w.assigned_to_group).map((s) => s.id);
            return ids.includes(userId) || (!ids.length && w.assigned_to_group === swimmerGroup);
          }
          return false;
        });
        const { data: allCoaches } = await supabase.from("profiles").select("id, full_name").eq("role", "coach");
        const coachRows = (allCoaches ?? []) as { id: string; full_name: string | null }[];
        const coachNameMap = new Map(coachRows.map((p) => [p.id, p.full_name]));
        const fallbackCoachName = coachRows[0]?.full_name ?? null;
        setNotifications(
          forMe.map((w) => {
            const coachId = w.created_by;
            const coachName = getCoachFirstName(coachNameMap.get(coachId ?? "") ?? null) ?? getCoachFirstName(fallbackCoachName);
            const dateLine = formatWorkoutDateLine(w.date, w.session ?? null);
            const title = coachName ? `Coach ${coachName} wrote a new workout for:` : "Coach wrote a new workout for:";
            return {
              id: w.id,
              type: "workout_saved" as const,
              date: w.updated_at ?? w.date,
              title,
              subtitle: dateLine,
              workoutDate: w.date,
            };
          })
        );
      } else {
        const { data: feedbackRows } = await supabase
          .from("feedback")
          .select("id, date, workout_id, user_id, created_at, anonymous")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50);
        const withUser = (feedbackRows ?? []) as { id: string; date: string; workout_id?: string; user_id?: string; created_at: string; anonymous?: boolean }[];
        const workoutIds = withUser.map((f) => f.workout_id).filter(Boolean) as string[];
        let sessionByWorkout = new Map<string, string | null>();
        if (workoutIds.length > 0) {
          const { data: workouts } = await supabase.from("workouts").select("id, session").in("id", workoutIds);
          sessionByWorkout = new Map((workouts ?? []).map((w: { id: string; session: string | null }) => [w.id, w.session]));
        }
        const { data: profiles } = await supabase.from("profiles").select("id, full_name");
        const nameMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? "Someone"]));
        setNotifications(
          withUser.map((f) => {
            const swimmerName = f.anonymous ? "Someone" : (nameMap.get(f.user_id ?? "") ?? "Someone");
            const session = f.workout_id ? sessionByWorkout.get(f.workout_id) ?? null : null;
            const dateLine = formatFeedbackDateLine(f.date, session);
            return {
              id: f.id,
              type: "feedback_added" as const,
              date: f.created_at,
              title: `${swimmerName} added new feedback to:`,
              subtitle: dateLine,
            };
          })
        );
      }
    } finally {
      setLoading(false);
    }
  }, [role, userId, swimmerGroup, swimmers]);

  useEffect(() => {
    setDismissedIds(getDismissedIds());
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
  };

  const undismissed = notifications.filter((n) => !dismissedIds.has(n.id));
  const unreadCount = undismissed.length;
  const hasNew = unreadCount > 0;

  const handleDismissNotification = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    addDismissedId(id);
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 relative" aria-label="Notifications">
          <Bell className="size-5" />
          {hasNew && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[min(70vh,400px)] overflow-y-auto p-0">
        <div className="border-b px-3 py-2.5">
          <h3 className="font-semibold text-sm">Notifications</h3>
        </div>
        <div className="divide-y">
          {loading && notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : undismissed.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {role === "swimmer" ? "No new workouts" : "No new feedback"}
            </div>
          ) : (
            undismissed.map((n) => {
              const isWorkout = n.type === "workout_saved" && n.workoutDate;
              const isClickable = isWorkout && role === "swimmer" && onWorkoutNotificationClick;
              return (
                <div key={n.id} className="relative">
                  <button
                    type="button"
                    className={`w-full px-3 py-2.5 pr-10 text-left text-sm ${isClickable ? "hover:bg-accent cursor-pointer" : "cursor-default"}`}
                    onClick={() => {
                      if (isClickable && n.workoutDate) {
                        onWorkoutNotificationClick(n.id, n.workoutDate);
                        setOpen(false);
                      }
                    }}
                  >
                    <p className="font-medium">{n.title}</p>
                    {n.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{n.subtitle}</p>}
                  </button>
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center rounded-md opacity-60 hover:opacity-100 hover:bg-accent"
                    aria-label="Dismiss notification"
                    onClick={(e) => handleDismissNotification(e, n.id)}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
