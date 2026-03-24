"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import { loadAndMergeWorkouts } from "@/lib/workouts";
import type { Workout, SwimmerProfile, SwimmerGroup } from "@/lib/types";
import { normDate } from "@/lib/types";
import { parseISO } from "date-fns";
import { useTranslations } from "@/components/i18n-provider";
import { formatNotificationWorkoutDate, formatNotificationFeedbackDate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

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

interface NotificationItem {
  id: string;
  type: "workout_saved" | "feedback_added";
  date: string;
  title: string;
  subtitle?: string;
  workoutDate?: string;
  /** Calendar date (yyyy-MM-dd) to open in day view */
  navDate: string;
  /** Workout to expand when multiple cards use previews; null = day-level (e.g. feedback with no workout) */
  navWorkoutId: string | null;
}

export type NotificationNavigatePayload = { date: string; workoutId: string | null };

interface NotificationBellProps {
  role: "coach" | "swimmer";
  userId: string;
  swimmerGroup: SwimmerGroup | null;
  swimmers: SwimmerProfile[];
  /** Opens home day view and expands the workout when applicable (coach + swimmer). */
  onNotificationNavigate?: (info: NotificationNavigatePayload) => void;
}

function rubberBandOffset(raw: number, width: number): number {
  if (raw > 0) return raw * 0.35;
  if (raw < -width) {
    const over = raw + width;
    return -width + over * 0.35;
  }
  return raw;
}

interface SwipeableNotificationRowProps {
  notificationId: string;
  canNavigate: boolean;
  onNavigate: () => void;
  onDismiss: (id: string) => void;
  dismissLabel: string;
  title: string;
  subtitle?: string;
}

function SwipeableNotificationRow({
  notificationId,
  canNavigate,
  onNavigate,
  onDismiss,
  dismissLabel,
  title,
  subtitle,
}: SwipeableNotificationRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startClientXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const didDragRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [exiting, setExiting] = useState(false);

  const computeOffset = useCallback((clientX: number) => {
    const el = rowRef.current;
    const w = el?.offsetWidth ?? 280;
    const dx = clientX - startClientXRef.current;
    return rubberBandOffset(startOffsetRef.current + dx, w);
  }, []);

  const finishPointer = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return;
      const el = rowRef.current;
      if (el?.hasPointerCapture(e.pointerId)) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      pointerIdRef.current = null;
      setIsDragging(false);

      const w = el?.offsetWidth ?? 280;
      const final = dragOffsetRef.current;
      const threshold = Math.min(100, w * 0.38);
      if (final < -threshold) {
        setExiting(true);
        setOffset(-w);
      } else {
        setOffset(0);
      }
    },
    []
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (exiting) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = rowRef.current;
    if (!el) return;
    pointerIdRef.current = e.pointerId;
    startClientXRef.current = e.clientX;
    startOffsetRef.current = offset;
    dragOffsetRef.current = offset;
    didDragRef.current = false;
    setIsDragging(true);
    el.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId || exiting) return;
    const next = computeOffset(e.clientX);
    if (Math.abs(next - startOffsetRef.current) > 6) didDragRef.current = true;
    dragOffsetRef.current = next;
    setOffset(next);
  };

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
    if (!exiting) return;
    onDismiss(notificationId);
  };

  return (
    <div className="relative overflow-hidden">
      <div
        ref={rowRef}
        role="presentation"
        className={`relative flex w-full min-w-0 items-stretch touch-pan-y select-none ${
          isDragging ? "" : "transition-[transform] duration-200 ease-out"
        }`}
        style={{
          transform: `translateX(${offset}px)`,
          touchAction: "pan-y",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onTransitionEnd={handleTransitionEnd}
      >
        <button
          type="button"
          className={`min-w-0 flex-1 px-3 py-2.5 pr-2 text-left text-sm ${
            canNavigate ? "cursor-pointer hover:bg-accent" : "cursor-default"
          }`}
          onClick={() => {
            if (didDragRef.current) return;
            onNavigate();
          }}
        >
          <p className="font-medium">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </button>
        <button
          type="button"
          className="shrink-0 mr-1 my-2 size-7 flex items-center justify-center rounded-md opacity-60 hover:opacity-100 hover:bg-accent self-center"
          aria-label={dismissLabel}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss(notificationId);
          }}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function NotificationBell({ role, userId, swimmerGroup, swimmers, onNotificationNavigate }: NotificationBellProps) {
  const { t, locale } = useTranslations();
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
        const { data: allProfiles } = await supabase.from("profiles").select("id, full_name, role");
        const profileRows = (allProfiles ?? []) as { id: string; full_name: string | null; role?: string }[];
        const coachNameMap = new Map(profileRows.filter((p) => p.role === "coach").map((p) => [p.id, p.full_name]));
        const swimmerNameMap = new Map(profileRows.map((p) => [p.id, p.full_name]));
        const fallbackCoachName = profileRows.find((p) => p.role === "coach")?.full_name ?? null;
        setNotifications(
          forMe.map((w) => {
            const creatorId = w.created_by;
            const creatorRole = profileRows.find((p) => p.id === creatorId)?.role;
            const dateLine = formatNotificationWorkoutDate(parseISO(w.date + "T12:00:00"), w.session ?? null, locale as Locale, t);
            let title: string;
            if (creatorRole === "coach") {
              const coachName = getCoachFirstName(coachNameMap.get(creatorId ?? "") ?? null) ?? getCoachFirstName(fallbackCoachName);
              title = coachName ? t("notif.coachWroteWorkout", { name: coachName }) : t("notif.coachWroteWorkoutNoName");
            } else {
              const creatorName = getCoachFirstName(swimmerNameMap.get(creatorId ?? "") ?? null) ?? "Someone";
              const isForMe = w.assigned_to === userId || (w.assignee_ids ?? []).includes(userId);
              title = isForMe ? t("notif.swimmerWroteYourWorkout", { name: creatorName }) : t("notif.swimmerWroteOwnWorkout", { name: creatorName });
            }
            const d = normDate(w.date) ?? w.date;
            return {
              id: w.id,
              type: "workout_saved" as const,
              date: w.updated_at ?? w.date,
              title,
              subtitle: dateLine,
              workoutDate: w.date,
              navDate: d,
              navWorkoutId: w.id || null,
            };
          })
        );
      } else {
        const [feedbackRes, swimmerWorkoutsRes] = await Promise.all([
          supabase.from("feedback").select("id, date, workout_id, user_id, created_at, anonymous")
            .gte("created_at", since).order("created_at", { ascending: false }).limit(50),
          supabase.from("workouts").select("id, date, session, updated_at, created_by")
            .gte("updated_at", since).not("created_by", "is", null)
            .order("updated_at", { ascending: false }).limit(50),
        ]);
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, role");
        const nameMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null; role?: string }) => [p.id, p.full_name ?? "Someone"]));
        const swimmerCreatorIds = new Set((profiles ?? []).filter((p: { role?: string }) => p.role === "swimmer").map((p: { id: string }) => p.id));
        const withUser = (feedbackRes.data ?? []) as { id: string; date: string; workout_id?: string; user_id?: string; created_at: string; anonymous?: boolean }[];
        const workoutIds = withUser.map((f) => f.workout_id).filter(Boolean) as string[];
        let sessionByWorkout = new Map<string, string | null>();
        if (workoutIds.length > 0) {
          const { data: workouts } = await supabase.from("workouts").select("id, session").in("id", workoutIds);
          sessionByWorkout = new Map((workouts ?? []).map((w: { id: string; session: string | null }) => [w.id, w.session]));
        }
        const feedbackNotifs = withUser.map((f) => {
          const swimmerName = f.anonymous ? "Someone" : (nameMap.get(f.user_id ?? "") ?? "Someone");
          const session = f.workout_id ? sessionByWorkout.get(f.workout_id) ?? null : null;
          const dateLine = formatNotificationFeedbackDate(parseISO(f.date + "T12:00:00"), session, locale as Locale, t);
          const navD = normDate(f.date) ?? f.date;
          return {
            id: f.id,
            type: "feedback_added" as const,
            date: f.created_at,
            title: swimmerName === "Someone" ? t("notif.someoneAddedFeedback") : t("notif.personAddedFeedback", { name: swimmerName }),
            subtitle: dateLine,
            navDate: navD,
            navWorkoutId: f.workout_id ?? null,
          };
        });
        const swimmerWorkouts = (swimmerWorkoutsRes.data ?? []) as { id: string; date: string; session: string | null; updated_at: string; created_by: string }[];
        const swimmerWorkoutNotifs = swimmerWorkouts
          .filter((w) => swimmerCreatorIds.has(w.created_by))
          .map((w) => {
            const creatorName = getCoachFirstName(nameMap.get(w.created_by) ?? null) ?? "Someone";
            const dateLine = formatNotificationWorkoutDate(parseISO(w.date + "T12:00:00"), w.session ?? null, locale as Locale, t);
            const d = normDate(w.date) ?? w.date;
            return {
              id: w.id,
              type: "workout_saved" as const,
              date: w.updated_at,
              title: t("notif.swimmerWroteWorkout", { name: creatorName }),
              subtitle: dateLine,
              workoutDate: w.date,
              navDate: d,
              navWorkoutId: w.id,
            };
          });
        setNotifications([...swimmerWorkoutNotifs, ...feedbackNotifs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    } finally {
      setLoading(false);
    }
  }, [role, userId, swimmerGroup, swimmers, t, locale]);

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

  const dismissNotification = useCallback((id: string) => {
    addDismissedId(id);
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 relative" aria-label={t("notif.notifications")}>
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
          <h3 className="font-semibold text-sm">{t("notif.notifications")}</h3>
        </div>
        <div className="divide-y">
          {loading && notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : undismissed.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {role === "swimmer" ? t("notif.noNewWorkouts") : t("notif.noNewFeedback")}
            </div>
          ) : (
            undismissed.map((n) => {
              const canNavigate = !!onNotificationNavigate && !!n.navDate;
              return (
                <SwipeableNotificationRow
                  key={n.id}
                  notificationId={n.id}
                  canNavigate={canNavigate}
                  dismissLabel={t("notif.dismiss")}
                  title={n.title}
                  subtitle={n.subtitle}
                  onDismiss={dismissNotification}
                  onNavigate={() => {
                    if (canNavigate && onNotificationNavigate) {
                      onNotificationNavigate({ date: n.navDate, workoutId: n.navWorkoutId });
                      setOpen(false);
                    }
                  }}
                />
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
