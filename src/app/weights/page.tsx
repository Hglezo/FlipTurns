"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, isSameDay,
} from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CalendarIcon,
  Settings,
  LogOut,
  Plus,
  Pencil,
  Loader2,
  RotateCcw,
  AlertCircle,
  Printer,
  Eye,
  EyeOff,
  Camera,
  ImageUp,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkoutAnalysis } from "@/components/workout-analysis";
import { WorkoutContentTextarea } from "@/components/workout-content-textarea";
import { WorkoutDraftTape } from "@/components/workout-draft-tape";
import { WorkoutTextWithWrapIndent } from "@/components/workout-text-with-wrap-indent";
import { WorkoutAssignPicker } from "@/components/workout-assign-picker";
import { SignOutDropdown } from "@/components/sign-out-dropdown";
import { NotificationBell } from "@/components/notification-bell";
import { usePreferences } from "@/components/preferences-provider";
import { useTranslations } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth-provider";
import type { StrengthWorkout, SwimmerGroup, SwimmerProfile, ViewMode } from "@/lib/types";
import {
  ALL_ID,
  ALL_GROUPS_ID,
  ONLY_GROUPS_ID,
  PERSONAL_ASSIGNMENT,
  SESSION_OPTIONS,
  SWIMMER_GROUPS,
  workoutIsPublished,
  normDate,
  getTimeframe,
} from "@/lib/types";
import { getCategoryLabel, GROUP_KEYS, type TranslationKey } from "@/lib/i18n";
import {
  assignmentLabel,
  assignedToNamesForCaption,
  assignedToCaptionRedundantForWorkout,
  dayPreviewLabel,
  filterWorkoutsForCoachSwimmerSelection,
  filterWorkoutsForSwimmer,
  sortCoachWorkouts,
  resolvedGroupAssigneeIdsForSave,
} from "@/lib/workouts";
import { buildStrengthWorkoutPrintSections, downloadWorkoutsPdf } from "@/lib/workout-print";
import { cn } from "@/lib/utils";
import { fetchCoachTeamSwimmers, readCoachTeamSwimmersCache } from "@/lib/coach-team-swimmers-cache";
import {
  STRENGTH_WORKOUT_SELECT,
  loadAndMergeStrengthWorkouts,
  setStrengthWorkoutPublished,
  persistStrengthGroupAssigneesAcrossRows,
  saveStrengthAssigneesForIndividualWorkout,
  strengthRpcMissingInSchemaCache,
} from "@/lib/strength-workouts";
import { assigneeBadgeTwClasses } from "@/lib/workouts";
import { blobToWorkoutUploadDataUrl, isJpegOrPngBlob, sniffLikelyHeic } from "@/lib/workout-from-image-upload";
import type { Workout } from "@/lib/types";

const WORKOUT_CARD_TOGGLE_IGNORE = "button, a, input, textarea, select, label";

function StrengthWorkoutReadOnlyBody({
  workout,
  assigneeBadgeLabel,
  t,
  offsetWorkoutBodyForCornerAssignee,
  workoutBodyCornerOffsetClassName,
  draftTapeLabel,
  badgeRowClearanceClassName,
}: {
  workout: StrengthWorkout;
  assigneeBadgeLabel: string | null | undefined;
  t: (key: TranslationKey) => string;
  offsetWorkoutBodyForCornerAssignee: boolean;
  workoutBodyCornerOffsetClassName?: string;
  draftTapeLabel?: string | undefined;
  badgeRowClearanceClassName?: string;
}) {
  const s = workout.session?.trim();
  const isAm = s === "AM";
  const isPm = s === "PM";
  const sessionPillLabel = isAm ? t("session.am") : isPm ? t("session.pm") : t("main.anytime");
  return (
    <div className="w-full min-w-0 space-y-4">
      <div
        className={cn(
          "mb-2 flex w-full min-w-0 flex-nowrap items-center gap-1.5 max-md:gap-1",
          badgeRowClearanceClassName,
        )}
      >
        {assigneeBadgeLabel ? <span className={assigneeBadgeTwClasses(workout)}>{assigneeBadgeLabel}</span> : null}
        <span
          className={cn(
            "inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase max-md:shrink-0 max-md:px-1.5 max-md:text-[10px]",
            isAm ? "bg-amber-400/15 text-amber-600 dark:text-amber-400"
              : isPm ? "bg-indigo-400/15 text-indigo-600 dark:text-indigo-400"
                : "bg-muted text-muted-foreground",
          )}
        >
          {sessionPillLabel}
        </span>
      </div>
      <div
        className={cn(
          "relative w-full min-w-0 font-sans leading-relaxed text-foreground/90 text-[15px]",
          offsetWorkoutBodyForCornerAssignee && (workoutBodyCornerOffsetClassName ?? "mt-12"),
        )}
      >
        {draftTapeLabel ? <WorkoutDraftTape label={draftTapeLabel} /> : null}
        <WorkoutTextWithWrapIndent content={workout.content} />
      </div>
    </div>
  );
}

function alertFromCaught(e: unknown, fallback: string) {
  alert(e instanceof Error ? e.message : fallback);
}

function emptyCoachStrengthRow(dateKey: string, assignToSwimmerId: string | null = null): StrengthWorkout {
  return {
    id: "",
    date: dateKey,
    content: "",
    session: "PM",
    assigned_to: assignToSwimmerId,
    assigned_to_group: null,
    is_published: true,
  };
}

function sortCoachStrengthDayFiltered(
  merged: StrengthWorkout[],
  filterId: string | null | undefined,
  swimmers: SwimmerProfile[],
): StrengthWorkout[] {
  return sortCoachWorkouts(
    filterWorkoutsForCoachSwimmerSelection(merged as unknown as Workout[], filterId, swimmers),
    swimmers,
  ) as unknown as StrengthWorkout[];
}

function filterStrengthForSwimmerView(
  rows: StrengthWorkout[],
  selectedViewSwimmerId: string | null,
  userId: string,
  swimmerGroup: SwimmerGroup | null,
  swimmers: SwimmerProfile[],
): StrengthWorkout[] {
  const isAll = selectedViewSwimmerId === ALL_ID;
  const isOnlyGroups = selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID;
  const filterId = isAll || isOnlyGroups ? selectedViewSwimmerId! : (selectedViewSwimmerId ?? userId);
  const filterGroup =
    filterId === userId
      ? swimmerGroup
      : filterId !== ALL_ID && filterId !== ONLY_GROUPS_ID && filterId !== ALL_GROUPS_ID
        ? swimmers.find((s) => s.id === filterId)?.swimmer_group ?? null
        : null;
  const me = filterId ?? userId;
  return filterWorkoutsForSwimmer(rows as unknown as Workout[], me, filterGroup ?? null) as unknown as StrengthWorkout[];
}

function coachPreferredAssigneeFromFilter(selectedCoachSwimmerId: string | null): string | null {
  if (!selectedCoachSwimmerId || selectedCoachSwimmerId === ALL_ID || selectedCoachSwimmerId === ONLY_GROUPS_ID) {
    return null;
  }
  return selectedCoachSwimmerId;
}

function emptySwimmerStrengthRow(dateKey: string, userId: string | undefined): StrengthWorkout {
  return {
    id: "",
    date: dateKey,
    content: "",
    session: "PM",
    assigned_to: userId ?? null,
    assigned_to_group: null,
    is_published: true,
  };
}

function strengthWeekDayCollapsedPreviewLabel(
  w: StrengthWorkout,
  swimmers: SwimmerProfile[],
  previewDefault: string | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  const raw = dayPreviewLabel(w as unknown as Workout, swimmers, previewDefault ?? undefined);
  const parts = raw.split(" - ");
  const assignee = parts.length > 1 ? parts[0] : null;
  const category = parts.length > 1 ? parts[1] : parts[0];
  const translatedAssignee = assignee && GROUP_KEYS[assignee as keyof typeof GROUP_KEYS] ? t(GROUP_KEYS[assignee as keyof typeof GROUP_KEYS]) : assignee;
  const translatedCategory = getCategoryLabel(category === "Workout" ? "" : category, t) || t("category.workout");
  const sessionTrim = w.session?.trim();
  const sessionSuffix =
    sessionTrim === "AM" ? t("session.am") : sessionTrim === "PM" ? t("session.pm") : t("main.anytime");
  if (assignee) return `${translatedAssignee}: ${sessionSuffix} - ${translatedCategory}`;
  return `${sessionSuffix} - ${translatedCategory}`;
}

function StrengthExpandableDay({
  day, dayWorkouts, isExpanded, onToggle, previewLabel, renderWorkouts, actions, t, formatDate,
}: {
  day: Date; dayWorkouts: StrengthWorkout[]; isExpanded: boolean; onToggle: () => void;
  previewLabel: (w: StrengthWorkout) => string; renderWorkouts: () => ReactNode; actions?: ReactNode;
  t: (key: TranslationKey) => string;
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
        <div className="animate-in slide-in-from-top-2 border-t px-2 py-2 duration-200 space-y-3">
          {renderWorkouts()}
          {actions}
        </div>
      )}
    </Card>
  );
}

function StrengthMonthCalendar({
  selectedDate, weekStartsOn, monthWorkouts, onSelect, onMonthChange,
}: {
  selectedDate: Date; weekStartsOn: 0 | 1; monthWorkouts: StrengthWorkout[];
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

export default function WeightsPage() {
  const router = useRouter();
  const { t, locale, formatDate } = useTranslations();
  const preferencesCtx = usePreferences();
  const weekStartsOn = preferencesCtx?.weekStartsOn ?? 1;
  const weekStartsOnPref: 0 | 1 = weekStartsOn === 0 ? 0 : 1;
  const { user, profile, role, loading: authLoading } = useAuth();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const dateKey = format(selectedDate, "yyyy-MM-dd");

  const [swimmers, setSwimmers] = useState<{ id: string; full_name: string | null; swimmer_group: SwimmerGroup | null }[]>([]);
  const [coachWorkouts, setCoachWorkouts] = useState<StrengthWorkout[]>([]);
  const [swimmerWorkouts, setSwimmerWorkouts] = useState<StrengthWorkout[]>([]);
  const [coachLoading, setCoachLoading] = useState(false);
  const [swimmerLoading, setSwimmerLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [weekStrengthWorkouts, setWeekStrengthWorkouts] = useState<StrengthWorkout[]>([]);
  const [monthStrengthWorkouts, setMonthStrengthWorkouts] = useState<StrengthWorkout[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [expandedMonthDayKey, setExpandedMonthDayKey] = useState<string | null>(null);

  const [editingWorkoutIndex, setEditingWorkoutIndex] = useState<number | null>(null);
  const [swimmerEditingIndex, setSwimmerEditingIndex] = useState<number | null>(null);
  const [expandedWorkoutKey, setExpandedWorkoutKey] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [imageFromWorkoutLoading, setImageFromWorkoutLoading] = useState(false);
  const [imageFromWorkoutError, setImageFromWorkoutError] = useState<string | null>(null);
  const imageFromWorkoutIdxRef = useRef<number | null>(null);
  const imageCameraInputRef = useRef<HTMLInputElement>(null);
  const imageGalleryInputRef = useRef<HTMLInputElement>(null);
  const [selectedCoachSwimmerId, setSelectedCoachSwimmerId] = useState<string | null>(null);
  const [selectedViewSwimmerId, setSelectedViewSwimmerId] = useState<string | null>(null);
  const [weightsMenuShellBoundary, setWeightsMenuShellBoundary] = useState<HTMLElement | null>(null);
  const [weightsMenuShellWidthPx, setWeightsMenuShellWidthPx] = useState<number | null>(null);
  const [weightsPersonalWorkoutsOpen, setWeightsPersonalWorkoutsOpen] = useState(false);
  const weightsPersonalWorkoutsGroupRef = useRef<HTMLDivElement | null>(null);

  const rangeDataKeyRef = useRef("");
  const addStrengthWorkoutForDateRef = useRef<string | null>(null);

  const isCoach = role === "coach";
  const isSwimmerOwnStrengthDay =
    role === "swimmer" && (selectedViewSwimmerId === null || selectedViewSwimmerId === user?.id);
  const swimmerGroup = profile?.swimmer_group ?? null;
  const swimmersAsProfile = swimmers as SwimmerProfile[];

  const handleWeightsPersonalWorkoutsGroupMouseLeave = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && weightsPersonalWorkoutsGroupRef.current?.contains(next)) return;
    setWeightsPersonalWorkoutsOpen(false);
  }, []);

  const invalidateStrengthRange = () => {
    rangeDataKeyRef.current = "";
  };

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useLayoutEffect(() => {
    if (!weightsMenuShellBoundary) {
      setWeightsMenuShellWidthPx(null);
      return;
    }
    const el = weightsMenuShellBoundary;
    const update = () => {
      const shellW = el.clientWidth;
      setWeightsMenuShellWidthPx(Math.max(0, Math.min(shellW, window.innerWidth - 16)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [weightsMenuShellBoundary]);

  useEffect(() => {
    if (role === "swimmer" && selectedViewSwimmerId === ALL_ID) setSelectedViewSwimmerId(null);
  }, [role, selectedViewSwimmerId]);

  useLayoutEffect(() => {
    setExpandedWorkoutKey(null);
    setExpandedDayKey(null);
    setExpandedWeekKey(null);
    setExpandedMonthDayKey(null);
  }, [selectedCoachSwimmerId, selectedViewSwimmerId]);

  useEffect(() => {
    if (!role || !user?.id) return;
    const uid = user.id;
    const cached = readCoachTeamSwimmersCache(uid);
    if (cached) setSwimmers(cached as { id: string; full_name: string | null; swimmer_group: SwimmerGroup | null }[]);
    let cancelled = false;
    void fetchCoachTeamSwimmers(uid)
      .then((rows) => {
        if (!cancelled) setSwimmers(rows);
      })
      .catch(() => {
        if (!cancelled && !cached) setSwimmers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [role, user?.id]);

  const fetchCoachStrengthMerged = useCallback(async (dk: string) => {
    const { data, error } = await supabase
      .from("strength_workouts")
      .select(STRENGTH_WORKOUT_SELECT)
      .eq("date", dk)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as StrengthWorkout[];
    const merged = await loadAndMergeStrengthWorkouts(
      rows.map((r) => ({ ...r, date: normDate(r.date) ?? dk })),
      swimmers,
    );
    return sortCoachWorkouts(merged as unknown as Workout[], swimmers) as unknown as StrengthWorkout[];
  }, [swimmers]);

  const fetchSwimmerStrengthMerged = useCallback(async (dk: string) => {
    if (!user?.id) return [];
    const userId = user.id;
    const isOnlyGroups = selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID;
    let query = supabase
      .from("strength_workouts")
      .select(STRENGTH_WORKOUT_SELECT)
      .eq("date", dk)
      .order("created_at", { ascending: true });
    if (isOnlyGroups) query = query.in("assigned_to_group", SWIMMER_GROUPS);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as StrengthWorkout[];
    const merged = await loadAndMergeStrengthWorkouts(
      rows.map((r) => ({ ...r, date: normDate(r.date) ?? dk })),
      swimmers,
    );
    return filterStrengthForSwimmerView(merged, selectedViewSwimmerId, userId, swimmerGroup, swimmersAsProfile);
  }, [swimmers, swimmersAsProfile, user?.id, swimmerGroup, selectedViewSwimmerId]);

  const refreshCoach = useCallback(async () => {
    if (!dateKey || role !== "coach") return;
    setCoachLoading(true);
    setFetchError(null);
    try {
      const merged = await fetchCoachStrengthMerged(dateKey);
      setCoachWorkouts(sortCoachStrengthDayFiltered(merged, selectedCoachSwimmerId, swimmersAsProfile));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not reload";
      setFetchError(msg);
      console.error(e);
    } finally {
      setCoachLoading(false);
    }
  }, [dateKey, role, fetchCoachStrengthMerged, selectedCoachSwimmerId, swimmersAsProfile]);

  const refreshSwimmer = useCallback(async () => {
    if (!dateKey || role !== "swimmer" || !user?.id) return;
    setSwimmerLoading(true);
    setFetchError(null);
    try {
      const merged = await fetchSwimmerStrengthMerged(dateKey);
      setSwimmerWorkouts(merged);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not reload";
      setFetchError(msg);
      console.error(e);
    } finally {
      setSwimmerLoading(false);
    }
  }, [dateKey, role, user?.id, fetchSwimmerStrengthMerged]);

  useEffect(() => {
    if (viewMode === "day") rangeDataKeyRef.current = "";
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "day") setExpandedWorkoutKey(null);
  }, [viewMode]);

  useEffect(() => {
    if (!dateKey || role !== "coach" || viewMode !== "day" || !user) return;
    const isAdding = addStrengthWorkoutForDateRef.current === dateKey;
    if (!isAdding) setEditingWorkoutIndex(null);
    let cancelled = false;
    (async () => {
      setCoachLoading(true);
      try {
        const merged = await fetchCoachStrengthMerged(dateKey);
        if (cancelled) return;
        setFetchError(null);
        const filtered = sortCoachStrengthDayFiltered(merged, selectedCoachSwimmerId, swimmersAsProfile);
        const assignPref = coachPreferredAssigneeFromFilter(selectedCoachSwimmerId);
        if (isAdding) {
          addStrengthWorkoutForDateRef.current = null;
          setCoachWorkouts([...filtered, emptyCoachStrengthRow(dateKey, assignPref)]);
          setEditingWorkoutIndex(filtered.length);
        } else {
          setCoachWorkouts(filtered);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Could not load workouts";
          setFetchError(msg);
          console.error(e);
        }
      } finally {
        if (!cancelled) setCoachLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateKey, role, viewMode, user, fetchCoachStrengthMerged, selectedCoachSwimmerId, swimmersAsProfile]);

  useEffect(() => {
    if (!dateKey || role !== "swimmer" || !user?.id || viewMode !== "day") return;
    const isAdding = addStrengthWorkoutForDateRef.current === dateKey;
    if (!isAdding) setSwimmerEditingIndex(null);
    let cancelled = false;
    (async () => {
      setSwimmerLoading(true);
      try {
        const merged = await fetchSwimmerStrengthMerged(dateKey);
        if (cancelled) return;
        setFetchError(null);
        if (isAdding) {
          addStrengthWorkoutForDateRef.current = null;
          setSwimmerWorkouts([...merged, emptySwimmerStrengthRow(dateKey, user.id)]);
          setSwimmerEditingIndex(merged.length);
        } else {
          setSwimmerWorkouts(merged);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Could not load workouts";
          setFetchError(msg);
          console.error(e);
        }
      } finally {
        if (!cancelled) setSwimmerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateKey, role, viewMode, user?.id, fetchSwimmerStrengthMerged, selectedViewSwimmerId, swimmerGroup, swimmersAsProfile]);

  useEffect(() => {
    if ((viewMode !== "week" && viewMode !== "month") || !user?.id) {
      setRangeLoading(false);
      return;
    }
    const rangeStart = viewMode === "week" ? startOfWeek(selectedDate, { weekStartsOn: weekStartsOnPref }) : startOfMonth(selectedDate);
    const rangeEnd = viewMode === "week" ? endOfWeek(selectedDate, { weekStartsOn: weekStartsOnPref }) : endOfMonth(selectedDate);
    const fetchKey = [
      viewMode,
      format(rangeStart, "yyyy-MM-dd"),
      format(rangeEnd, "yyyy-MM-dd"),
      user.id,
      role,
      swimmerGroup ?? "",
      swimmers.length,
      weekStartsOnPref,
    ].join("|");
    if (fetchKey === rangeDataKeyRef.current) {
      setRangeLoading(false);
      return;
    }
    const modeAtStart = viewMode;
    let cancelled = false;
    (async () => {
      setRangeLoading(true);
      try {
        let query = supabase
          .from("strength_workouts")
          .select(STRENGTH_WORKOUT_SELECT)
          .gte("date", format(rangeStart, "yyyy-MM-dd"))
          .lte("date", format(rangeEnd, "yyyy-MM-dd"));
        if (modeAtStart === "week") query = query.order("date", { ascending: true });
        const { data, error } = await query;
        if (cancelled) return;
        if (error) {
          setFetchError(error.message);
          console.error(error);
          return;
        }
        setFetchError(null);
        let rows = (data ?? []) as StrengthWorkout[];
        const fallbackDk = format(rangeStart, "yyyy-MM-dd");
        rows = await loadAndMergeStrengthWorkouts(
          rows.map((r) => ({ ...r, date: normDate(r.date) ?? fallbackDk })),
          swimmers,
        );
        if (cancelled) return;
        if (modeAtStart === "week") setWeekStrengthWorkouts(rows);
        else setMonthStrengthWorkouts(rows);
        rangeDataKeyRef.current = fetchKey;
      } finally {
        if (!cancelled) setRangeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, viewMode, weekStartsOnPref, user?.id, role, swimmerGroup, swimmers]);

  const scopedWeekStrengthWorkouts = useMemo(() => {
    if (!user?.id) return weekStrengthWorkouts;
    if (isCoach) {
      return filterWorkoutsForCoachSwimmerSelection(
        weekStrengthWorkouts as unknown as Workout[],
        selectedCoachSwimmerId,
        swimmersAsProfile,
      ) as unknown as StrengthWorkout[];
    }
    return filterStrengthForSwimmerView(
      weekStrengthWorkouts,
      selectedViewSwimmerId,
      user.id,
      swimmerGroup,
      swimmersAsProfile,
    );
  }, [
    user?.id,
    isCoach,
    weekStrengthWorkouts,
    selectedCoachSwimmerId,
    swimmersAsProfile,
    selectedViewSwimmerId,
    swimmerGroup,
  ]);

  const scopedMonthStrengthWorkouts = useMemo(() => {
    if (!user?.id) return monthStrengthWorkouts;
    if (isCoach) {
      return filterWorkoutsForCoachSwimmerSelection(
        monthStrengthWorkouts as unknown as Workout[],
        selectedCoachSwimmerId,
        swimmersAsProfile,
      ) as unknown as StrengthWorkout[];
    }
    return filterStrengthForSwimmerView(
      monthStrengthWorkouts,
      selectedViewSwimmerId,
      user.id,
      swimmerGroup,
      swimmersAsProfile,
    );
  }, [
    user?.id,
    isCoach,
    monthStrengthWorkouts,
    selectedCoachSwimmerId,
    swimmersAsProfile,
    selectedViewSwimmerId,
    swimmerGroup,
  ]);

  const coachUsesPreviews = isCoach && coachWorkouts.length > 1;
  const swimmerUsesPreviews = !isCoach && swimmerWorkouts.length > 1;

  const swimmerIdsInTimeframeExcluding = (rows: StrengthWorkout[], workoutIdx: number): Set<string> => {
    const w = rows[workoutIdx];
    if (!w) return new Set();
    const tf = getTimeframe(w);
    const out = new Set<string>();
    rows.forEach((ow, i) => {
      if (i === workoutIdx || getTimeframe(ow) !== tf) return;
      if (ow.assigned_to && !ow.assigned_to_group) out.add(ow.assigned_to);
      else if (ow.assigned_to_group) {
        const ids =
          ow.assigned_to_group === PERSONAL_ASSIGNMENT
            ? (ow.assignee_ids ?? [])
            : ow.assignee_ids?.length
              ? ow.assignee_ids
              : swimmers.filter((s) => s.swimmer_group === ow.assigned_to_group).map((s) => s.id);
        ids.forEach((id) => out.add(id));
      }
    });
    return out;
  };

  const updateCoachWorkout = (index: number, updates: Partial<StrengthWorkout>) => {
    setCoachWorkouts((prev) => {
      let next = prev.map((w, i) => (i === index ? { ...w, ...updates } : w));
      if (updates.assignee_ids && prev[index]?.assigned_to_group) {
        const addedIds = updates.assignee_ids;
        const currentTf = getTimeframe(prev[index]!);
        next = next.map((w, i) => {
          if (i === index || !w.assigned_to_group || !w.assignee_ids?.length || getTimeframe(w) !== currentTf) return i === index ? next[index]! : w;
          return { ...w, assignee_ids: w.assignee_ids.filter((id) => !addedIds.includes(id)) };
        });
      }
      return next;
    });
  };

  const updateSwimmerWorkout = (index: number, updates: Partial<StrengthWorkout>) => {
    setSwimmerWorkouts((prev) => prev.map((w, i) => (i === index ? { ...w, ...updates } : w)));
  };

  function pickStrengthImageSource(source: "camera" | "gallery", idx: number) {
    imageFromWorkoutIdxRef.current = idx;
    (source === "camera" ? imageCameraInputRef : imageGalleryInputRef).current?.click();
  }

  async function handleStrengthImageFromWorkout(e: ChangeEvent<HTMLInputElement>) {
    const idx = imageFromWorkoutIdxRef.current;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (idx === null || !file) return;
    const mime = file.type.trim().toLowerCase();
    const heicByMime = /^image\/(heic|heif)$/.test(mime);
    const heicByName = /\.(heic|heif)$/i.test(file.name);
    if (!heicByMime && !heicByName && mime && !mime.startsWith("image/") && mime !== "application/octet-stream") return;
    setImageFromWorkoutError(null);
    setImageFromWorkoutLoading(true);
    try {
      let blob: Blob = file;
      const jpegOrPng = await isJpegOrPngBlob(file);
      const needsHeic =
        !jpegOrPng && (heicByMime || heicByName || (await sniffLikelyHeic(file)));
      if (needsHeic) {
        const heic2any = (await import("heic2any")).default;
        const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
        blob = Array.isArray(converted) ? converted[0]! : converted;
      }
      const base64 = await blobToWorkoutUploadDataUrl(blob);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/workout/from-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Auth-Token": token,
        },
        body: JSON.stringify({ image: base64, workoutKind: "strength" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to analyze image");
      setImageFromWorkoutError(null);
      if (swimmerEditingIndex === idx) updateSwimmerWorkout(idx, { content: data.content ?? "" });
      else if (editingWorkoutIndex === idx) updateCoachWorkout(idx, { content: data.content ?? "" });
    } catch (err) {
      setImageFromWorkoutError(err instanceof Error ? err.message : "Failed to process image");
    } finally {
      setImageFromWorkoutLoading(false);
      imageFromWorkoutIdxRef.current = null;
    }
  }

  async function saveCoachWorkout(index: number) {
    if (!dateKey || !isCoach || index < 0 || index >= coachWorkouts.length) return;
    const workout = coachWorkouts[index];
    setEditingWorkoutIndex(null);
    setLoading(true);
    setSaved(false);
    let savedId: string | undefined = workout.id;
    const rpc = {
      p_content: workout.content,
      p_session: workout.session || "PM",
      p_assigned_to: workout.assigned_to ?? null,
      p_assigned_to_group: workout.assigned_to_group ?? null,
    };
    if (workout.id) {
      const { error: rpcErr } = await supabase.rpc("update_strength_workout", { p_id: workout.id, ...rpc });
      if (rpcErr) {
        if (!strengthRpcMissingInSchemaCache(rpcErr)) {
          alert(rpcErr.message);
          setLoading(false);
          return;
        }
        const { error: updErr } = await supabase
          .from("strength_workouts")
          .update({
            content: workout.content ?? "",
            session: workout.session || "PM",
            assigned_to: workout.assigned_to ?? null,
            assigned_to_group: workout.assigned_to_group ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", workout.id);
        if (updErr) {
          alert(updErr.message);
          setLoading(false);
          return;
        }
      }
    } else {
      const { data: newId, error: rpcErr } = await supabase.rpc("insert_strength_workout", {
        p_date: dateKey,
        ...rpc,
        p_is_published: workoutIsPublished(workout),
      });
      if (rpcErr) {
        if (!strengthRpcMissingInSchemaCache(rpcErr)) {
          alert(rpcErr.message);
          setLoading(false);
          return;
        }
        const { data: inserted, error: insErr } = await supabase
          .from("strength_workouts")
          .insert({
            date: dateKey,
            content: workout.content ?? "",
            session: workout.session || "PM",
            assigned_to: workout.assigned_to ?? null,
            assigned_to_group: workout.assigned_to_group ?? null,
            is_published: workoutIsPublished(workout),
            created_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insErr || !inserted?.id) {
          alert(insErr?.message ?? "Save failed.");
          setLoading(false);
          return;
        }
        savedId = inserted.id as string;
      } else {
        const id = typeof newId === "string" && newId.length > 0 ? newId : null;
        if (!id) {
          alert("Save failed: no id returned.");
          setLoading(false);
          return;
        }
        savedId = id;
      }
    }

    if (workout.assigned_to_group && savedId) {
      const ok = await persistStrengthGroupAssigneesAcrossRows(coachWorkouts, workout, savedId, swimmers, workout.id || "", workout.id || "");
      if (!ok) {
        alert("Failed to save assignees");
        setLoading(false);
        return;
      }
    }

    invalidateStrengthRange();
    await refreshCoach();
    setExpandedWorkoutKey(null);
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveSwimmerWorkout(index: number) {
    if (!dateKey || !user || role !== "swimmer" || index < 0 || index >= swimmerWorkouts.length) return;
    const workout = swimmerWorkouts[index];
    setSwimmerEditingIndex(null);
    setLoading(true);
    setSaved(false);
    const isPersonal = workout.assigned_to_group === PERSONAL_ASSIGNMENT;
    const assigneeIds = isPersonal
      ? resolvedGroupAssigneeIdsForSave(workout as unknown as Workout, swimmers)
      : workout.assignee_ids?.length
        ? workout.assignee_ids
        : workout.assigned_to
          ? [workout.assigned_to]
          : [];
    const singleAssignee = !isPersonal && assigneeIds.length === 1 ? assigneeIds[0]! : null;

    const syncPersonal = (sid: string) =>
      persistStrengthGroupAssigneesAcrossRows(swimmerWorkouts, workout, sid, swimmers, sid, sid);

    if (workout.id) {
      const { error: rpcErr } = await supabase.rpc("update_strength_workout_swimmer", {
        p_id: workout.id,
        p_content: workout.content,
        p_session: workout.session || "PM",
        p_assigned_to: singleAssignee,
        p_assigned_to_group: isPersonal ? PERSONAL_ASSIGNMENT : null,
      });
      if (rpcErr) {
        if (!strengthRpcMissingInSchemaCache(rpcErr)) {
          alert(rpcErr.message);
          setLoading(false);
          return;
        }
        const { error: updErr } = await supabase
          .from("strength_workouts")
          .update({
            content: workout.content ?? "",
            session: workout.session || "PM",
            assigned_to: isPersonal ? null : singleAssignee,
            assigned_to_group: isPersonal ? PERSONAL_ASSIGNMENT : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", workout.id)
          .eq("created_by", user.id);
        if (updErr) {
          alert(updErr.message);
          setLoading(false);
          return;
        }
      }
      if (isPersonal) {
        if (!(await syncPersonal(workout.id))) {
          setLoading(false);
          return;
        }
      } else if (assigneeIds.length > 0) {
        try {
          await saveStrengthAssigneesForIndividualWorkout(workout.id, assigneeIds);
        } catch (e) {
          alertFromCaught(e, "Failed to save assignees");
          setLoading(false);
          return;
        }
      }
    } else {
      const { data: newId, error: rpcErr } = await supabase.rpc("insert_strength_workout_swimmer", {
        p_date: dateKey,
        p_content: workout.content,
        p_session: workout.session || "PM",
        p_assigned_to: singleAssignee,
        p_assigned_to_group: isPersonal ? PERSONAL_ASSIGNMENT : null,
        p_is_published: workoutIsPublished(workout),
      });
      let id: string | null = typeof newId === "string" && newId.length > 0 ? newId : null;
      if (rpcErr) {
        if (!strengthRpcMissingInSchemaCache(rpcErr)) {
          alert(rpcErr.message);
          setLoading(false);
          return;
        }
        const { data: inserted, error: insErr } = await supabase
          .from("strength_workouts")
          .insert({
            date: dateKey,
            content: workout.content ?? "",
            session: workout.session || "PM",
            assigned_to: isPersonal ? null : singleAssignee,
            assigned_to_group: isPersonal ? PERSONAL_ASSIGNMENT : null,
            is_published: workoutIsPublished(workout),
            created_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insErr || !inserted?.id) {
          alert(insErr?.message ?? "Save failed.");
          setLoading(false);
          return;
        }
        id = inserted.id as string;
      }
      if (!id) {
        alert("Save failed: no id returned.");
        setLoading(false);
        return;
      }
      if (isPersonal) {
        if (!(await syncPersonal(id))) {
          setLoading(false);
          return;
        }
      } else if (assigneeIds.length > 1) {
        try {
          await saveStrengthAssigneesForIndividualWorkout(id, assigneeIds);
        } catch (e) {
          alertFromCaught(e, "Failed to save assignees");
          setLoading(false);
          return;
        }
      }
    }

    invalidateStrengthRange();
    await refreshSwimmer();
    setExpandedWorkoutKey(null);
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function deleteCoachWorkout(index: number) {
    if (index < 0 || index >= coachWorkouts.length || !confirm(t("main.deleteWorkoutConfirm"))) return;
    const workout = coachWorkouts[index];
    setLoading(true);
    if (workout.id) {
      const { error: rpcErr } = await supabase.rpc("delete_strength_workout_coach", { p_id: workout.id });
      if (rpcErr) {
        if (!strengthRpcMissingInSchemaCache(rpcErr)) {
          alert(rpcErr.message);
          setLoading(false);
          return;
        }
        const { error: delErr } = await supabase.from("strength_workouts").delete().eq("id", workout.id);
        if (delErr) {
          alert(delErr.message);
          setLoading(false);
          return;
        }
      }
    }
    setCoachWorkouts((prev) => prev.filter((_, i) => i !== index));
    setEditingWorkoutIndex(null);
    setLoading(false);
    invalidateStrengthRange();
    await refreshCoach();
  }

  async function deleteSwimmerWorkout(index: number) {
    if (index < 0 || index >= swimmerWorkouts.length || !user || !confirm(t("main.deleteWorkoutConfirm"))) return;
    const workout = swimmerWorkouts[index];
    setLoading(true);
    if (workout.id) {
      const { error } = await supabase.from("strength_workouts").delete().eq("id", workout.id).eq("created_by", user.id);
      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }
    }
    setSwimmerWorkouts((prev) => prev.filter((_, i) => i !== index));
    setSwimmerEditingIndex(null);
    setLoading(false);
    invalidateStrengthRange();
    await refreshSwimmer();
  }

  function toggleCoachPublished(idx: number, e?: MouseEvent<HTMLButtonElement>) {
    e?.stopPropagation();
    const workout = coachWorkouts[idx];
    if (!workout?.id) {
      updateCoachWorkout(idx, { is_published: !workoutIsPublished(workout) });
      return;
    }
    const next = !workoutIsPublished(workout);
    updateCoachWorkout(idx, { is_published: next });
    void setStrengthWorkoutPublished(workout.id, next)
      .then(() => invalidateStrengthRange())
      .catch((err) => {
        updateCoachWorkout(idx, { is_published: workout.is_published });
        alertFromCaught(err, "Could not update visibility");
      });
  }

  function toggleSwimmerPublished(idx: number, e?: MouseEvent<HTMLButtonElement>) {
    e?.stopPropagation();
    const workout = swimmerWorkouts[idx];
    if (!workout?.id) {
      updateSwimmerWorkout(idx, { is_published: !workoutIsPublished(workout) });
      return;
    }
    const next = !workoutIsPublished(workout);
    updateSwimmerWorkout(idx, { is_published: next });
    void setStrengthWorkoutPublished(workout.id, next)
      .then(() => invalidateStrengthRange())
      .catch((err) => {
        updateSwimmerWorkout(idx, { is_published: workout.is_published });
        alertFromCaught(err, "Could not update visibility");
      });
  }

  const downloadStrengthListPdf = (list: StrengthWorkout[]) => {
    if (list.length === 0) return;
    const sections = buildStrengthWorkoutPrintSections(list, swimmers, t, {
      locale,
      appTitle: t("weights.title"),
      brandName: profile?.team_name,
      viewerRole: isCoach ? "coach" : "swimmer",
      viewerTrainingGroup: swimmerGroup,
    });
    const base =
      list.length === 1 && list[0]?.id
        ? `strength-${normDate(list[0].date) ?? dateKey}-${list[0].id!.slice(0, 8)}`
        : `strength-${dateKey}`;
    downloadWorkoutsPdf({ sections, filenameBase: base });
  };

  const changeDate = (delta: number) => {
    if (viewMode === "day") setSelectedDate((d) => (delta > 0 ? addDays(d, 1) : subDays(d, 1)));
    else if (viewMode === "week") {
      setExpandedDayKey(null);
      setSelectedDate((d) => (delta > 0 ? addWeeks(d, 1) : subWeeks(d, 1)));
    } else {
      setExpandedWeekKey(null);
      setExpandedMonthDayKey(null);
      setSelectedDate((d) => (delta > 0 ? addMonths(d, 1) : subMonths(d, 1)));
    }
  };

  const getDateBarLabel = () => {
    if (viewMode === "day") return formatDate(selectedDate, "dateBar");
    if (viewMode === "week") {
      const wStart = startOfWeek(selectedDate, { weekStartsOn: weekStartsOnPref });
      return formatDate(wStart, "weekRange", endOfWeek(selectedDate, { weekStartsOn: weekStartsOnPref }));
    }
    return formatDate(selectedDate, "monthYear");
  };

  const handleMonthCalendarSelect = (date: Date) => {
    setSelectedDate(date);
    setExpandedWeekKey(format(startOfWeek(date, { weekStartsOn: weekStartsOnPref }), "yyyy-MM-dd"));
    setExpandedMonthDayKey(format(date, "yyyy-MM-dd"));
  };

  const goToDayAndEdit = (day: Date) => {
    setSelectedDate(day);
    setViewMode("day");
    setExpandedDayKey(null);
    setExpandedWeekKey(null);
    setExpandedMonthDayKey(null);
  };

  const goToDayAndAddWorkout = (day: Date) => {
    addStrengthWorkoutForDateRef.current = format(day, "yyyy-MM-dd");
    setSelectedDate(day);
    setViewMode("day");
    setExpandedDayKey(null);
    setExpandedWeekKey(null);
    setExpandedMonthDayKey(null);
  };

  const previewDefault = isCoach
    ? undefined
    : (profile?.full_name ?? swimmers.find((s) => s.id === user?.id)?.full_name ?? undefined);

  const renderStrengthCompactCard = (w: StrengthWorkout, dayKeyStr: string, dayWorkouts: StrengthWorkout[], wi: number) => {
    const rawLabel = assignmentLabel(w as unknown as Workout, swimmers);
    const label = rawLabel && rawLabel in GROUP_KEYS ? t(GROUP_KEYS[rawLabel as keyof typeof GROUP_KEYS]) : rawLabel;
    const excludeIds = isCoach
      ? [
          ...new Set(
            dayWorkouts
              .filter((x) => x.id !== w.id && getTimeframe(x) === getTimeframe(w))
              .flatMap((x) => (x.assigned_to && !x.assigned_to_group ? [x.assigned_to] : (x.assignee_ids ?? []))),
          ),
        ]
      : undefined;
    const readNames = assignedToNamesForCaption(w as unknown as Workout, swimmers, t("main.assigneeNobody"), excludeIds);
    const captionLine =
      readNames && !assignedToCaptionRedundantForWorkout(w as unknown as Workout, swimmers)
        ? `${t("main.assignedTo")} ${readNames}`
        : null;
    const workoutKey = w.id || `${dayKeyStr}-w-${wi}`;
    const hasCornerCaption = Boolean(captionLine);
    return (
      <Card key={workoutKey} className="relative gap-0 overflow-hidden rounded-lg py-3 shadow-sm">
        {hasCornerCaption ? (
          <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
            <p className="max-w-[11rem] break-words text-right text-xs text-muted-foreground">{captionLine}</p>
          </div>
        ) : null}
        <CardContent className="relative space-y-4 py-0 pl-4 pr-4">
          <StrengthWorkoutReadOnlyBody
            workout={w}
            assigneeBadgeLabel={label}
            t={t}
            offsetWorkoutBodyForCornerAssignee={hasCornerCaption}
            draftTapeLabel={!workoutIsPublished(w) ? t("main.draftTape") : undefined}
            badgeRowClearanceClassName={
              hasCornerCaption ? (w.content.trim() ? "pr-[4.75rem]" : "pr-20") : undefined
            }
          />
          {w.id ? (
            <WorkoutAnalysis
              content={w.content}
              date={dayKeyStr}
              strengthWorkoutId={w.id}
              viewerRole={isCoach ? "coach" : "swimmer"}
              hideFeedback={false}
            />
          ) : null}
        </CardContent>
      </Card>
    );
  };

  const renderWeekView = () => {
    if (rangeLoading && weekStrengthWorkouts.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center py-10" aria-busy="true">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      );
    }
    const days = eachDayOfInterval({
      start: startOfWeek(selectedDate, { weekStartsOn: weekStartsOnPref }),
      end: endOfWeek(selectedDate, { weekStartsOn: weekStartsOnPref }),
    });
    return days.map((day) => {
      const dayKeyStr = format(day, "yyyy-MM-dd");
      const dayWorkouts = isCoach
        ? sortCoachWorkouts(
            scopedWeekStrengthWorkouts.filter((w) => normDate(w.date) === dayKeyStr) as unknown as Workout[],
            swimmers,
          ) as unknown as StrengthWorkout[]
        : scopedWeekStrengthWorkouts.filter((w) => normDate(w.date) === dayKeyStr);
      return (
        <StrengthExpandableDay
          key={day.toISOString()}
          day={day}
          dayWorkouts={dayWorkouts}
          isExpanded={expandedDayKey === dayKeyStr}
          onToggle={() => {
            setExpandedDayKey(expandedDayKey === dayKeyStr ? null : dayKeyStr);
            setSelectedDate(day);
          }}
          previewLabel={(w) => strengthWeekDayCollapsedPreviewLabel(w, swimmersAsProfile, previewDefault, t)}
          t={t}
          formatDate={formatDate}
          renderWorkouts={() =>
            dayWorkouts.length > 0 ? (
              dayWorkouts.map((w, wi) => renderStrengthCompactCard(w, dayKeyStr, dayWorkouts, wi))
            ) : (
              <p className="text-xs text-muted-foreground">{t("main.noWorkout")}</p>
            )
          }
          actions={
            expandedDayKey === dayKeyStr ? (
              dayWorkouts.length > 0 ? (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => goToDayAndEdit(day)}>
                  <Pencil className="size-5" />
                  {t("main.editDay")}
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => goToDayAndAddWorkout(day)}>
                  <Plus className="size-4" />
                  {t("main.addWorkout")}
                </Button>
              )
            ) : undefined
          }
        />
      );
    });
  };

  const renderMonthView = () => {
    if (rangeLoading && monthStrengthWorkouts.length === 0) {
      return (
        <div className="flex justify-center py-10" aria-busy="true">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      );
    }
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const weeks: { start: Date; end: Date; key: string }[] = [];
    let ws = startOfWeek(monthStart, { weekStartsOn: weekStartsOnPref });
    while (ws <= monthEnd) {
      const we = endOfWeek(ws, { weekStartsOn: weekStartsOnPref });
      weeks.push({ start: ws, end: we, key: format(ws, "yyyy-MM-dd") });
      ws = addDays(we, 1);
    }
    return weeks.map(({ start, end, key }) => {
      const weekWorkoutsList = scopedMonthStrengthWorkouts.filter((w) =>
        isWithinInterval(new Date(`${normDate(w.date) ?? ""}T12:00:00`), { start, end }),
      );
      const isExpanded = expandedWeekKey === key;
      return (
        <div key={key} className="w-full min-w-0 rounded-lg border bg-card overflow-hidden">
          <button
            type="button"
            className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left"
            onClick={() => {
              setExpandedWeekKey(isExpanded ? null : key);
              setExpandedMonthDayKey(null);
            }}
          >
            <span className="min-w-0 flex-1 text-xs font-medium">
              {t("settings.week")} {weeks.findIndex((w) => w.key === key) + 1}: {formatDate(start, "weekRange", end)}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {weekWorkoutsList.length} {weekWorkoutsList.length !== 1 ? t("main.weekWorkoutsPlural") : t("main.weekWorkouts")}
              {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </span>
          </button>
          {isExpanded && (
            <div className="animate-in slide-in-from-top-2 border-t px-3 py-2 space-y-1.5 duration-200">
              {eachDayOfInterval({ start, end }).map((day) => {
                const dayKeyStr = format(day, "yyyy-MM-dd");
                const dayWorkouts = isCoach
                  ? sortCoachWorkouts(
                      weekWorkoutsList.filter((w) => normDate(w.date) === dayKeyStr) as unknown as Workout[],
                      swimmers,
                    ) as unknown as StrengthWorkout[]
                  : weekWorkoutsList.filter((w) => normDate(w.date) === dayKeyStr);
                const isDayExpanded = expandedMonthDayKey === dayKeyStr;
                return (
                  <div key={dayKeyStr} className="rounded-lg border bg-card overflow-hidden">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-2 text-left transition-colors hover:bg-accent/50"
                      onClick={() => {
                        setExpandedMonthDayKey(isDayExpanded ? null : dayKeyStr);
                        setSelectedDate(day);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="mb-0.5 text-xs font-medium text-muted-foreground">{formatDate(day, "dateBar")}</p>
                        {dayWorkouts.length > 0 ? (
                          <div className="space-y-0.5 font-sans text-xs text-muted-foreground">
                            {dayWorkouts.map((w, wi) => (
                              <p key={wi}>{strengthWeekDayCollapsedPreviewLabel(w, swimmersAsProfile, previewDefault, t)}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">{t("main.noWorkout")}</p>
                        )}
                      </div>
                      {isDayExpanded ? (
                        <ChevronUp className="size-4 shrink-0 text-muted-foreground ml-2" />
                      ) : (
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground ml-2" />
                      )}
                    </button>
                    {isDayExpanded && (
                      <div className="animate-in slide-in-from-top-2 border-t px-2 py-2 duration-200 space-y-3">
                        {dayWorkouts.length > 0 ? (
                          <>
                            {dayWorkouts.map((w, wi) => renderStrengthCompactCard(w, dayKeyStr, dayWorkouts, wi))}
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => goToDayAndEdit(day)}>
                              <Pencil className="size-5" />
                              {t("main.editDay")}
                            </Button>
                          </>
                        ) : (
                          <Button variant="outline" size="sm" className="gap-2" onClick={() => goToDayAndAddWorkout(day)}>
                            <Plus className="size-4" />
                            {t("main.addWorkout")}
                          </Button>
                        )}
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

  const workoutListKey = (w: StrengthWorkout, i: number) => w.id || `new-${i}`;

  const previewHandlers = (key: string) =>
    ({
      role: "button" as const,
      tabIndex: 0,
      onClick: () => setExpandedWorkoutKey((prev) => (prev === key ? null : key)),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpandedWorkoutKey((prev) => (prev === key ? null : key));
        }
      },
    }) as const;

  const coachStrengthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coachStrengthLongPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const coachStrengthLongPressConsumedClickRef = useRef(false);

  const coachStrengthReadonlyCardHandlers = useCallback(
    (originalIdx: number, expandOnClick: boolean, workoutKey: string) => {
      const clearLongPressTimer = () => {
        if (coachStrengthLongPressTimerRef.current) {
          clearTimeout(coachStrengthLongPressTimerRef.current);
          coachStrengthLongPressTimerRef.current = null;
        }
        coachStrengthLongPressStartRef.current = null;
      };
      const releasePressPointer = (e: PointerEvent<HTMLDivElement>) => {
        clearLongPressTimer();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      };
      return {
        ...(expandOnClick
          ? {
              role: "button" as const,
              tabIndex: 0 as const,
              onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
                if (e.key !== "Enter" && e.key !== " ") return;
                if ((e.target as HTMLElement).closest(WORKOUT_CARD_TOGGLE_IGNORE)) return;
                e.preventDefault();
                setExpandedWorkoutKey((prev) => (prev === workoutKey ? null : workoutKey));
              },
            }
          : {}),
        onPointerDownCapture(e: PointerEvent<HTMLDivElement>) {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest(WORKOUT_CARD_TOGGLE_IGNORE)) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          clearLongPressTimer();
          coachStrengthLongPressConsumedClickRef.current = false;
          coachStrengthLongPressStartRef.current = { x: e.clientX, y: e.clientY };
          coachStrengthLongPressTimerRef.current = setTimeout(() => {
            coachStrengthLongPressTimerRef.current = null;
            coachStrengthLongPressStartRef.current = null;
            coachStrengthLongPressConsumedClickRef.current = true;
            setEditingWorkoutIndex(originalIdx);
          }, 1000);
        },
        onPointerMoveCapture(e: PointerEvent<HTMLDivElement>) {
          if (!coachStrengthLongPressTimerRef.current || !coachStrengthLongPressStartRef.current) return;
          const s = coachStrengthLongPressStartRef.current;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (dx * dx + dy * dy > 400) clearLongPressTimer();
        },
        onPointerUpCapture: releasePressPointer,
        onPointerCancelCapture: releasePressPointer,
        onClick(e: MouseEvent<HTMLDivElement>) {
          if ((e.target as HTMLElement).closest(WORKOUT_CARD_TOGGLE_IGNORE)) return;
          if (coachStrengthLongPressConsumedClickRef.current) {
            coachStrengthLongPressConsumedClickRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (expandOnClick) setExpandedWorkoutKey((prev) => (prev === workoutKey ? null : workoutKey));
        },
      };
    },
    [],
  );

  if (authLoading || !user || !role) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  const weightsMenuShellMaxWidthStyle =
    weightsMenuShellWidthPx != null && weightsMenuShellWidthPx > 0
      ? { maxWidth: weightsMenuShellWidthPx }
      : undefined;

  const imageWorkoutAnalyzing = imageFromWorkoutLoading ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
      {t("main.workoutFromImageAnalyzing")}
    </span>
  ) : null;

  return (
    <div className="min-h-dvh bg-background pt-[env(safe-area-inset-top)]">
      <div
        ref={setWeightsMenuShellBoundary}
        className="app-shell mx-auto flex w-full min-w-0 max-w-md flex-col px-5 pt-5 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-5 lg:max-w-[34rem] lg:px-6"
      >
        <div className="mb-5 flex w-full min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <Link href="/" className="shrink-0">
              <Button variant="ghost" size="icon" className="size-10" aria-label={t("common.back")}>
                <ArrowLeft className="size-6" />
              </Button>
            </Link>
            <h1 className="min-w-0 shrink-0 truncate text-lg font-bold">{t("weights.title")}</h1>
            <div className="shrink-0">
              <ThemeToggle />
            </div>
            {role === "swimmer" && swimmers.length > 0 ? (
              <div className="min-w-0 flex-1 overflow-hidden">
                <DropdownMenu
                  onOpenChange={(open) => {
                    if (!open) setWeightsPersonalWorkoutsOpen(false);
                    else if (
                      selectedViewSwimmerId &&
                      selectedViewSwimmerId !== ONLY_GROUPS_ID &&
                      user?.id &&
                      swimmers.some((s) => s.id === selectedViewSwimmerId && s.id !== user.id)
                    ) {
                      setWeightsPersonalWorkoutsOpen(true);
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-full min-w-0 justify-between gap-1.5 px-2 text-left text-xs font-medium"
                    >
                      <span className="truncate">
                        {selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID
                          ? t("main.groupWorkouts")
                          : selectedViewSwimmerId
                            ? swimmers.find((s) => s.id === selectedViewSwimmerId)?.full_name ?? t("login.swimmer")
                            : profile?.full_name ?? t("main.myWorkouts")}
                      </span>
                      <ChevronDown className="size-3.5 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    collisionBoundary={weightsMenuShellBoundary ?? undefined}
                    collisionPadding={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={weightsMenuShellMaxWidthStyle}
                    className="box-border max-h-[calc(100dvh-2.5rem)] w-max min-w-[var(--radix-popper-anchor-width)] overflow-x-hidden overflow-y-auto p-1"
                  >
                    <DropdownMenuItem onSelect={() => setSelectedViewSwimmerId(null)}>
                      {profile?.full_name ?? t("main.myWorkouts")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSelectedViewSwimmerId(ONLY_GROUPS_ID)}>{t("main.groupWorkouts")}</DropdownMenuItem>
                    {swimmers.some((s) => s.id !== user?.id) ? (
                      <DropdownMenuGroup
                        ref={weightsPersonalWorkoutsGroupRef}
                        onMouseLeave={handleWeightsPersonalWorkoutsGroupMouseLeave}
                      >
                        <DropdownMenuItem
                          className="w-full min-w-0"
                          aria-expanded={weightsPersonalWorkoutsOpen}
                          onMouseEnter={() => setWeightsPersonalWorkoutsOpen(true)}
                          onSelect={(e) => {
                            e.preventDefault();
                            setWeightsPersonalWorkoutsOpen((o) => !o);
                          }}
                        >
                          <span className="min-w-0 flex-1 text-left">{t("main.personalWorkoutsMenu")}</span>
                          <ChevronDown
                            className={cn(
                              "ml-auto size-4 shrink-0 opacity-50 transition-transform",
                              weightsPersonalWorkoutsOpen && "rotate-180",
                            )}
                            aria-hidden
                          />
                        </DropdownMenuItem>
                        {weightsPersonalWorkoutsOpen
                          ? swimmers
                              .filter((s) => s.id !== user?.id)
                              .map((s) => (
                                <DropdownMenuItem
                                  key={s.id}
                                  className="h-auto min-h-8 min-w-0 max-w-full items-start justify-start whitespace-normal py-2 pl-7 pr-2"
                                  onSelect={() => setSelectedViewSwimmerId(s.id)}
                                >
                                  <span className="w-full min-w-0 break-words text-left leading-snug">
                                    {s.full_name ?? s.id}
                                  </span>
                                </DropdownMenuItem>
                              ))
                          : null}
                      </DropdownMenuGroup>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : isCoach && swimmers.length > 0 ? (
              <div className="min-w-0 flex-1 overflow-hidden">
                <DropdownMenu
                  onOpenChange={(open) => {
                    if (!open) setWeightsPersonalWorkoutsOpen(false);
                    else if (
                      selectedCoachSwimmerId &&
                      selectedCoachSwimmerId !== ONLY_GROUPS_ID &&
                      selectedCoachSwimmerId !== ALL_ID
                    ) {
                      setWeightsPersonalWorkoutsOpen(true);
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-full min-w-0 justify-between gap-1.5 px-2 text-left text-xs font-medium"
                    >
                      <span className="truncate">
                        {selectedCoachSwimmerId === ALL_ID
                          ? t("main.allWorkouts")
                          : selectedCoachSwimmerId === ONLY_GROUPS_ID
                            ? t("main.groupWorkouts")
                            : selectedCoachSwimmerId
                              ? swimmers.find((s) => s.id === selectedCoachSwimmerId)?.full_name ?? t("login.swimmer")
                              : t("main.allWorkouts")}
                      </span>
                      <ChevronDown className="size-3.5 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    collisionBoundary={weightsMenuShellBoundary ?? undefined}
                    collisionPadding={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={weightsMenuShellMaxWidthStyle}
                    className="box-border max-h-[calc(100dvh-2.5rem)] w-max min-w-[var(--radix-popper-anchor-width)] overflow-x-hidden overflow-y-auto p-1"
                  >
                    <DropdownMenuItem onSelect={() => setSelectedCoachSwimmerId(ALL_ID)}>{t("main.allWorkouts")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSelectedCoachSwimmerId(ONLY_GROUPS_ID)}>{t("main.groupWorkouts")}</DropdownMenuItem>
                    <DropdownMenuGroup
                      ref={weightsPersonalWorkoutsGroupRef}
                      onMouseLeave={handleWeightsPersonalWorkoutsGroupMouseLeave}
                    >
                      <DropdownMenuItem
                        className="w-full min-w-0"
                        aria-expanded={weightsPersonalWorkoutsOpen}
                        onMouseEnter={() => setWeightsPersonalWorkoutsOpen(true)}
                        onSelect={(e) => {
                          e.preventDefault();
                          setWeightsPersonalWorkoutsOpen((o) => !o);
                        }}
                      >
                        <span className="min-w-0 flex-1 text-left">{t("main.personalWorkoutsMenu")}</span>
                        <ChevronDown
                          className={cn(
                            "ml-auto size-4 shrink-0 opacity-50 transition-transform",
                            weightsPersonalWorkoutsOpen && "rotate-180",
                          )}
                          aria-hidden
                        />
                      </DropdownMenuItem>
                      {weightsPersonalWorkoutsOpen
                        ? swimmers.map((s) => (
                            <DropdownMenuItem
                              key={s.id}
                              className="h-auto min-h-8 min-w-0 max-w-full items-start justify-start whitespace-normal py-2 pl-7 pr-2"
                              onSelect={() => setSelectedCoachSwimmerId(s.id)}
                            >
                              <span className="w-full min-w-0 break-words text-left leading-snug">{s.full_name ?? s.id}</span>
                            </DropdownMenuItem>
                          ))
                        : null}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="min-w-0 flex-1 overflow-hidden">
                <span className="flex h-9 w-full min-w-0 items-center truncate rounded-md border border-input bg-muted/50 px-2 text-xs font-medium capitalize text-muted-foreground">
                  {profile?.full_name ?? role}
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {role && user?.id && (
              <NotificationBell
                role={role}
                userId={user.id}
                swimmerGroup={swimmerGroup}
                swimmers={swimmers}
                onNotificationNavigate={(info) => {
                  const q = new URLSearchParams({ date: info.date });
                  if (info.workoutId) q.set("workout", info.workoutId);
                  router.push(`/?${q.toString()}`);
                }}
              />
            )}
            <Link href="/settings">
              <Button variant="ghost" size="icon" className="size-9" aria-label={t("common.settings")}>
                <Settings className="size-5" />
              </Button>
            </Link>
            <SignOutDropdown trigger={<Button variant="ghost" size="icon" className="size-9" aria-label={t("common.signOut")}><LogOut className="size-5" /></Button>} />
          </div>
        </div>

        <input
          ref={imageCameraInputRef}
          type="file"
          accept="image/*,image/heic,image/heif,.heic,.heif"
          capture="environment"
          className="hidden"
          onChange={handleStrengthImageFromWorkout}
        />
        <input
          ref={imageGalleryInputRef}
          type="file"
          accept="image/*,image/heic,image/heif,.heic,.heif"
          className="hidden"
          onChange={handleStrengthImageFromWorkout}
        />

        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
          <Button variant="ghost" size="icon" className="size-10 shrink-0" onClick={() => changeDate(-1)}>
            <ChevronLeft className="size-6" />
            <span className="sr-only">{t("main.previous")}</span>
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
                weekStartsOn={weekStartsOnPref}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="size-10 shrink-0" onClick={() => changeDate(1)}>
            <ChevronRight className="size-6" />
            <span className="sr-only">{t("main.next")}</span>
          </Button>
        </div>

        <div className="mb-3 flex gap-1 rounded-lg border bg-card p-1">
          {(["day", "week", "month"] as const).map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 gap-1.5 text-xs capitalize"
              onClick={() => setViewMode(mode)}
            >
              {mode === "day" ? t("main.day") : mode === "week" ? t("main.week") : t("main.month")}
            </Button>
          ))}
        </div>

        {fetchError && (
          <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <p>{fetchError}</p>
          </div>
        )}

        {saved && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("main.saved")}</span>
          </div>
        )}

        {isCoach && viewMode === "day" && (
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {coachLoading && coachWorkouts.length === 0 ? (
              <div className="flex justify-center py-10" aria-busy="true">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {coachWorkouts.map((workout, originalIdx) => {
                  const rawLabel = assignmentLabel(workout as unknown as Workout, swimmers);
                  const label =
                    rawLabel && rawLabel in GROUP_KEYS ? t(GROUP_KEYS[rawLabel as keyof typeof GROUP_KEYS]) : rawLabel;
                  const isEditing = editingWorkoutIndex === originalIdx;
                  const wkey = workoutListKey(workout, originalIdx);
                  const collapsed = coachUsesPreviews && expandedWorkoutKey !== wkey;
                  const showCoachReadOnlyPreview = !isEditing && (!coachUsesPreviews || collapsed);
                  const conflictIds = swimmerIdsInTimeframeExcluding(coachWorkouts, originalIdx);
                  const readNames = assignedToNamesForCaption(
                    workout as unknown as Workout,
                    swimmers,
                    t("main.assigneeNobody"),
                    Array.from(conflictIds),
                  );
                  const coachCaptionLine =
                    readNames && !assignedToCaptionRedundantForWorkout(workout as unknown as Workout, swimmers)
                      ? `${t("main.assignedTo")} ${readNames}`
                      : null;

                  return (
                    <Card
                      key={wkey}
                      className={cn("relative py-4", coachUsesPreviews && !isEditing && collapsed && "cursor-pointer")}
                      {...(showCoachReadOnlyPreview
                        ? coachStrengthReadonlyCardHandlers(originalIdx, coachUsesPreviews && collapsed, wkey)
                        : {})}
                    >
                      {showCoachReadOnlyPreview ? (
                        <>
                          <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
                            <div className="flex shrink-0 items-center gap-2">
                              {workout.content.trim() && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 shrink-0"
                                  title={t("main.exportPdfTitle")}
                                  aria-label={t("main.exportPdf")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadStrengthListPdf([workout]);
                                  }}
                                >
                                  <Printer className="size-5" />
                                </Button>
                              )}
                              {workout.id ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 shrink-0"
                                  onClick={(e) => void toggleCoachPublished(originalIdx, e)}
                                  aria-label={workoutIsPublished(workout) ? t("main.unpublishWorkoutAria") : t("main.publishWorkoutAria")}
                                >
                                  {workoutIsPublished(workout) ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingWorkoutIndex(originalIdx);
                                }}
                                aria-label={t("main.editDay")}
                              >
                                <Pencil className="size-5" />
                              </Button>
                            </div>
                            {coachCaptionLine ? (
                              <p className="max-w-[11rem] break-words text-right text-xs text-muted-foreground">{coachCaptionLine}</p>
                            ) : null}
                          </div>
                          <CardContent className="pl-4 py-0 pr-4">
                            <StrengthWorkoutReadOnlyBody
                              workout={workout}
                              assigneeBadgeLabel={label}
                              t={t}
                              offsetWorkoutBodyForCornerAssignee={Boolean(coachCaptionLine)}
                              draftTapeLabel={!workoutIsPublished(workout) ? t("main.draftTape") : undefined}
                              badgeRowClearanceClassName={
                                workout.content.trim() ? "pr-[4.75rem]" : "pr-20"
                              }
                            />
                          </CardContent>
                        </>
                      ) : (
                        <CardContent className="w-full min-w-0 px-4 py-0 space-y-2">
                          <div className="flex flex-wrap items-start gap-2">
                            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                              <WorkoutAssignPicker
                                mode="coach"
                                value={
                                  workout.assigned_to
                                    ? `swimmer:${workout.assigned_to}`
                                    : workout.assigned_to_group === PERSONAL_ASSIGNMENT
                                      ? `group:${PERSONAL_ASSIGNMENT}`
                                      : workout.assigned_to_group
                                        ? `group:${workout.assigned_to_group}`
                                        : ""
                                }
                                onValueChange={(v) => {
                                  if (v.startsWith("swimmer:")) {
                                    updateCoachWorkout(originalIdx, { assigned_to: v.slice(8) || null, assigned_to_group: null, assignee_ids: undefined });
                                  } else if (v.startsWith("group:")) {
                                    const g = v.slice(6);
                                    if (g === PERSONAL_ASSIGNMENT) {
                                      updateCoachWorkout(originalIdx, { assigned_to: null, assigned_to_group: PERSONAL_ASSIGNMENT, assignee_ids: [] });
                                    } else {
                                      updateCoachWorkout(originalIdx, { assigned_to: null, assigned_to_group: g as SwimmerGroup, assignee_ids: undefined });
                                    }
                                  } else {
                                    updateCoachWorkout(originalIdx, { assigned_to: null, assigned_to_group: null, assignee_ids: undefined });
                                  }
                                }}
                                swimmers={swimmers}
                                t={t}
                                legacySwimmerId={
                                  workout.assigned_to && !workout.assigned_to_group && swimmers.some((s) => s.id === workout.assigned_to)
                                    ? workout.assigned_to
                                    : null
                                }
                                legacySwimmerName={
                                  workout.assigned_to && !workout.assigned_to_group && swimmers.some((s) => s.id === workout.assigned_to)
                                    ? swimmers.find((s) => s.id === workout.assigned_to)?.full_name ?? null
                                    : null
                                }
                              />
                              <select
                                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={workout.session || ""}
                                onChange={(e) => updateCoachWorkout(originalIdx, { session: e.target.value || null })}
                              >
                                {SESSION_OPTIONS.map((v) => (
                                  <option key={v || "any"} value={v}>
                                    {v === "AM" ? t("session.am") : v === "PM" ? t("session.pm") : t("main.anytime")}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {workout.assigned_to_group && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-medium text-muted-foreground">{t("coach.swimmersInWorkout")}</p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const defaultGroupIds =
                                      workout.assigned_to_group === PERSONAL_ASSIGNMENT
                                        ? []
                                        : swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
                                    setCoachWorkouts((prev) =>
                                      prev.map((w, i) => {
                                        if (i === originalIdx) return { ...w, assignee_ids: defaultGroupIds };
                                        if (w.assigned_to_group) {
                                          const currentIds =
                                            w.assigned_to_group === PERSONAL_ASSIGNMENT
                                              ? (w.assignee_ids ?? [])
                                              : Array.isArray(w.assignee_ids)
                                                ? w.assignee_ids
                                                : swimmers.filter((s) => s.swimmer_group === w.assigned_to_group).map((s) => s.id);
                                          return { ...w, assignee_ids: currentIds.filter((id) => !defaultGroupIds.includes(id)) };
                                        }
                                        return w;
                                      }),
                                    );
                                  }}
                                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                  title={t("coach.resetToDefault")}
                                  aria-label={t("coach.resetToDefault")}
                                >
                                  <RotateCcw className="size-3.5" />
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {(() => {
                                  const defaultGroupIds =
                                    workout.assigned_to_group === PERSONAL_ASSIGNMENT
                                      ? []
                                      : swimmers.filter((x) => x.swimmer_group === workout.assigned_to_group).map((x) => x.id);
                                  const currentIds = Array.isArray(workout.assignee_ids) ? workout.assignee_ids : defaultGroupIds;
                                  const sortedSwimmers =
                                    workout.assigned_to_group === PERSONAL_ASSIGNMENT
                                      ? [...swimmers].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
                                      : [...swimmers].sort((a, b) => {
                                          const go = (g: SwimmerGroup | null | undefined) =>
                                            g === workout.assigned_to_group ? 0 : g == null ? 4 : SWIMMER_GROUPS.indexOf(g) + 1;
                                          const diff = go(a.swimmer_group) - go(b.swimmer_group);
                                          return diff !== 0 ? diff : (a.full_name ?? "").localeCompare(b.full_name ?? "");
                                        });
                                  return sortedSwimmers.map((s) => {
                                    const isIn = currentIds.includes(s.id);
                                    const hasConflict = conflictIds.has(s.id);
                                    return (
                                      <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => {
                                          if (isIn) updateCoachWorkout(originalIdx, { assignee_ids: currentIds.filter((id) => id !== s.id) });
                                          else if (!hasConflict || isIn) updateCoachWorkout(originalIdx, { assignee_ids: [...currentIds, s.id] });
                                        }}
                                        title={hasConflict ? t("coach.workoutConflict") : undefined}
                                        className={cn(
                                          hasConflict
                                            ? "rounded-md border border-red-400/80 bg-red-400/10 px-2.5 py-1.5 text-xs font-medium text-red-800 dark:bg-red-500/15 dark:text-red-200"
                                            : isIn
                                              ? "rounded-md border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary"
                                              : "rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent",
                                        )}
                                      >
                                        {hasConflict && <AlertCircle className="mr-1 inline size-3.5" aria-hidden />}
                                        {s.full_name || s.id.slice(0, 8)}
                                      </button>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            {imageFromWorkoutLoading ? (
                              imageWorkoutAnalyzing
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => pickStrengthImageSource("camera", originalIdx)}
                                >
                                  <Camera className="size-4" />
                                  {t("main.workoutFromImageTakePicture")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => pickStrengthImageSource("gallery", originalIdx)}
                                >
                                  <ImageUp className="size-4" />
                                  {t("main.workoutFromImageUploadPhoto")}
                                </Button>
                              </>
                            )}
                            {imageFromWorkoutError && editingWorkoutIndex === originalIdx ? (
                              <>
                                <span className="text-sm text-destructive">{imageFromWorkoutError}</span>
                                <button
                                  type="button"
                                  onClick={() => setImageFromWorkoutError(null)}
                                  className="text-xs text-muted-foreground hover:underline"
                                >
                                  Dismiss
                                </button>
                              </>
                            ) : null}
                          </div>
                          <WorkoutContentTextarea
                            placeholder={t("weights.placeholder")}
                            value={workout.content}
                            onChange={(next) => updateCoachWorkout(originalIdx, { content: next })}
                          />
                          {workout.id && (
                            <WorkoutAnalysis
                              content={workout.content}
                              date={dateKey}
                              strengthWorkoutId={workout.id}
                              viewerRole="coach"
                              hideFeedback={false}
                            />
                          )}
                          <div className="flex flex-wrap gap-2 pt-2">
                            <Button size="sm" onClick={() => void saveCoachWorkout(originalIdx)} disabled={loading}>
                              {t("common.save")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingWorkoutIndex(null)}>
                              {t("common.cancel")}
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => void deleteCoachWorkout(originalIdx)}>
                              {t("common.delete")}
                            </Button>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setCoachWorkouts((prev) => {
                        setEditingWorkoutIndex(prev.length);
                        return [...prev, emptyCoachStrengthRow(dateKey, coachPreferredAssigneeFromFilter(selectedCoachSwimmerId))];
                      });
                    }}
                    className="size-10"
                    aria-label={t("main.addWorkout")}
                  >
                    <Plus className="size-5" />
                  </Button>
                </div>
                {coachWorkouts.length === 0 && <p className="text-center text-muted-foreground py-4">{t("main.noWorkoutForDay")}</p>}
              </>
            )}
          </div>
        )}

        {!isCoach && viewMode === "day" && (
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {swimmerLoading && swimmerWorkouts.length === 0 ? (
              <div className="flex justify-center py-10" aria-busy="true">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {swimmerWorkouts.map((workout, originalIdx) => {
                  const canSwimmerEdit =
                    isSwimmerOwnStrengthDay && (!workout.id || workout.created_by === user?.id);
                  const isEditing = swimmerEditingIndex === originalIdx && canSwimmerEdit;
                  const wkey = workoutListKey(workout, originalIdx);
                  const collapsed = swimmerUsesPreviews && expandedWorkoutKey !== wkey;
                  const showSwimmerReadOnlyPreview = !isEditing && (!swimmerUsesPreviews || collapsed);
                  const rawLabel = assignmentLabel(workout as unknown as Workout, swimmers);
                  const label = rawLabel && rawLabel in GROUP_KEYS ? t(GROUP_KEYS[rawLabel as keyof typeof GROUP_KEYS]) : rawLabel;
                  const swimmerReadNames = assignedToNamesForCaption(
                    workout as unknown as Workout,
                    swimmers,
                    t("main.assigneeNobody"),
                  );
                  const swimmerCaptionLine =
                    swimmerReadNames && !assignedToCaptionRedundantForWorkout(workout as unknown as Workout, swimmers)
                      ? `${t("main.assignedTo")} ${swimmerReadNames}`
                      : null;
                  const swimmerBadgeRowClearance = workout.content.trim()
                    ? canSwimmerEdit
                      ? "pr-[4.75rem]"
                      : "pr-12"
                    : canSwimmerEdit
                      ? "pr-20"
                      : undefined;

                  return (
                    <Card
                      key={wkey}
                      className={cn("relative py-4", swimmerUsesPreviews && !isEditing && collapsed && "cursor-pointer")}
                      {...(swimmerUsesPreviews && !isEditing && collapsed ? previewHandlers(wkey) : {})}
                    >
                      {showSwimmerReadOnlyPreview ? (
                        <>
                          <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
                            <div className="flex shrink-0 items-center gap-2">
                              {workout.content.trim() && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 shrink-0"
                                  title={t("main.exportPdfTitle")}
                                  aria-label={t("main.exportPdf")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadStrengthListPdf([workout]);
                                  }}
                                >
                                  <Printer className="size-5" />
                                </Button>
                              )}
                              {canSwimmerEdit && workout.id ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 shrink-0"
                                  onClick={(e) => void toggleSwimmerPublished(originalIdx, e)}
                                  aria-label={workoutIsPublished(workout) ? t("main.unpublishWorkoutAria") : t("main.publishWorkoutAria")}
                                >
                                  {workoutIsPublished(workout) ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
                                </Button>
                              ) : null}
                              {canSwimmerEdit ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSwimmerEditingIndex(originalIdx);
                                  }}
                                  aria-label={t("main.editDay")}
                                >
                                  <Pencil className="size-5" />
                                </Button>
                              ) : null}
                            </div>
                            {swimmerCaptionLine ? (
                              <p className="max-w-[11rem] break-words text-right text-xs text-muted-foreground">{swimmerCaptionLine}</p>
                            ) : null}
                          </div>
                          <CardContent className="pl-4 py-0 pr-4">
                            <StrengthWorkoutReadOnlyBody
                              workout={workout}
                              assigneeBadgeLabel={label}
                              t={t}
                              offsetWorkoutBodyForCornerAssignee={Boolean(swimmerCaptionLine)}
                              draftTapeLabel={!workoutIsPublished(workout) ? t("main.draftTape") : undefined}
                              badgeRowClearanceClassName={swimmerBadgeRowClearance}
                            />
                          </CardContent>
                        </>
                      ) : (
                        <CardContent className="w-full min-w-0 px-4 py-0 space-y-2">
                          <div className="flex flex-wrap items-start gap-2">
                            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                              <WorkoutAssignPicker
                                mode="swimmer"
                                value={
                                  workout.assigned_to_group === PERSONAL_ASSIGNMENT
                                    ? `group:${PERSONAL_ASSIGNMENT}`
                                    : workout.assigned_to
                                      ? `swimmer:${workout.assigned_to}`
                                      : "personal"
                                }
                                onValueChange={(v) => {
                                  if (v === "personal") {
                                    updateSwimmerWorkout(originalIdx, { assigned_to: null, assigned_to_group: PERSONAL_ASSIGNMENT, assignee_ids: [] });
                                  } else if (v.startsWith("swimmer:")) {
                                    const id = v.slice(8);
                                    updateSwimmerWorkout(originalIdx, { assigned_to: id || null, assigned_to_group: null, assignee_ids: id ? [id] : undefined });
                                  } else if (v.startsWith("group:") && v.slice(6) === PERSONAL_ASSIGNMENT) {
                                    updateSwimmerWorkout(originalIdx, { assigned_to: null, assigned_to_group: PERSONAL_ASSIGNMENT, assignee_ids: [] });
                                  }
                                }}
                                swimmers={swimmers}
                                t={t}
                                userId={user?.id}
                                selfLabel={profile?.full_name}
                              />
                              <select
                                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={workout.session || ""}
                                onChange={(e) => updateSwimmerWorkout(originalIdx, { session: e.target.value || null })}
                              >
                                {SESSION_OPTIONS.map((v) => (
                                  <option key={v || "any"} value={v}>
                                    {v === "AM" ? t("session.am") : v === "PM" ? t("session.pm") : t("main.anytime")}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {workout.assigned_to_group === PERSONAL_ASSIGNMENT && (
                            <div className="flex flex-wrap gap-1.5">
                              {swimmers
                                .filter((s) => s.id !== user?.id)
                                .map((s) => {
                                  const currentIds = workout.assignee_ids ?? [];
                                  const isIn = currentIds.includes(s.id);
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() =>
                                        updateSwimmerWorkout(originalIdx, {
                                          assignee_ids: isIn ? currentIds.filter((id) => id !== s.id) : [...currentIds, s.id],
                                        })
                                      }
                                      className={cn(
                                        "rounded-md border px-2.5 py-1.5 text-xs font-medium",
                                        isIn ? "border-primary bg-primary/10 text-primary" : "border-input bg-background text-muted-foreground",
                                      )}
                                    >
                                      {s.full_name ?? s.id.slice(0, 8)}
                                    </button>
                                  );
                                })}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            {imageFromWorkoutLoading ? (
                              imageWorkoutAnalyzing
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => pickStrengthImageSource("camera", originalIdx)}
                                >
                                  <Camera className="size-4" />
                                  {t("main.workoutFromImageTakePicture")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => pickStrengthImageSource("gallery", originalIdx)}
                                >
                                  <ImageUp className="size-4" />
                                  {t("main.workoutFromImageUploadPhoto")}
                                </Button>
                              </>
                            )}
                            {imageFromWorkoutError && swimmerEditingIndex === originalIdx ? (
                              <>
                                <span className="text-sm text-destructive">{imageFromWorkoutError}</span>
                                <button
                                  type="button"
                                  onClick={() => setImageFromWorkoutError(null)}
                                  className="text-xs text-muted-foreground hover:underline"
                                >
                                  Dismiss
                                </button>
                              </>
                            ) : null}
                          </div>
                          <WorkoutContentTextarea
                            placeholder={t("weights.placeholder")}
                            value={workout.content}
                            onChange={(next) => updateSwimmerWorkout(originalIdx, { content: next })}
                          />
                          {workout.id && (
                            <WorkoutAnalysis
                              content={workout.content}
                              date={dateKey}
                              strengthWorkoutId={workout.id}
                              viewerRole="swimmer"
                              hideFeedback={false}
                            />
                          )}
                          <div className="flex flex-wrap gap-2 pt-2">
                            <Button size="sm" onClick={() => void saveSwimmerWorkout(originalIdx)} disabled={loading}>
                              {t("common.save")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setSwimmerEditingIndex(null)}>
                              {t("common.cancel")}
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => void deleteSwimmerWorkout(originalIdx)}>
                              {t("common.delete")}
                            </Button>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
                {isSwimmerOwnStrengthDay ? (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setSwimmerWorkouts((prev) => {
                          setSwimmerEditingIndex(prev.length);
                          return [...prev, emptySwimmerStrengthRow(dateKey, user?.id)];
                        });
                      }}
                      className="size-10"
                      aria-label={t("main.addWorkout")}
                    >
                      <Plus className="size-5" />
                    </Button>
                  </div>
                ) : null}
                {swimmerWorkouts.length === 0 && <p className="text-center text-muted-foreground py-4">{t("main.noWorkoutForDay")}</p>}
              </>
            )}
          </div>
        )}

        {viewMode === "week" && <div className="flex flex-1 flex-col gap-1">{renderWeekView()}</div>}

        {viewMode === "month" && (
          <div className="month-view-container flex w-full min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div className="month-view-calendar w-full shrink-0">
              <StrengthMonthCalendar
                selectedDate={selectedDate}
                weekStartsOn={weekStartsOnPref}
                monthWorkouts={scopedMonthStrengthWorkouts}
                onSelect={handleMonthCalendarSelect}
                onMonthChange={(d) => {
                  setSelectedDate(d);
                  setExpandedWeekKey(null);
                  setExpandedMonthDayKey(null);
                }}
              />
            </div>
            <div className="month-view-week-list flex w-full min-w-0 flex-1 flex-col gap-2">{renderMonthView()}</div>
          </div>
        )}
      </div>
    </div>
  );
}
