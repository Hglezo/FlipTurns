"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Suspense, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import {
  format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isWithinInterval, parseISO,
} from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft, ChevronRight, CalendarIcon, CalendarDays, CalendarRange,
  ChevronDown, ChevronUp, Settings, Plus, Pencil, LogOut, RotateCcw, AlertCircle,
  Camera, ImageUp, Loader2, Users, BarChart3, Printer,
} from "lucide-react";
import { FlipTurnsLogo } from "@/components/flipturns-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkoutAnalysis } from "@/components/workout-analysis";
import { WorkoutContentTextarea } from "@/components/workout-content-textarea";
import { WorkoutAssignPicker } from "@/components/workout-assign-picker";
import { WorkoutTextWithWrapIndent } from "@/components/workout-text-with-wrap-indent";
import { SignOutDropdown } from "@/components/sign-out-dropdown";
import { NotificationBell } from "@/components/notification-bell";
import { usePreferences } from "@/components/preferences-provider";
import { useTranslations } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth-provider";
import type { Workout, SwimmerProfile, ViewMode, SwimmerGroup } from "@/lib/types";
import {
  SWIMMER_GROUPS, ALL_GROUPS_ID, ALL_ID, ONLY_GROUPS_ID, WORKOUT_CATEGORIES, SESSION_OPTIONS, POOL_SIZE_OPTIONS,
  normDate, getTimeframe, PERSONAL_ASSIGNMENT, isTrainingSwimmerGroup,
} from "@/lib/types";
import { getCategoryLabel, getPoolLabel, GROUP_KEYS, type Locale } from "@/lib/i18n";
import {
  loadAndMergeWorkouts, filterWorkoutsForSwimmer, filterWorkoutsForCoachSwimmerSelection, sortCoachWorkouts,
  assignmentLabel, assignedToNames, teammateNames, isViewerInWorkout, dayPreviewLabel, saveAssigneesForGroupWorkout, saveAssigneesForIndividualWorkout,
  assignedToCaptionRedundantForWorkout,
  resolvedGroupAssigneeIdsForSave,
} from "@/lib/workouts";
import { buildWorkoutPrintSections, downloadWorkoutsPdf } from "@/lib/workout-print";
import { cn } from "@/lib/utils";
import { fetchCoachTeamSwimmers, readCoachTeamSwimmersCache } from "@/lib/coach-team-swimmers-cache";

const badgeClass = "inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-accent-blue/15 px-2.5 py-0.5 text-xs font-medium text-accent-blue max-md:text-[10px] max-md:px-1.5";
const badgeClassMuted = "inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground max-md:text-[10px] max-md:px-1.5";
const WORKOUT_SELECT = "id, date, content, session, workout_category, pool_size, assigned_to, assigned_to_group, created_at, updated_at, created_by";

/**
 * Same horizontal bleed as analysis: CardContent is `pl-4` plus larger `pr-*` for icons.
 * Must not combine with `w-full` on the same node — tailwind-merge drops one of the widths.
 */
function swimmerAggregatedNamesRowClass(swimBrowsePr: string): string | undefined {
  if (swimBrowsePr === "pr-20") return "w-[calc(100%+4rem)] max-w-none";
  if (swimBrowsePr === "pr-12") return "w-[calc(100%+2rem)] max-w-none";
  return undefined;
}

/**
 * Reclaim extra right padding so full-width blocks (e.g. analysis) align with ~1rem inset from the card edge,
 * matching the left padding from `pl-4`.
 */
function swimmerAnalysisBleedClass(swimBrowsePr: string): string | undefined {
  if (swimBrowsePr === "pr-20") return "w-[calc(100%+4rem)] max-w-none";
  if (swimBrowsePr === "pr-12") return "w-[calc(100%+2rem)] max-w-none";
  return undefined;
}

function coachAnalysisBleedClass(coachReadPr: string): string | undefined {
  switch (coachReadPr) {
    case "pr-[4.75rem]":
      return "w-[calc(100%+3.75rem)] max-w-none";
    case "pr-20":
      return "w-[calc(100%+4rem)] max-w-none";
    case "pr-[4.5rem]":
      return "w-[calc(100%+3.5rem)] max-w-none";
    case "pr-12":
      return "w-[calc(100%+2rem)] max-w-none";
    default:
      return undefined;
  }
}

function workoutListKey(workout: Workout, index: number): string {
  return workout.id ? String(workout.id) : `idx-${index}`;
}

async function sniffLikelyHeic(blob: Blob): Promise<boolean> {
  if (blob.size < 12) return false;
  const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (String.fromCharCode(b[4], b[5], b[6], b[7]) !== "ftyp") return false;
  const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
  return /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand);
}

async function isJpegOrPngBlob(blob: Blob): Promise<boolean> {
  if (blob.size < 8) return false;
  const b = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  return false;
}

async function blobToWorkoutUploadDataUrl(blob: Blob, maxSide = 2048, quality = 0.85): Promise<string> {
  const drawToJpeg = (img: CanvasImageSource, w: number, h: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  };
  const scale = (w: number, h: number) => {
    if (w <= maxSide && h <= maxSide) return { w, h };
    if (w > h) return { w: maxSide, h: Math.round((h * maxSide) / w) };
    return { w: Math.round((w * maxSide) / h), h: maxSide };
  };
  try {
    const bmp = await createImageBitmap(blob);
    try {
      const { w, h } = scale(bmp.width, bmp.height);
      return drawToJpeg(bmp, w, h);
    } finally {
      bmp.close();
    }
  } catch {
    try {
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = url;
        });
        const { w, h } = scale(img.naturalWidth, img.naturalHeight);
        return drawToJpeg(img, w, h);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      return new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Failed to read image"));
        r.readAsDataURL(blob);
      });
    }
  }
}

function buildSwimmerDayCacheKey(dateKey: string, selectedViewSwimmerId: string | null, userId: string): string {
  if (selectedViewSwimmerId === ALL_ID) return `${dateKey}:${ALL_ID}`;
  if (selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID) return `${dateKey}:${selectedViewSwimmerId}`;
  return `${dateKey}:${selectedViewSwimmerId ?? userId}`;
}

function sortCoachDayFiltered(merged: Workout[], filterId: string | null, swimmers: SwimmerProfile[]) {
  return sortCoachWorkouts(filterWorkoutsForCoachSwimmerSelection(merged, filterId, swimmers), swimmers);
}

async function fetchSwimmerDayRowsForCache(params: {
  dateKey: string;
  userId: string;
  selectedViewSwimmerId: string | null;
  swimmers: SwimmerProfile[];
  swimmerGroup: SwimmerGroup | null;
}): Promise<{ cacheKey: string; rows: Workout[] }> {
  const { dateKey, userId, selectedViewSwimmerId, swimmers, swimmerGroup } = params;
  const isAll = selectedViewSwimmerId === ALL_ID;
  const isOnlyGroups = selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID;
  const filterId = isAll || isOnlyGroups ? selectedViewSwimmerId : (selectedViewSwimmerId ?? userId);
  const filterGroup =
    filterId === userId
      ? swimmerGroup
      : filterId !== ALL_ID && filterId !== ONLY_GROUPS_ID && filterId !== ALL_GROUPS_ID
        ? swimmers.find((s) => s.id === filterId)?.swimmer_group ?? null
        : null;
  const me = filterId ?? userId;
  const cacheKey = buildSwimmerDayCacheKey(dateKey, selectedViewSwimmerId, userId);
  let query = supabase.from("workouts").select(WORKOUT_SELECT).eq("date", dateKey).order("created_at", { ascending: true });
  if (isOnlyGroups) query = query.in("assigned_to_group", SWIMMER_GROUPS);
  const { data } = await query;
  let rows = (data ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey })) as Workout[];
  rows = await loadAndMergeWorkouts(rows, swimmers);
  rows = filterWorkoutsForSwimmer(rows, me, filterGroup ?? null);
  return { cacheKey, rows };
}

/** Collapsed week/month day line: “Name: AM - Aerobic” (assignee/group, timing, type of work). */
function weekDayCollapsedPreviewLabel(
  w: Workout,
  swimmers: SwimmerProfile[],
  previewDefault: string | null | undefined,
  t: (key: import("@/lib/i18n").TranslationKey) => string,
): string {
  const raw = dayPreviewLabel(w, swimmers, previewDefault ?? undefined);
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

function WorkoutBlock({
  workout, dateKey, showLabel, feedbackRefreshKey, onFeedbackChange,
  assigneeLabel, assigneeNames: assigneeNamesStr, teammateNames: teammateNamesStr,
  className = "mt-4", readOnly, compact, t, contentDisplay = "full", aggregatedPdfBelowBanner, onExpandPreview, namesRowClassName, analysisBleedClassName,
  offsetWorkoutBodyForCornerAssignee, workoutBodyCornerOffsetClassName,
}: {
  workout: Workout; dateKey: string; showLabel: boolean; feedbackRefreshKey: number;
  onFeedbackChange?: () => void; assigneeLabel?: string | null; assigneeNames?: string | null;
  teammateNames?: string | null; className?: string; readOnly?: boolean; compact?: boolean;
  contentDisplay?: "full" | "preview";
  /** PDF below chip row (after swap with collapse); collapse lives in card header */
  aggregatedPdfBelowBanner?: {
    show: boolean;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    exportTitle: string;
    exportAria: string;
  };
  /** Day view collapsed preview: tap to expand like the chevron */
  onExpandPreview?: () => void;
  /** Extra classes on the Assigned to / Teammates row (e.g. offset when card has wider right padding for header icons). */
  namesRowClassName?: string;
  /** Widen analysis to the card’s symmetric horizontal inset when CardContent uses extra `pr-*` for icons. */
  analysisBleedClassName?: string;
  /** When assignee/teammate names render in the card’s absolute top-right stack, add top margin on workout text so it clears icons + wrapped names. */
  offsetWorkoutBodyForCornerAssignee?: boolean;
  /** Tighter margin when the corner caption is a single line (day view); defaults to `mt-12`. */
  workoutBodyCornerOffsetClassName?: string;
  t: (key: import("@/lib/i18n").TranslationKey) => string;
}) {
  const { role: viewerProfileRole } = useAuth();
  const feedbackViewerRole = viewerProfileRole === "coach" ? "coach" : "swimmer";
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const sessionLabel = workout.session?.trim() === "AM" || workout.session?.trim() === "PM" ? workout.session.trim() : t("main.anytime");

  const measurePreviewTruncation = useCallback(() => {
    const el = previewBodyRef.current;
    if (!el || contentDisplay !== "preview") {
      setPreviewTruncated(false);
      return;
    }
    setPreviewTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [contentDisplay, workout.content, compact]);

  useLayoutEffect(() => {
    measurePreviewTruncation();
  }, [measurePreviewTruncation]);

  useEffect(() => {
    if (contentDisplay !== "preview") return;
    const el = previewBodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measurePreviewTruncation());
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentDisplay, measurePreviewTruncation]);
  const namesLine = readOnly
    ? (assigneeNamesStr && `${t("main.assignedTo")} ${assigneeNamesStr}`)
    : (teammateNamesStr != null
        ? `${t("main.teammates")}: ${teammateNamesStr}`
        : (assigneeNamesStr && `${t("main.assignedTo")} ${assigneeNamesStr}`));
  return (
    <div className={cn(compact ? "space-y-2" : "space-y-4", "w-full min-w-0")}>
      <div
        className={cn(
          "flex w-full min-w-0 flex-nowrap items-center gap-1.5 max-md:gap-1",
          compact ? "mb-1" : "mb-2",
        )}
      >
        {assigneeLabel && <span className={badgeClass}>{assigneeLabel}</span>}
        <span
          className={cn(
            "inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase max-md:shrink-0 max-md:px-1.5 max-md:text-[10px]",
            sessionLabel === "AM" ? "bg-amber-400/15 text-amber-600 dark:text-amber-400"
              : sessionLabel === "PM" ? "bg-indigo-400/15 text-indigo-600 dark:text-indigo-400"
                : "bg-muted text-muted-foreground",
          )}
        >
          {sessionLabel}
        </span>
        {workout.pool_size && <span className={badgeClassMuted}>{getPoolLabel(workout.pool_size, t)}</span>}
        {workout.workout_category?.trim() && (
          <span className={badgeClassMuted}>{getCategoryLabel(workout.workout_category.trim(), t)}</span>
        )}
      </div>
      {aggregatedPdfBelowBanner?.show && (
        <div className="-mt-1 mb-2 flex justify-start">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 -ml-2"
            title={aggregatedPdfBelowBanner.exportTitle}
            aria-label={aggregatedPdfBelowBanner.exportAria}
            onClick={aggregatedPdfBelowBanner.onClick}
          >
            <Printer className="size-4" />
          </Button>
        </div>
      )}
      {namesLine && (
        <div
          className={cn(
            "mb-2 flex min-w-0 justify-end",
            namesRowClassName ?? "w-full",
          )}
        >
          <p className="min-w-0 max-w-full flex-1 text-right text-xs text-muted-foreground break-words">{namesLine}</p>
        </div>
      )}
      {contentDisplay === "preview" ? (
        <div className="flex min-h-0 w-full flex-col gap-0.5">
          <div
            ref={previewBodyRef}
            className={cn(
              "w-full overflow-hidden font-sans leading-relaxed text-foreground/90",
              compact ? "max-h-[4.27rem] text-[14px]" : "max-h-[4.57rem] text-[15px]",
              offsetWorkoutBodyForCornerAssignee && (workoutBodyCornerOffsetClassName ?? "mt-12"),
              analysisBleedClassName,
            )}
          >
            <WorkoutTextWithWrapIndent content={workout.content} />
          </div>
          {previewTruncated && workout.content.trim() && onExpandPreview && (
            <button
              type="button"
              className="shrink-0 text-left text-[11px] font-normal leading-snug text-muted-foreground/85 hover:text-muted-foreground hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onExpandPreview();
              }}
            >
              {t("main.seeMore")}
            </button>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "w-full min-w-0 font-sans leading-relaxed text-foreground/90",
            compact ? "text-[14px]" : "text-[15px]",
            offsetWorkoutBodyForCornerAssignee && (workoutBodyCornerOffsetClassName ?? "mt-12"),
            analysisBleedClassName,
          )}
        >
          <WorkoutTextWithWrapIndent content={workout.content} />
        </div>
      )}
      {contentDisplay === "full" && (
        <WorkoutAnalysis content={workout.content} date={dateKey} workoutId={workout.id} poolSize={workout.pool_size} refreshKey={feedbackRefreshKey}
          onFeedbackChange={onFeedbackChange} className={cn(className, analysisBleedClassName)} viewerRole={feedbackViewerRole} />
      )}
    </div>
  );
}

/** Day view: corner “Assigned to” / teammates line + measured top margin on workout body (tighter when the caption is one line). */
function DayCardCornerAssigneeStack({
  iconsRow,
  captionLine,
  cardContentClassName,
  renderBody,
}: {
  iconsRow: ReactNode;
  captionLine: string | null;
  cardContentClassName: string;
  renderBody: (args: { offsetWorkoutBodyForCornerAssignee: boolean; workoutBodyCornerOffsetClassName?: string }) => ReactNode;
}) {
  const capRef = useRef<HTMLParagraphElement>(null);
  const [singleLineCaption, setSingleLineCaption] = useState(true);
  const hasCaption = Boolean(captionLine?.length);

  useLayoutEffect(() => {
    const el = capRef.current;
    if (!hasCaption || !el) {
      setSingleLineCaption(true);
      return;
    }
    const run = () => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      const h = Number.isFinite(lh) && lh > 0 ? lh : 16;
      setSingleLineCaption(el.scrollHeight <= h + 4);
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, [captionLine, hasCaption]);

  const marginClass = hasCaption ? (singleLineCaption ? "mt-8" : "mt-12") : undefined;

  return (
    <>
      <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
        {iconsRow}
        {hasCaption && (
          <p ref={capRef} className="max-w-[11rem] break-words text-right text-xs text-muted-foreground">
            {captionLine}
          </p>
        )}
      </div>
      <CardContent className={cardContentClassName}>
        {renderBody({
          offsetWorkoutBodyForCornerAssignee: hasCaption,
          workoutBodyCornerOffsetClassName: marginClass,
        })}
      </CardContent>
    </>
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
        <div className="animate-in slide-in-from-top-2 border-t px-2 py-2 duration-200 space-y-3">
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKOUT_CARD_TOGGLE_IGNORE = "button, a, input, textarea, select, label";

function HomePage() {
  const prefs = usePreferences();
  const { t, formatDate } = useTranslations();
  const weekStartsOn = prefs?.weekStartsOn ?? (1 as 0 | 1);
  const defaultPoolSize = prefs?.preferences?.poolSize ?? "LCM";
  const { user, profile, role, signOut, loading: authLoading } = useAuth();
  const swimmerGroup = profile?.role === "swimmer" ? profile?.swimmer_group : null;
  const router = useRouter();
  const searchParams = useSearchParams();
  const pendingNotificationFocusRef = useRef<{ date: string; workoutId: string | null } | null>(null);
  const appliedUrlQueryRef = useRef<string>("");
  const [notificationFocusNonce, setNotificationFocusNonce] = useState(0);

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
  const [aggregatedDayExpandedWorkoutKey, setAggregatedDayExpandedWorkoutKey] = useState<string | null>(null);
  const aggregatedPreviewTapRef = useRef<{ key: string; x: number; y: number } | null>(null);
  const aggregatedPreviewCardHandlers = useCallback((enabled: boolean, collapsed: boolean, key: string) => {
    if (!enabled) return {};
    return {
      tabIndex: 0 as const,
      onPointerDownCapture(e: PointerEvent<HTMLDivElement>) {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest(WORKOUT_CARD_TOGGLE_IGNORE)) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        aggregatedPreviewTapRef.current = { key, x: e.clientX, y: e.clientY };
      },
      onPointerUpCapture(e: PointerEvent<HTMLDivElement>) {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      },
      onPointerCancelCapture(e: PointerEvent<HTMLDivElement>) {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        if (aggregatedPreviewTapRef.current?.key === key) aggregatedPreviewTapRef.current = null;
      },
      onClick(e: MouseEvent<HTMLDivElement>) {
        if ((e.target as HTMLElement).closest(WORKOUT_CARD_TOGGLE_IGNORE)) return;
        const start = aggregatedPreviewTapRef.current;
        if (start?.key === key) {
          aggregatedPreviewTapRef.current = null;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (dx * dx + dy * dy > 100) return;
        } else if (start) aggregatedPreviewTapRef.current = null;
        setAggregatedDayExpandedWorkoutKey(collapsed ? key : null);
      },
      onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        if (e.key !== "Enter" && e.key !== " ") return;
        if ((e.target as HTMLElement).closest(WORKOUT_CARD_TOGGLE_IGNORE)) return;
        e.preventDefault();
        setAggregatedDayExpandedWorkoutKey(collapsed ? key : null);
      },
    };
  }, []);
  const [feedbackRefreshKey, setFeedbackRefreshKey] = useState(0);
  const [editingWorkoutIndex, setEditingWorkoutIndex] = useState<number | null>(null);
  const [editingWorkoutSnapshot, setEditingWorkoutSnapshot] = useState<Workout | null>(null);
  const [swimmers, setSwimmers] = useState<SwimmerProfile[]>([]);
  const [selectedViewSwimmerId, setSelectedViewSwimmerId] = useState<string | null>(null);
  const [selectedCoachSwimmerId, setSelectedCoachSwimmerId] = useState<string | null>(null);
  const [imageFromWorkoutLoading, setImageFromWorkoutLoading] = useState(false);
  const [imageFromWorkoutError, setImageFromWorkoutError] = useState<string | null>(null);
  const [mainMenuShellBoundary, setMainMenuShellBoundary] = useState<HTMLElement | null>(null);
  const [mainMenuShellWidthPx, setMainMenuShellWidthPx] = useState<number | null>(null);
  const [mainPersonalWorkoutsOpen, setMainPersonalWorkoutsOpen] = useState(false);
  const mainPersonalWorkoutsGroupRef = useRef<HTMLDivElement | null>(null);

  const handlePersonalWorkoutsGroupMouseLeave = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && mainPersonalWorkoutsGroupRef.current?.contains(next)) return;
    setMainPersonalWorkoutsOpen(false);
  }, []);
  /** Set when coach day fetch finishes for `dateKey` so notification deep-link can tell [] vs still loading. */
  const coachDayListReadyForKeyRef = useRef<string | null>(null);
  const addWorkoutForDateRef = useRef<string | null>(null);
  const imageFromWorkoutIdxRef = useRef<number | null>(null);
  const imageCameraInputRef = useRef<HTMLInputElement>(null);
  const imageGalleryInputRef = useRef<HTMLInputElement>(null);
  const swimmerDayCacheRef = useRef<Map<string, Workout[]>>(new Map());
  const coachDayMergedCacheRef = useRef<Map<string, Workout[]>>(new Map());
  /** Cleared when leaving week/month so returning refetches; avoids refetch when only `selectedDate` moves inside same range. */
  const rangeDataKeyRef = useRef<string>("");
  const weekWorkoutsRef = useRef<Workout[]>([]);
  const monthWorkoutsRef = useRef<Workout[]>([]);
  weekWorkoutsRef.current = weekWorkouts;
  monthWorkoutsRef.current = monthWorkouts;

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const isCoach = role === "coach";

  /** Coach range fetch stores the full team week/month; scope to the dropdown selection here so it cannot drift from a stale cache key or in-flight response. */
  const coachScopedWeekWorkouts = useMemo(
    () => (isCoach ? filterWorkoutsForCoachSwimmerSelection(weekWorkouts, selectedCoachSwimmerId, swimmers) : weekWorkouts),
    [isCoach, weekWorkouts, selectedCoachSwimmerId, swimmers],
  );
  const coachScopedMonthWorkouts = useMemo(
    () => (isCoach ? filterWorkoutsForCoachSwimmerSelection(monthWorkouts, selectedCoachSwimmerId, swimmers) : monthWorkouts),
    [isCoach, monthWorkouts, selectedCoachSwimmerId, swimmers],
  );

  const downloadWorkoutPdf = useCallback(
    (workouts: Workout[]) => {
      const locale = (prefs?.preferences?.locale ?? "en-US") as Locale;
      const sections = buildWorkoutPrintSections(workouts, swimmers, t, {
        locale,
        appTitle: t("app.title"),
        brandName: profile?.team_name,
        viewerRole: profile?.role === "coach" ? "coach" : "swimmer",
        viewerTrainingGroup: profile?.role === "swimmer" ? (profile?.swimmer_group ?? null) : null,
      });
      if (sections.length === 0) return;
      const dateSlug = normDate(workouts[0]?.date) ?? dateKey;
      downloadWorkoutsPdf({
        sections,
        filenameBase: `FlipTurns_workout_${dateSlug}`,
      });
    },
    [swimmers, t, dateKey, profile?.role, profile?.team_name, profile?.swimmer_group, prefs?.preferences?.locale],
  );

  useEffect(() => { if (!authLoading && !user) router.push("/login"); }, [authLoading, user, router]);

  useLayoutEffect(() => {
    if (!mainMenuShellBoundary) {
      setMainMenuShellWidthPx(null);
      return;
    }
    const el = mainMenuShellBoundary;
    const update = () => {
      const shellW = el.clientWidth;
      setMainMenuShellWidthPx(Math.max(0, Math.min(shellW, window.innerWidth - 16)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [mainMenuShellBoundary]);

  const handleNotificationDeepLink = useCallback(
    (info: { date: string; workoutId: string | null }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(info.date)) return;
      pendingNotificationFocusRef.current = info;
      setSelectedDate(parseISO(info.date + "T12:00:00"));
      setViewMode("day");
      if (role === "coach") setSelectedCoachSwimmerId(ALL_ID);
      if (role === "swimmer") setSelectedViewSwimmerId(null);
      setNotificationFocusNonce((n) => n + 1);
    },
    [role],
  );

  useEffect(() => {
    if (authLoading || !role) return;
    const sp = new URLSearchParams(searchParams.toString());
    const date = sp.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      appliedUrlQueryRef.current = "";
      return;
    }
    const workoutRaw = sp.get("workout");
    const workoutId = workoutRaw && UUID_RE.test(workoutRaw) ? workoutRaw : null;
    const key = `${date}|${workoutRaw ?? ""}`;
    if (appliedUrlQueryRef.current === key) return;
    appliedUrlQueryRef.current = key;
    pendingNotificationFocusRef.current = { date, workoutId };
    setSelectedDate(parseISO(date + "T12:00:00"));
    setViewMode("day");
    if (role === "coach") setSelectedCoachSwimmerId(ALL_ID);
    if (role === "swimmer") setSelectedViewSwimmerId(null);
    setNotificationFocusNonce((n) => n + 1);
  }, [searchParams, authLoading, role]);

  useLayoutEffect(() => {
    setAggregatedDayExpandedWorkoutKey(null);
  }, [dateKey, selectedCoachSwimmerId, selectedViewSwimmerId, viewMode]);

  useEffect(() => {
    if (role === "swimmer" && selectedViewSwimmerId === ALL_ID) setSelectedViewSwimmerId(null);
  }, [role, selectedViewSwimmerId]);

  useEffect(() => {
    if (viewMode === "day") rangeDataKeyRef.current = "";
  }, [viewMode]);

  useEffect(() => {
    if (!role || !user?.id) return;
    const uid = user.id;
    const cached = readCoachTeamSwimmersCache(uid);
    if (cached) setSwimmers(cached as SwimmerProfile[]);
    let cancelled = false;
    void fetchCoachTeamSwimmers(uid)
      .then((rows) => {
        if (!cancelled) setSwimmers(rows as SwimmerProfile[]);
      })
      .catch(() => {
        if (!cancelled && !cached) setSwimmers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [role, user?.id]);

  const fetchCoachMergedForDate = useCallback(async (d: string): Promise<Workout[] | null> => {
    const { data, error } = await supabase.rpc("get_workouts_for_date", { p_date: d });
    if (error?.message?.includes("function") && error?.message?.includes("does not exist")) {
      const { data: fallback } = await supabase.from("workouts").select(WORKOUT_SELECT).eq("date", d).order("created_at", { ascending: true });
      return await loadAndMergeWorkouts((fallback ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? d })) as Workout[], swimmers);
    }
    if (error) return null;
    return await loadAndMergeWorkouts((data ?? []).map((w: Workout) => ({ ...w, date: normDate(w.date) ?? d })), swimmers);
  }, [swimmers]);

  const coachFilterRef = useRef(selectedCoachSwimmerId);
  coachFilterRef.current = selectedCoachSwimmerId;
  const swimmersForCoachRef = useRef(swimmers);
  swimmersForCoachRef.current = swimmers;
  const editingCoachWorkoutIndexRef = useRef(editingWorkoutIndex);
  editingCoachWorkoutIndexRef.current = editingWorkoutIndex;

  async function refreshCoachWorkouts() {
    const merged = await fetchCoachMergedForDate(dateKey);
    if (merged == null) {
      alert("Could not reload workouts for this day.");
      return;
    }
    coachDayMergedCacheRef.current.set(dateKey, merged);
    setCoachWorkouts(sortCoachDayFiltered(merged, coachFilterRef.current, swimmersForCoachRef.current));
  }

  // Swimmer day fetch
  useEffect(() => {
    if (role !== "swimmer" || viewMode !== "day" || !user) return;
    const userId = user.id;
    const isAll = selectedViewSwimmerId === ALL_ID;
    const isOnlyGroups = selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID;
    const filterId = isAll || isOnlyGroups ? selectedViewSwimmerId : (selectedViewSwimmerId ?? userId);
    const filterGroup = filterId === userId ? swimmerGroup : (filterId !== ALL_ID && filterId !== ONLY_GROUPS_ID && filterId !== ALL_GROUPS_ID) ? swimmers.find((s) => s.id === filterId)?.swimmer_group ?? null : null;
    const me = filterId ?? userId;
    const isMyView = !isAll && !isOnlyGroups && filterId === userId;
    const cacheKey = buildSwimmerDayCacheKey(dateKey, selectedViewSwimmerId, userId);
    const skipCache = addWorkoutForDateRef.current === dateKey;
    const cached = !skipCache ? swimmerDayCacheRef.current.get(cacheKey) : undefined;

    const applyRows = (rows: Workout[]) => {
      setViewWorkouts(rows);
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
    };

    let cancelled = false;

    if (cached) {
      applyRows(cached);
      setSwimmerLoading(false);
    } else {
      const wk = weekWorkoutsRef.current;
      const mo = monthWorkoutsRef.current;
      const inWeek = wk.some((w) => normDate(w.date) === dateKey);
      const primeSource = inWeek ? wk : mo;
      const primeRaw = primeSource.filter((w) => normDate(w.date) === dateKey);
      if (!skipCache && primeRaw.length > 0) {
        const filtered = filterWorkoutsForSwimmer(primeRaw, me, filterGroup ?? null);
        applyRows(filtered);
        setSwimmerLoading(false);
      } else {
        setViewWorkouts([]);
        if (isMyView && !skipCache) setSwimmerWorkouts([]);
        setSwimmerLoading(true);
      }
    }

    (async () => {
      const { cacheKey: ck, rows } = await fetchSwimmerDayRowsForCache({
        dateKey,
        userId,
        selectedViewSwimmerId,
        swimmers,
        swimmerGroup,
      });
      if (cancelled) return;
      swimmerDayCacheRef.current.set(ck, rows);
      applyRows(rows);
      if (!cancelled) setSwimmerLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [dateKey, role, viewMode, user, selectedViewSwimmerId, swimmerGroup, swimmers]);

  useEffect(() => {
    if (role !== "swimmer" || viewMode !== "day" || !user?.id) return;
    let cancelled = false;
    (async () => {
      for (const delta of [-1, 1] as const) {
        const d = format(addDays(parseISO(`${dateKey}T12:00:00`), delta), "yyyy-MM-dd");
        const ck = buildSwimmerDayCacheKey(d, selectedViewSwimmerId, user.id);
        if (swimmerDayCacheRef.current.has(ck)) continue;
        const result = await fetchSwimmerDayRowsForCache({
          dateKey: d,
          userId: user.id,
          selectedViewSwimmerId,
          swimmers,
          swimmerGroup,
        });
        if (cancelled) return;
        swimmerDayCacheRef.current.set(result.cacheKey, result.rows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateKey, role, viewMode, user, selectedViewSwimmerId, swimmerGroup, swimmers]);

  /** So notification deep-link logic sees `coachLoading` before passive effects run (avoids clearing pending while workouts are still the previous day). */
  useLayoutEffect(() => {
    if (!dateKey || !isCoach || viewMode !== "day" || !user) return;
    if (coachDayMergedCacheRef.current.has(dateKey)) setCoachLoading(false);
    else setCoachLoading(true);
  }, [dateKey, isCoach, viewMode, user]);

  useEffect(() => {
    if (!dateKey || !isCoach || viewMode !== "day" || !user) return;
    if (editingCoachWorkoutIndexRef.current !== null) return;
    const merged = coachDayMergedCacheRef.current.get(dateKey);
    if (!merged) return;
    setCoachWorkouts(sortCoachDayFiltered(merged, selectedCoachSwimmerId, swimmers));
  }, [selectedCoachSwimmerId, swimmers, dateKey, isCoach, viewMode, user]);

  // Coach day fetch
  useEffect(() => {
    if (!dateKey || !isCoach || viewMode !== "day" || !user) return;
    const isAddingWorkout = addWorkoutForDateRef.current === dateKey;
    coachDayListReadyForKeyRef.current = null;
    if (!isAddingWorkout) {
      setEditingWorkoutIndex(null);
      setEditingWorkoutSnapshot(null);
      const mergedCached = coachDayMergedCacheRef.current.get(dateKey);
      if (mergedCached) {
        setCoachWorkouts(sortCoachDayFiltered(mergedCached, selectedCoachSwimmerId, swimmers));
        coachDayListReadyForKeyRef.current = dateKey;
        setCoachLoading(false);
      } else {
        setCoachWorkouts([]);
      }
    }
    let cancelled = false;
    (async () => {
      const merged = await fetchCoachMergedForDate(dateKey);
      if (cancelled) return;
      if (merged == null) {
        coachDayListReadyForKeyRef.current = dateKey;
        setCoachLoading(false);
        return;
      }
      coachDayMergedCacheRef.current.set(dateKey, merged);
      const filterId = coachFilterRef.current;
      const sw = swimmersForCoachRef.current;
      const sortedRows = sortCoachDayFiltered(merged, filterId, sw);
      const assigneeForNew = (filterId && filterId !== ALL_ID && filterId !== ONLY_GROUPS_ID) ? filterId : null;
      if (cancelled) return;
      if (isAddingWorkout) {
        addWorkoutForDateRef.current = null;
        const newWorkout = { id: "", date: dateKey, content: "", session: null, workout_category: null, pool_size: null, assigned_to: assigneeForNew, assigned_to_group: null };
        setCoachWorkouts([...sortedRows, newWorkout]);
        setEditingWorkoutIndex(sortedRows.length);
      } else {
        setCoachWorkouts(sortedRows);
      }
      if (!cancelled) {
        coachDayListReadyForKeyRef.current = dateKey;
        setCoachLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateKey, role, viewMode, user, isCoach, swimmers, fetchCoachMergedForDate]);

  useEffect(() => {
    if (!isCoach || viewMode !== "day" || !user?.id) return;
    let cancelled = false;
    (async () => {
      for (const delta of [-1, 1] as const) {
        const d = format(addDays(parseISO(`${dateKey}T12:00:00`), delta), "yyyy-MM-dd");
        if (coachDayMergedCacheRef.current.has(d)) continue;
        const merged = await fetchCoachMergedForDate(d);
        if (cancelled || merged == null) continue;
        coachDayMergedCacheRef.current.set(d, merged);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateKey, isCoach, viewMode, user, fetchCoachMergedForDate]);

  // Week/month range fetch (shared for swimmer and coach)
  useEffect(() => {
    if ((viewMode !== "week" && viewMode !== "month") || !user) {
      setRangeLoading(false);
      return;
    }

    const rangeStart = viewMode === "week" ? startOfWeek(selectedDate, { weekStartsOn }) : startOfMonth(selectedDate);
    const rangeEnd = viewMode === "week" ? endOfWeek(selectedDate, { weekStartsOn }) : endOfMonth(selectedDate);
    const swimmerWeekSelfOnly = role === "swimmer" && viewMode === "week";
    const swimmerFilterId = role === "swimmer" ? (swimmerWeekSelfOnly ? user.id : (selectedViewSwimmerId ?? user.id)) : null;
    const filterId = role === "swimmer" ? swimmerFilterId : selectedCoachSwimmerId;
    const filterGroup = role === "swimmer" && swimmerFilterId === user.id ? swimmerGroup
      : filterId && filterId !== ALL_ID && filterId !== ONLY_GROUPS_ID && filterId !== ALL_GROUPS_ID ? swimmers.find((s) => s.id === filterId)?.swimmer_group ?? null : null;

    const fetchKey = [
      viewMode,
      format(rangeStart, "yyyy-MM-dd"),
      format(rangeEnd, "yyyy-MM-dd"),
      user.id,
      role,
      selectedViewSwimmerId ?? "",
      /* Coach: one range payload for the team; swimmer dropdown is applied in coachScopedWeek/MonthWorkouts. */
      role === "coach" ? "" : (selectedCoachSwimmerId ?? ""),
      swimmerGroup ?? "",
      swimmers.length,
      weekStartsOn,
      swimmerWeekSelfOnly ? "1" : "0",
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
        let query = supabase.from("workouts").select("*")
          .gte("date", format(rangeStart, "yyyy-MM-dd")).lte("date", format(rangeEnd, "yyyy-MM-dd"));
        if (modeAtStart === "week") query = query.order("date", { ascending: true });

        /* Match day view: broad range fetch + client filters (personal/group/assignee rows are not representable as assigned_to.eq alone). */
        if (role === "swimmer") {
          if (selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID) {
            query = query.in("assigned_to_group", SWIMMER_GROUPS);
          }
        }
        /* Coach: always load full team range for the dates; dropdown filtering is client-side (coachScoped*). */

        const { data } = await query;
        if (cancelled) return;
        let rows = await loadAndMergeWorkouts((data ?? []) as Workout[], swimmers);
        if (cancelled) return;
        if (role === "swimmer" && swimmerFilterId) {
          const sf = swimmerWeekSelfOnly ? user.id : (selectedViewSwimmerId ?? user.id);
          const fg = swimmerWeekSelfOnly ? (swimmerGroup ?? null) : (filterGroup ?? null);
          rows = filterWorkoutsForSwimmer(rows, sf, fg);
        }

        if (cancelled) return;
        if (modeAtStart === "week") setWeekWorkouts(rows);
        else setMonthWorkouts(rows);
        rangeDataKeyRef.current = fetchKey;
      } finally {
        if (!cancelled) setRangeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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
        const id = typeof newId === "string" && newId.length > 0 ? newId : null;
        if (!id) {
          alert(
            "Save failed: the server did not return a new workout id. If personal/group saves fail, apply supabase/migrations/20260326120000_personal_assignment.sql on your Supabase project.",
          );
          setLoading(false);
          return;
        }
        savedId = id;
      }
    }

    if (workout.assigned_to_group && savedId) {
      const tf = getTimeframe(workout);
      const otherIds = coachWorkouts.filter((w) => w.id && w.assigned_to_group && w.id !== workout.id && getTimeframe(w) === tf).map((w) => w.id!);
      try {
        await saveAssigneesForGroupWorkout(savedId, resolvedGroupAssigneeIdsForSave(workout, swimmers), otherIds);
      } catch (e) { alert((e && typeof e === "object" && "message" in e) ? String((e as { message: string }).message) : "Failed to save assignees"); setLoading(false); return; }
      for (const w of coachWorkouts) {
        if (!w.assigned_to_group || !w.id || w.id === workout.id) continue;
        const tfW = getTimeframe(w);
        const otherIdsForW = coachWorkouts.filter((x) => x.id && x.assigned_to_group && x.id !== w.id && getTimeframe(x) === tfW).map((x) => x.id!);
        try {
          await saveAssigneesForGroupWorkout(w.id, resolvedGroupAssigneeIdsForSave(w, swimmers), otherIdsForW);
        } catch (e) { alert((e && typeof e === "object" && "message" in e) ? String((e as { message: string }).message) : "Failed to save assignees"); setLoading(false); return; }
      }
    }

    await refreshCoachWorkouts();
    setLoading(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function deleteSingleWorkout(index: number) {
    if (index < 0 || index >= coachWorkouts.length || !confirm("Delete this workout?")) return;
    setLoading(true);
    const workout = coachWorkouts[index];
    if (workout.id) {
      const { error } = await supabase.from("workouts").delete().eq("id", workout.id);
      if (error) { alert(error.message); setLoading(false); return; }
    }
    coachDayMergedCacheRef.current.delete(dateKey);
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

  useLayoutEffect(() => {
    const p = pendingNotificationFocusRef.current;
    if (!p || viewMode !== "day" || p.date !== dateKey) return;
    if (role === "coach") {
      if (coachLoading) return;
      const rowDate = (w: Workout) => normDate(w.date) ?? "";
      if (coachWorkouts.some((w) => rowDate(w) !== dateKey)) return;
      const wid = p.workoutId;
      if (wid) {
        if (coachWorkouts.length === 0) {
          if (coachDayListReadyForKeyRef.current !== dateKey) return;
          pendingNotificationFocusRef.current = null;
          return;
        }
        const match = coachWorkouts.find((w) => String(w.id) === String(wid));
        if (match) {
          const sid = String(match.id);
          setAggregatedDayExpandedWorkoutKey(sid);
          requestAnimationFrame(() => {
            document.getElementById(`workout-notification-focus-${sid}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
      }
      pendingNotificationFocusRef.current = null;
      return;
    }
    if (role === "swimmer") {
      if (swimmerLoading) return;
      if (isSwimmerMyView) {
        pendingNotificationFocusRef.current = null;
        return;
      }
      const wid = p.workoutId;
      if (wid) {
        if (viewWorkouts.length === 0) {
          if (swimmerLoading) return;
          pendingNotificationFocusRef.current = null;
          return;
        }
        const match = viewWorkouts.find((w) => String(w.id) === String(wid));
        if (match) {
          const browseKey = workoutListKey(match, viewWorkouts.findIndex((w) => w.id === match.id));
          setAggregatedDayExpandedWorkoutKey(browseKey);
          requestAnimationFrame(() => {
            document.getElementById(`workout-notification-focus-${String(match.id)}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
      }
      pendingNotificationFocusRef.current = null;
    }
  }, [
    notificationFocusNonce,
    dateKey,
    viewMode,
    role,
    coachLoading,
    coachWorkouts,
    swimmerLoading,
    viewWorkouts,
    isSwimmerMyView,
  ]);

  const coachUsesWorkoutPreviews =
    isCoach &&
    viewMode === "day" &&
    (selectedCoachSwimmerId === ALL_ID || selectedCoachSwimmerId === ONLY_GROUPS_ID || selectedCoachSwimmerId === null) &&
    coachWorkouts.length > 1;

  const swimmerUsesWorkoutPreviews =
    !isCoach &&
    viewMode === "day" &&
    !isSwimmerMyView &&
    (selectedViewSwimmerId === ALL_ID || selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID) &&
    viewWorkouts.length > 1;

  /** My workouts day view: collapse list when 2+ workouts (same idea as coach day aggregated list). */
  const swimmerMyUsesWorkoutPreviews = isSwimmerMyView && swimmerWorkouts.length > 1;

  async function saveSingleWorkoutSwimmer(index: number) {
    if (!dateKey || !user || index < 0 || index >= swimmerWorkouts.length) return;
    const workout = swimmerWorkouts[index];
    setSwimmerEditingIndex(null); setSwimmerEditingSnapshot(null);
    setLoading(true); setSaved(false);
    const poolSizeToSave = workout.pool_size ?? defaultPoolSize ?? null;
    const isPersonal = workout.assigned_to_group === PERSONAL_ASSIGNMENT;
    const assigneeIds = isPersonal
      ? resolvedGroupAssigneeIdsForSave(workout, swimmers)
      : workout.assignee_ids?.length
        ? workout.assignee_ids
        : workout.assigned_to
          ? [workout.assigned_to]
          : [];
    const singleAssignee = !isPersonal && assigneeIds.length === 1 ? assigneeIds[0]! : null;

    const syncPersonalOrGroupAssignees = async (savedId: string): Promise<boolean> => {
      const tf = getTimeframe(workout);
      const otherIds = swimmerWorkouts.filter((w) => w.id && w.assigned_to_group && w.id !== savedId && getTimeframe(w) === tf).map((w) => w.id!);
      try {
        await saveAssigneesForGroupWorkout(savedId, resolvedGroupAssigneeIdsForSave(workout, swimmers), otherIds);
      } catch (e) {
        alert((e && typeof e === "object" && "message" in e) ? String((e as { message: string }).message) : "Failed to save assignees");
        return false;
      }
      for (const w of swimmerWorkouts) {
        if (!w.assigned_to_group || !w.id || w.id === savedId) continue;
        const tfW = getTimeframe(w);
        const otherIdsForW = swimmerWorkouts.filter((x) => x.id && x.assigned_to_group && x.id !== w.id && getTimeframe(x) === tfW).map((x) => x.id!);
        try {
          await saveAssigneesForGroupWorkout(w.id, resolvedGroupAssigneeIdsForSave(w, swimmers), otherIdsForW);
        } catch (e) {
          alert((e && typeof e === "object" && "message" in e) ? String((e as { message: string }).message) : "Failed to save assignees");
          return false;
        }
      }
      return true;
    };

    if (workout.id) {
      const { error } = await supabase.rpc("update_workout_swimmer", {
        p_id: workout.id,
        p_content: workout.content,
        p_session: workout.session || null,
        p_workout_category: workout.workout_category || null,
        p_pool_size: poolSizeToSave,
        p_assigned_to: singleAssignee,
        p_assigned_to_group: isPersonal ? PERSONAL_ASSIGNMENT : null,
      });
      if (error) {
        if (error.message?.includes("function") && error.message?.includes("does not exist")) {
          const { error: updErr } = await supabase.from("workouts").update({
            content: workout.content, session: workout.session || null, workout_category: workout.workout_category,
            pool_size: poolSizeToSave,
            assigned_to: isPersonal ? null : singleAssignee,
            assigned_to_group: isPersonal ? PERSONAL_ASSIGNMENT : null,
            updated_at: new Date().toISOString(),
          }).eq("id", workout.id).eq("created_by", user.id);
          if (updErr) { alert(updErr.message); setLoading(false); return; }
        } else { alert(error.message); setLoading(false); return; }
      }
      if (isPersonal) {
        if (!(await syncPersonalOrGroupAssignees(workout.id))) { setLoading(false); return; }
      } else {
        try {
          await saveAssigneesForIndividualWorkout(workout.id, assigneeIds);
        } catch (e) {
          alert("Failed to save assignees");
          setLoading(false);
          return;
        }
      }
    } else {
      const { data: newId, error } = await supabase.rpc("insert_workout_swimmer", {
        p_date: dateKey,
        p_content: workout.content,
        p_session: workout.session || null,
        p_workout_category: workout.workout_category || null,
        p_pool_size: poolSizeToSave,
        p_assigned_to: singleAssignee,
        p_assigned_to_group: isPersonal ? PERSONAL_ASSIGNMENT : null,
      });
      if (error) {
        if (error.message?.includes("function") && error.message?.includes("does not exist")) {
          const { data: inserted, error: insErr } = await supabase.from("workouts").insert({
            date: dateKey, content: workout.content, session: workout.session || null, workout_category: workout.workout_category,
            pool_size: poolSizeToSave,
            assigned_to: isPersonal ? null : singleAssignee,
            assigned_to_group: isPersonal ? PERSONAL_ASSIGNMENT : null,
            created_by: user.id, updated_at: new Date().toISOString(),
          }).select().single();
          if (insErr) { alert(insErr.message); setLoading(false); return; }
          const sid = inserted.id;
          if (isPersonal) {
            if (!(await syncPersonalOrGroupAssignees(sid))) { setLoading(false); return; }
          } else if (assigneeIds.length > 1) {
            try { await saveAssigneesForIndividualWorkout(sid, assigneeIds); } catch (e) { alert("Failed to save assignees"); setLoading(false); return; }
          }
          setSwimmerWorkouts((prev) => prev.map((w, i) => i === index ? { ...inserted, date: dateKey, assignee_ids: workout.assignee_ids } : w));
        } else { alert(error.message); setLoading(false); return; }
      } else {
        const id = typeof newId === "string" && newId.length > 0 ? newId : null;
        if (!id) {
          alert(
            "Save failed: the server did not return a new workout id. If saving a personal workout, apply supabase/migrations/20260326120000_personal_assignment.sql on your Supabase project (adds Personal to assigned_to_group).",
          );
          setLoading(false);
          return;
        }
        if (isPersonal) {
          if (!(await syncPersonalOrGroupAssignees(id))) { setLoading(false); return; }
        } else if (assigneeIds.length > 1) {
          try { await saveAssigneesForIndividualWorkout(id, assigneeIds); } catch (e) { alert("Failed to save assignees"); setLoading(false); return; }
        }
      }
    }

    await refreshSwimmerWorkouts();
    setLoading(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function refreshSwimmerWorkouts() {
    const { data } = await supabase.from("workouts").select(WORKOUT_SELECT).eq("date", dateKey).order("created_at", { ascending: true });
    let rows = await loadAndMergeWorkouts((data ?? []).map((w) => ({ ...w, date: normDate(w.date) ?? dateKey })) as Workout[], swimmers);
    rows = filterWorkoutsForSwimmer(rows, user?.id ?? "", swimmerGroup);
    if (user?.id) {
      swimmerDayCacheRef.current.set(buildSwimmerDayCacheKey(dateKey, selectedViewSwimmerId, user.id), rows);
    }
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
    setSwimmerWorkouts((prev) => {
      let next = prev.map((w, i) => (i === index ? { ...w, ...updates } : w));
      if (updates.assignee_ids && prev[index]?.assigned_to_group) {
        const addedIds = updates.assignee_ids;
        const currentTf = getTimeframe(prev[index]!);
        next = next.map((w, i) => {
          if (i === index || !w.assigned_to_group || !w.assignee_ids?.length || getTimeframe(w) !== currentTf) {
            return i === index ? next[index] : w;
          }
          return { ...w, assignee_ids: w.assignee_ids.filter((id) => !addedIds.includes(id)) };
        });
      }
      return next;
    });
  }

  function swimmerIdsInTimeframeExcludingSwimmer(workoutIdx: number): Set<string> {
    const w = swimmerWorkouts[workoutIdx];
    const tf = getTimeframe(w);
    const out = new Set<string>();
    swimmerWorkouts.forEach((ow, i) => {
      if (i === workoutIdx || getTimeframe(ow) !== tf) return;
      if (ow.assigned_to && !ow.assigned_to_group) out.add(ow.assigned_to);
      if (ow.assigned_to_group) {
        const ids =
          ow.assigned_to_group === PERSONAL_ASSIGNMENT
            ? (ow.assignee_ids ?? [])
            : ow.assignee_ids?.length
              ? ow.assignee_ids
              : swimmers.filter((s) => s.swimmer_group === ow.assigned_to_group).map((s) => s.id);
        ids.forEach((id) => out.add(id));
      } else {
        (ow.assignee_ids ?? []).forEach((id) => out.add(id));
      }
    });
    return out;
  }

  function pickWorkoutImageSource(source: "camera" | "gallery", idx: number) {
    imageFromWorkoutIdxRef.current = idx;
    (source === "camera" ? imageCameraInputRef : imageGalleryInputRef).current?.click();
  }

  async function handleImageFromWorkout(e: React.ChangeEvent<HTMLInputElement>) {
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

  const getPreviewDefault = () => {
    if (isCoach) {
      if (selectedCoachSwimmerId === ALL_ID) return t("main.allWorkouts");
      if (selectedCoachSwimmerId === ONLY_GROUPS_ID) return t("main.groupWorkouts");
      return selectedCoachSwimmerId ? swimmers.find((s) => s.id === selectedCoachSwimmerId)?.full_name : undefined;
    }
    if (selectedViewSwimmerId === ONLY_GROUPS_ID || selectedViewSwimmerId === ALL_GROUPS_ID) return t("main.groupWorkouts");
    if (!selectedViewSwimmerId || selectedViewSwimmerId === ALL_ID) {
      return profile?.full_name ?? swimmers.find((s) => s.id === user?.id)?.full_name ?? undefined;
    }
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

  const mainMenuShellMaxWidthStyle =
    mainMenuShellWidthPx != null && mainMenuShellWidthPx > 0
      ? { maxWidth: mainMenuShellWidthPx }
      : undefined;

  const previewDefault = getPreviewDefault();

  const imageWorkoutAnalyzing = imageFromWorkoutLoading ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
      {t("main.workoutFromImageAnalyzing")}
    </span>
  ) : null;

  const renderWorkoutBlock = (workout: Workout, dayKey: string, opts: { readOnly?: boolean; compact?: boolean; showLabel?: boolean; excludeIds?: string[]; namesInHeader?: boolean; contentDisplay?: "full" | "preview"; onExpandPreview?: () => void; namesRowClassName?: string; analysisBleedClassName?: string; aggregatedPdfBelowBanner?: { show: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; exportTitle: string; exportAria: string } }) => {
    const rawLabel = assignmentLabel(workout, swimmers);
    const label = rawLabel && GROUP_KEYS[rawLabel] ? t(GROUP_KEYS[rawLabel]) : rawLabel;
    const viewerInWorkout = user?.id ? isViewerInWorkout(workout, user.id, swimmers) : false;
    /** Teammates: only in own schedule view; coaches and every other swimmer context use Assigned to. */
    const showTeammatesForSwimmer = !opts.readOnly && isSwimmerOwnView && viewerInWorkout;
    let assigneeNames =
      opts.namesInHeader && opts.readOnly
        ? undefined
        : opts.readOnly
          ? assignedToNames(workout, swimmers, opts.excludeIds)
          : !showTeammatesForSwimmer
            ? assignedToNames(workout, swimmers, opts.excludeIds)
            : undefined;
    if (assigneeNames && assignedToCaptionRedundantForWorkout(workout, swimmers)) assigneeNames = undefined;
    const teammateNamesProp = showTeammatesForSwimmer ? teammateNames(workout, swimmers, user?.id, opts.excludeIds) : undefined;
    return (
      <WorkoutBlock key={workout.id || dayKey} workout={workout} dateKey={dayKey} showLabel={opts.showLabel ?? true}
        feedbackRefreshKey={feedbackRefreshKey} onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
        className={opts.compact ? "mt-1" : "mt-4"} compact={opts.compact} readOnly={opts.readOnly} assigneeLabel={label}
        assigneeNames={assigneeNames}
        teammateNames={teammateNamesProp}
        contentDisplay={opts.contentDisplay ?? "full"} aggregatedPdfBelowBanner={opts.aggregatedPdfBelowBanner}
        onExpandPreview={opts.onExpandPreview} namesRowClassName={opts.namesRowClassName} analysisBleedClassName={opts.analysisBleedClassName} t={t} />
    );
  };

  const renderWeekView = () => {
    if (rangeLoading && weekWorkouts.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center py-10" aria-busy="true">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      );
    }
    const days = eachDayOfInterval({ start: startOfWeek(selectedDate, { weekStartsOn }), end: endOfWeek(selectedDate, { weekStartsOn }) });
    return days.map((day) => {
      const dayKey = format(day, "yyyy-MM-dd");
      const dayWorkouts = isCoach ? sortCoachWorkouts(coachScopedWeekWorkouts.filter((w) => normDate(w.date) === dayKey), swimmers) : weekWorkouts.filter((w) => normDate(w.date) === dayKey);
      return (
        <ExpandableDay key={day.toISOString()} day={day} dayWorkouts={dayWorkouts}
          isExpanded={expandedDayKey === dayKey} onToggle={() => { setExpandedDayKey(expandedDayKey === dayKey ? null : dayKey); setSelectedDate(day); }}
          previewLabel={(w) => weekDayCollapsedPreviewLabel(w, swimmers, previewDefault, t)}
          t={t} formatDate={formatDate}
          renderWorkouts={() => dayWorkouts.length > 0 ? dayWorkouts.map((w, wi) => {
            const excludeIds = isCoach ? [...new Set(dayWorkouts.filter((x) => x.id !== w.id && getTimeframe(x) === getTimeframe(w)).flatMap((x) => x.assigned_to && !x.assigned_to_group ? [x.assigned_to] : (x.assignee_ids ?? [])))] : undefined;
            const workoutKey = w.id || `${dayKey}-w-${wi}`;
            return (
              <Card key={workoutKey} className="gap-0 rounded-lg py-3 shadow-sm">
                <CardContent className="px-3 py-0">
                  {renderWorkoutBlock(w, dayKey, { readOnly: isCoach, compact: true, showLabel: dayWorkouts.length > 1, excludeIds })}
                </CardContent>
              </Card>
            );
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
    if (rangeLoading && monthWorkouts.length === 0) {
      return (
        <div className="flex justify-center py-10" aria-busy="true">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      );
    }
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
      const weekWorkoutsList = coachScopedMonthWorkouts.filter((w) => isWithinInterval(new Date(w.date + "T12:00:00"), { start, end }));
      const isExpanded = expandedWeekKey === key;
      return (
        <div key={key} className="w-full min-w-0 rounded-lg border bg-card overflow-hidden">
          <button type="button" className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left"
            onClick={() => { setExpandedWeekKey(isExpanded ? null : key); setExpandedMonthDayKey(null); }}>
            <span className="min-w-0 flex-1 text-xs font-medium">{t("settings.week")} {weeks.findIndex((w) => w.key === key) + 1}: {formatDate(start, "weekRange", end)}</span>
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
                            {dayWorkouts.map((w, wi) => <p key={wi}>{weekDayCollapsedPreviewLabel(w, swimmers, previewDefault, t)}</p>)}
                          </div>
                        ) : <p className="text-xs text-muted-foreground">{t("main.noWorkout")}</p>}
                      </div>
                      {isDayExpanded ? <ChevronUp className="size-4 shrink-0 text-muted-foreground ml-2" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground ml-2" />}
                    </button>
                    {isDayExpanded && (
                      <div className="animate-in slide-in-from-top-2 border-t px-2 py-2 duration-200 space-y-3">
                        {dayWorkouts.length > 0 ? (
                          <>
                            {dayWorkouts.map((w, wi) => {
                              const excludeIds = isCoach ? [...new Set(dayWorkouts.filter((x) => x.id !== w.id && getTimeframe(x) === getTimeframe(w)).flatMap((x) => x.assigned_to && !x.assigned_to_group ? [x.assigned_to] : (x.assignee_ids ?? [])))] : undefined;
                              const workoutKey = w.id || `${dayKey}-w-${wi}`;
                              return (
                                <Card key={workoutKey} className="gap-0 rounded-lg py-3 shadow-sm">
                                  <CardContent className="px-3 py-0">
                                    {renderWorkoutBlock(w, dayKey, { readOnly: isCoach, compact: true, showLabel: dayWorkouts.length > 1, excludeIds })}
                                  </CardContent>
                                </Card>
                              );
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
      <div
        ref={setMainMenuShellBoundary}
        className="app-shell mx-auto flex w-full min-w-0 max-w-md flex-col px-5 py-5 lg:max-w-[34rem] lg:px-6"
      >
        {/* Header */}
        <div className="mb-5 flex w-full min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <h1 className="flex shrink-0 items-center gap-1.5 text-lg font-bold"><FlipTurnsLogo className="size-5 shrink-0" size={20} />{t("app.title")}</h1>
            <div className="shrink-0"><ThemeToggle /></div>
            {role === "swimmer" && swimmers.length > 0 ? (
              <div className="min-w-0 flex-1 overflow-hidden">
                <DropdownMenu
                  onOpenChange={(open) => {
                    if (!open) setMainPersonalWorkoutsOpen(false);
                    else if (
                      selectedViewSwimmerId &&
                      selectedViewSwimmerId !== ONLY_GROUPS_ID &&
                      user?.id &&
                      swimmers.some((s) => s.id === selectedViewSwimmerId && s.id !== user.id)
                    ) {
                      setMainPersonalWorkoutsOpen(true);
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-full min-w-0 justify-between gap-1.5 px-2 text-left text-xs font-medium">
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
                    collisionBoundary={mainMenuShellBoundary ?? undefined}
                    collisionPadding={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={mainMenuShellMaxWidthStyle}
                    className="box-border max-h-[calc(100dvh-2.5rem)] w-max min-w-[var(--radix-popper-anchor-width)] overflow-x-hidden overflow-y-auto p-1"
                  >
                    <DropdownMenuItem onSelect={() => setSelectedViewSwimmerId(null)}>
                      {profile?.full_name ?? t("main.myWorkouts")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSelectedViewSwimmerId(ONLY_GROUPS_ID)}>{t("main.groupWorkouts")}</DropdownMenuItem>
                    {swimmers.some((s) => s.id !== user?.id) ? (
                      <DropdownMenuGroup
                        ref={mainPersonalWorkoutsGroupRef}
                        onMouseLeave={handlePersonalWorkoutsGroupMouseLeave}
                      >
                        <DropdownMenuItem
                          className="w-full min-w-0"
                          aria-expanded={mainPersonalWorkoutsOpen}
                          onMouseEnter={() => setMainPersonalWorkoutsOpen(true)}
                          onSelect={(e) => {
                            e.preventDefault();
                            setMainPersonalWorkoutsOpen((o) => !o);
                          }}
                        >
                          <span className="min-w-0 flex-1 text-left">{t("main.personalWorkoutsMenu")}</span>
                          <ChevronDown
                            className={cn(
                              "ml-auto size-4 shrink-0 opacity-50 transition-transform",
                              mainPersonalWorkoutsOpen && "rotate-180",
                            )}
                            aria-hidden
                          />
                        </DropdownMenuItem>
                        {mainPersonalWorkoutsOpen
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
                    if (!open) setMainPersonalWorkoutsOpen(false);
                    else if (
                      selectedCoachSwimmerId &&
                      selectedCoachSwimmerId !== ONLY_GROUPS_ID &&
                      selectedCoachSwimmerId !== ALL_ID
                    ) {
                      setMainPersonalWorkoutsOpen(true);
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-full min-w-0 justify-between gap-1.5 px-2 text-left text-xs font-medium">
                      <span className="truncate">{selectedCoachSwimmerId === ALL_ID ? t("main.allWorkouts") : selectedCoachSwimmerId === ONLY_GROUPS_ID ? t("main.groupWorkouts") : selectedCoachSwimmerId ? swimmers.find((s) => s.id === selectedCoachSwimmerId)?.full_name ?? t("login.swimmer") : t("main.allWorkouts")}</span>
                      <ChevronDown className="size-3.5 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    collisionBoundary={mainMenuShellBoundary ?? undefined}
                    collisionPadding={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={mainMenuShellMaxWidthStyle}
                    className="box-border max-h-[calc(100dvh-2.5rem)] w-max min-w-[var(--radix-popper-anchor-width)] overflow-x-hidden overflow-y-auto p-1"
                  >
                    <DropdownMenuItem onSelect={() => setSelectedCoachSwimmerId(ALL_ID)}>{t("main.allWorkouts")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSelectedCoachSwimmerId(ONLY_GROUPS_ID)}>{t("main.groupWorkouts")}</DropdownMenuItem>
                    <DropdownMenuGroup
                      ref={mainPersonalWorkoutsGroupRef}
                      onMouseLeave={handlePersonalWorkoutsGroupMouseLeave}
                    >
                      <DropdownMenuItem
                        className="w-full min-w-0"
                        aria-expanded={mainPersonalWorkoutsOpen}
                        onMouseEnter={() => setMainPersonalWorkoutsOpen(true)}
                        onSelect={(e) => {
                          e.preventDefault();
                          setMainPersonalWorkoutsOpen((o) => !o);
                        }}
                      >
                        <span className="min-w-0 flex-1 text-left">{t("main.personalWorkoutsMenu")}</span>
                        <ChevronDown
                          className={cn(
                            "ml-auto size-4 shrink-0 opacity-50 transition-transform",
                            mainPersonalWorkoutsOpen && "rotate-180",
                          )}
                          aria-hidden
                        />
                      </DropdownMenuItem>
                      {mainPersonalWorkoutsOpen
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
                <span className="flex h-9 w-full min-w-0 items-center truncate rounded-md border border-input bg-muted/50 px-2 text-xs font-medium capitalize text-muted-foreground">{profile?.full_name ?? role}</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {role && user?.id && (
              <NotificationBell role={role} userId={user.id} swimmerGroup={swimmerGroup ?? null} swimmers={swimmers}
                onNotificationNavigate={handleNotificationDeepLink} />
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
            {swimmerLoading && viewWorkouts.length === 0 ? (
              <div className="flex justify-center py-10" aria-busy="true">
                <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : viewWorkouts.length > 0 ? (
                <div className="space-y-4">
                  {viewWorkouts.map((workout, i) => {
                    const browseKey = workoutListKey(workout, i);
                    const browseCollapsed = swimmerUsesWorkoutPreviews && aggregatedDayExpandedWorkoutKey !== browseKey;
                    const swimBrowsePr =
                      swimmerUsesWorkoutPreviews
                        ? workout.content.trim() ? "pr-20" : "pr-12"
                        : workout.content.trim() ? "pr-12" : "";
                    return (
                      <Card
                        key={workout.id || i}
                        id={workout.id ? `workout-notification-focus-${workout.id}` : undefined}
                        className={cn("relative py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", swimmerUsesWorkoutPreviews && "cursor-pointer")}
                        {...aggregatedPreviewCardHandlers(swimmerUsesWorkoutPreviews, browseCollapsed, browseKey)}
                      >
                        <div className="absolute right-2 top-2 z-10 flex shrink-0 justify-end gap-0.5">
                          {swimmerUsesWorkoutPreviews ? (
                            <>
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
                                    downloadWorkoutPdf([workout]);
                                  }}
                                >
                                  <Printer className="size-4" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAggregatedDayExpandedWorkoutKey(browseCollapsed ? browseKey : null);
                                }}
                                aria-label={browseCollapsed ? t("main.expandWorkout") : t("main.collapseWorkout")}
                              >
                                {browseCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                              </Button>
                            </>
                          ) : (
                            workout.content.trim() && (
                              <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0"
                                title={t("main.exportPdfTitle")} aria-label={t("main.exportPdf")}
                                onClick={(e) => { e.stopPropagation(); downloadWorkoutPdf([workout]); }}>
                                <Printer className="size-4" />
                              </Button>
                            )
                          )}
                        </div>
                        <CardContent className={cn("px-4 py-0", swimBrowsePr)}>
                          {renderWorkoutBlock(workout, dateKey, {
                            compact: false,
                            namesInHeader: true,
                            contentDisplay: browseCollapsed ? "preview" : "full",
                            onExpandPreview:
                              browseCollapsed && workout.content.trim()
                                ? () => setAggregatedDayExpandedWorkoutKey(browseKey)
                                : undefined,
                            namesRowClassName: swimmerAggregatedNamesRowClass(swimBrowsePr),
                            analysisBleedClassName: swimmerAnalysisBleedClass(swimBrowsePr),
                          })}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : <div className="flex flex-1 flex-col items-center justify-center py-12 text-center"><p className="text-muted-foreground">{t("main.noWorkoutForDay")}</p></div>}
          </div>
        )}

        {/* Day view - swimmer editor (my workouts) */}
        {viewMode === "day" && isSwimmerMyView && (
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <input ref={imageCameraInputRef} type="file" accept="image/*,image/heic,image/heif,.heic,.heif" capture="environment" className="hidden" onChange={handleImageFromWorkout} />
            <input ref={imageGalleryInputRef} type="file" accept="image/*,image/heic,image/heif,.heic,.heif" className="hidden" onChange={handleImageFromWorkout} />
              {swimmerLoading && swimmerWorkouts.length === 0 ? (
                <div className="flex justify-center py-10" aria-busy="true">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  {swimmerWorkouts.length > 0 && swimmerWorkouts.map((workout) => {
                    const originalIdx = swimmerWorkouts.indexOf(workout);
                    const canSwimmerEdit = !workout.id || workout.created_by === user?.id;
                    const rawLabel = assignmentLabel(workout, swimmers);
                    const label = rawLabel && GROUP_KEYS[rawLabel as keyof typeof GROUP_KEYS] ? t(GROUP_KEYS[rawLabel as keyof typeof GROUP_KEYS]) : rawLabel;
                    const isEditing = swimmerEditingIndex === originalIdx && canSwimmerEdit;
                    const assigneeIds =
                      workout.assigned_to_group === PERSONAL_ASSIGNMENT
                        ? (workout.assignee_ids ?? [])
                        : workout.assignee_ids?.length
                          ? workout.assignee_ids
                          : workout.assigned_to
                            ? [workout.assigned_to]
                            : [];
                    const conflictIds = swimmerIdsInTimeframeExcludingSwimmer(originalIdx);
                    const viewerInWorkout = user?.id ? isViewerInWorkout(workout, user.id, swimmers) : false;
                    const teammateLine = teammateNames(workout, swimmers, user?.id, Array.from(conflictIds));
                    const assignedLine = !viewerInWorkout ? assignedToNames(workout, swimmers, Array.from(conflictIds)) : null;
                    const swimmerEditShowsFeedback =
                      assigneeIds.length > 0 && assigneeIds.every((id) => id === user?.id);
                    const workoutKey = workoutListKey(workout, originalIdx);
                    const swimmerMyCollapsed = swimmerMyUsesWorkoutPreviews && aggregatedDayExpandedWorkoutKey !== workoutKey;
                    const swimmerDayReadPr = swimmerMyUsesWorkoutPreviews
                      ? swimmerMyCollapsed
                        ? "pr-12"
                        : canSwimmerEdit
                          ? workout.content.trim()
                            ? "pr-[4.75rem]"
                            : "pr-20"
                          : workout.content.trim()
                            ? "pr-[4.75rem]"
                            : "pr-12"
                      : workout.content.trim() && canSwimmerEdit
                        ? "pr-[4.5rem]"
                        : workout.content.trim() || canSwimmerEdit
                          ? "pr-12"
                          : "pr-4";
                    return (
                      <Card
                        key={workout.id || `new-${originalIdx}`}
                        id={workout.id ? `workout-notification-focus-${workout.id}` : undefined}
                        className={cn("relative py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", swimmerMyUsesWorkoutPreviews && !isEditing && "cursor-pointer")}
                        {...aggregatedPreviewCardHandlers(swimmerMyUsesWorkoutPreviews && !isEditing, swimmerMyCollapsed, workoutKey)}
                      >
                        {isEditing ? (
                          <CardContent className="w-full min-w-0 px-4 py-0">
                            <div className="w-full min-w-0 space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <WorkoutAssignPicker
                                  mode="swimmer"
                                  value={
                                    workout.assigned_to_group === PERSONAL_ASSIGNMENT
                                      ? "personal"
                                      : user?.id &&
                                          !workout.assigned_to_group &&
                                          (workout.assigned_to === user.id ||
                                            (assigneeIds.length === 1 && assigneeIds[0] === user.id))
                                        ? `swimmer:${user.id}`
                                        : ""
                                  }
                                  onValueChange={(v) => {
                                    if (v === "personal") {
                                      updateSwimmerWorkout(originalIdx, {
                                        assigned_to: null,
                                        assigned_to_group: PERSONAL_ASSIGNMENT,
                                        assignee_ids: [],
                                      });
                                    } else if (v.startsWith("swimmer:")) {
                                      const id = v.slice(8) || null;
                                      updateSwimmerWorkout(originalIdx, { assigned_to: id, assigned_to_group: null, assignee_ids: id ? [id] : undefined });
                                    } else {
                                      updateSwimmerWorkout(originalIdx, { assigned_to: null, assigned_to_group: null, assignee_ids: undefined });
                                    }
                                  }}
                                  swimmers={swimmers}
                                  t={t}
                                  userId={user?.id}
                                  selfLabel={profile?.full_name ?? swimmers.find((s) => s.id === user?.id)?.full_name ?? null}
                                />
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
                              {(workout.assigned_to_group === PERSONAL_ASSIGNMENT ||
                                (!workout.assigned_to_group && assigneeIds.length > 1)) && (
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
                                              updateSwimmerWorkout(originalIdx, {
                                                assignee_ids: next,
                                                assigned_to:
                                                  workout.assigned_to_group === PERSONAL_ASSIGNMENT
                                                    ? null
                                                    : next.length === 1
                                                      ? next[0]!
                                                      : null,
                                              });
                                            } else if (!hasConflict) {
                                              const next = [...assigneeIds, s.id];
                                              updateSwimmerWorkout(originalIdx, {
                                                assignee_ids: next,
                                                assigned_to:
                                                  workout.assigned_to_group === PERSONAL_ASSIGNMENT
                                                    ? null
                                                    : next.length === 1
                                                      ? next[0]!
                                                      : null,
                                              });
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
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                {imageFromWorkoutLoading ? (
                                  imageWorkoutAnalyzing
                                ) : (
                                  <>
                                    <Button type="button" variant="outline" size="sm" className="gap-2"
                                      onClick={() => pickWorkoutImageSource("camera", originalIdx)}>
                                      <Camera className="size-4" />
                                      {t("main.workoutFromImageTakePicture")}
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="gap-2"
                                      onClick={() => pickWorkoutImageSource("gallery", originalIdx)}>
                                      <ImageUp className="size-4" />
                                      {t("main.workoutFromImageUploadPhoto")}
                                    </Button>
                                  </>
                                )}
                                {imageFromWorkoutError && swimmerEditingIndex === originalIdx && (
                                  <span className="text-sm text-destructive">{imageFromWorkoutError}</span>
                                )}
                              </div>
                              <WorkoutContentTextarea
                                placeholder="Warm-up: 200 free..."
                                value={workout.content}
                                onChange={(next) => updateSwimmerWorkout(originalIdx, { content: next })}
                              />
                              {workout.content && (
                                <WorkoutAnalysis
                                  content={workout.content}
                                  date={dateKey}
                                  workoutId={workout.id || undefined}
                                  poolSize={workout.pool_size}
                                  refreshKey={feedbackRefreshKey}
                                  viewerRole="swimmer"
                                  hideFeedback={!swimmerEditShowsFeedback}
                                  onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                                  className="mt-4 w-full min-w-0"
                                />
                              )}
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
                          <DayCardCornerAssigneeStack
                            iconsRow={(
                              <div
                                className={cn(
                                  "flex shrink-0 items-center gap-0.5",
                                  swimmerMyUsesWorkoutPreviews && !swimmerMyCollapsed && !canSwimmerEdit && workout.content.trim()
                                    ? "w-[4.75rem] justify-between"
                                    : "justify-end",
                                )}
                              >
                                {swimmerMyUsesWorkoutPreviews ? (
                                  <>
                                    {!swimmerMyCollapsed && !canSwimmerEdit && workout.content.trim() && (
                                      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" title={t("main.exportPdfTitle")}
                                        aria-label={t("main.exportPdf")} onClick={(e) => { e.stopPropagation(); downloadWorkoutPdf([workout]); }}>
                                        <Printer className="size-4" />
                                      </Button>
                                    )}
                                    {!swimmerMyCollapsed && canSwimmerEdit && (
                                      <Button variant="ghost" size="icon" className="size-8 shrink-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSwimmerEditingSnapshot(workout ? { ...workout, assignee_ids: workout.assignee_ids ? [...workout.assignee_ids] : undefined } : null);
                                          setSwimmerEditingIndex(originalIdx);
                                        }} aria-label="Edit workout">
                                        <Pencil className="size-4" />
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="size-8 shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAggregatedDayExpandedWorkoutKey(swimmerMyCollapsed ? workoutKey : null);
                                      }}
                                      aria-label={swimmerMyCollapsed ? t("main.expandWorkout") : t("main.collapseWorkout")}
                                    >
                                      {swimmerMyCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    {workout.content.trim() && (
                                      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" title={t("main.exportPdfTitle")}
                                        aria-label={t("main.exportPdf")} onClick={() => downloadWorkoutPdf([workout])}>
                                        <Printer className="size-4" />
                                      </Button>
                                    )}
                                    {canSwimmerEdit && (
                                      <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => { setSwimmerEditingSnapshot(workout ? { ...workout, assignee_ids: workout.assignee_ids ? [...workout.assignee_ids] : undefined } : null); setSwimmerEditingIndex(originalIdx); }} aria-label="Edit workout"><Pencil className="size-4" /></Button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                            captionLine={
                              teammateLine != null
                                ? `${t("main.teammates")}: ${teammateLine}`
                                : assignedLine && !assignedToCaptionRedundantForWorkout(workout, swimmers)
                                  ? `${t("main.assignedTo")} ${assignedLine}`
                                  : null
                            }
                            cardContentClassName={`pl-4 py-0 ${swimmerDayReadPr}`}
                            renderBody={({ offsetWorkoutBodyForCornerAssignee, workoutBodyCornerOffsetClassName }) => (
                              <WorkoutBlock workout={workout} dateKey={dateKey} showLabel={swimmerWorkouts.length > 1} assigneeLabel={label}
                                assigneeNames={undefined}
                                offsetWorkoutBodyForCornerAssignee={offsetWorkoutBodyForCornerAssignee}
                                workoutBodyCornerOffsetClassName={workoutBodyCornerOffsetClassName}
                                feedbackRefreshKey={feedbackRefreshKey} onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)} readOnly
                                contentDisplay={swimmerMyCollapsed ? "preview" : "full"}
                                onExpandPreview={
                                  swimmerMyCollapsed && workout.content.trim()
                                    ? () => setAggregatedDayExpandedWorkoutKey(workoutKey)
                                    : undefined
                                }
                                aggregatedPdfBelowBanner={
                                  swimmerMyUsesWorkoutPreviews &&
                                  canSwimmerEdit &&
                                  workout.content.trim() &&
                                  !swimmerMyCollapsed
                                    ? {
                                        show: true,
                                        onClick: (e) => {
                                          e.stopPropagation();
                                          downloadWorkoutPdf([workout]);
                                        },
                                        exportTitle: t("main.exportPdfTitle"),
                                        exportAria: t("main.exportPdf"),
                                      }
                                    : undefined
                                }
                                analysisBleedClassName={coachAnalysisBleedClass(swimmerDayReadPr)}
                                t={t} />
                            )}
                          />
                        )}
                      </Card>
                    );
                  })}
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" size="icon" onClick={() => {
                      const newWorkout = { id: "", date: dateKey, content: "", session: null, workout_category: null, pool_size: null, assigned_to: user?.id ?? null, assigned_to_group: null };
                      setSwimmerEditingSnapshot(null);
                      setSwimmerWorkouts((prev) => {
                        setSwimmerEditingIndex(prev.length);
                        return [...prev, newWorkout];
                      });
                    }} className="size-10" aria-label="Add workout"><Plus className="size-5" /></Button>
                  </div>
                  {swimmerWorkouts.length === 0 && <p className="text-center text-muted-foreground py-4">{t("main.noWorkoutForDay")}</p>}
                </div>
              )}
          </div>
        )}

        {viewMode === "day" && isCoach && (
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <input ref={imageCameraInputRef} type="file" accept="image/*,image/heic,image/heif,.heic,.heif" capture="environment" className="hidden" onChange={handleImageFromWorkout} />
            <input ref={imageGalleryInputRef} type="file" accept="image/*,image/heic,image/heif,.heic,.heif" className="hidden" onChange={handleImageFromWorkout} />
              {coachLoading && coachWorkouts.length === 0 ? (
                <div className="flex justify-center py-10" aria-busy="true">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  {coachWorkouts.length > 0 && coachWorkouts.map((workout) => {
                    const originalIdx = coachWorkouts.indexOf(workout);
                    const rawLabel = assignmentLabel(workout, swimmers);
                    const label = rawLabel && GROUP_KEYS[rawLabel] ? t(GROUP_KEYS[rawLabel]) : rawLabel;
                    const isEditing = editingWorkoutIndex === originalIdx;
                    const workoutKey = workoutListKey(workout, originalIdx);
                    const coachCollapsed = coachUsesWorkoutPreviews && aggregatedDayExpandedWorkoutKey !== workoutKey;
                    /* Same pr + action strip width collapsed vs expanded so badges / layout don't shift */
                    const coachReadPr = coachUsesWorkoutPreviews
                      ? workout.content.trim() ? "pr-[4.75rem]" : "pr-20"
                      : workout.content.trim() ? "pr-[4.5rem]" : "pr-12";
                    const coachReadAssigneeNames = assignedToNames(workout, swimmers, Array.from(swimmerIdsInTimeframeExcluding(originalIdx)));
                    return (
                      <Card
                        key={workout.id || `new-${originalIdx}`}
                        id={workout.id ? `workout-notification-focus-${workout.id}` : undefined}
                        className={cn("relative py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", coachUsesWorkoutPreviews && !isEditing && "cursor-pointer")}
                        {...aggregatedPreviewCardHandlers(coachUsesWorkoutPreviews && !isEditing, coachCollapsed, workoutKey)}
                      >
                        {isEditing ? (
                          <CardContent className="w-full min-w-0 px-4 py-0">
                            <div className="w-full min-w-0 space-y-2">
                              <div className="flex flex-wrap gap-2">
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
                                        updateCoachWorkout(originalIdx, {
                                          assigned_to: null,
                                          assigned_to_group: PERSONAL_ASSIGNMENT,
                                          assignee_ids: [],
                                        });
                                      } else {
                                        updateCoachWorkout(originalIdx, { assigned_to: null, assigned_to_group: g as SwimmerGroup, assignee_ids: undefined });
                                      }
                                    } else {
                                      updateCoachWorkout(originalIdx, { assigned_to: null, assigned_to_group: null, assignee_ids: undefined });
                                    }
                                  }}
                                  swimmers={swimmers}
                                  t={t}
                                  legacySwimmerId={workout.assigned_to && !workout.assigned_to_group ? workout.assigned_to : null}
                                  legacySwimmerName={
                                    workout.assigned_to && !workout.assigned_to_group
                                      ? swimmers.find((s) => s.id === workout.assigned_to)?.full_name ?? null
                                      : null
                                  }
                                />
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
                                      const defaultGroupIds =
                                        workout.assigned_to_group === PERSONAL_ASSIGNMENT
                                          ? []
                                          : swimmers.filter((s) => s.swimmer_group === workout.assigned_to_group).map((s) => s.id);
                                      setCoachWorkouts((prev) => prev.map((w, i) => {
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
                                      }));
                                    }} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" title={t("coach.resetToDefault")} aria-label={t("coach.resetToDefault")}>
                                      <RotateCcw className="size-3.5" />
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {(() => {
                                      const conflictIds = swimmerIdsInTimeframeExcluding(originalIdx);
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
                                {imageFromWorkoutLoading ? (
                                  imageWorkoutAnalyzing
                                ) : (
                                  <>
                                    <Button type="button" variant="outline" size="sm" className="gap-2"
                                      onClick={() => pickWorkoutImageSource("camera", originalIdx)}>
                                      <Camera className="size-4" />
                                      {t("main.workoutFromImageTakePicture")}
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="gap-2"
                                      onClick={() => pickWorkoutImageSource("gallery", originalIdx)}>
                                      <ImageUp className="size-4" />
                                      {t("main.workoutFromImageUploadPhoto")}
                                    </Button>
                                  </>
                                )}
                                {imageFromWorkoutError && editingWorkoutIndex === originalIdx && (
                                  <span className="text-sm text-destructive">{imageFromWorkoutError}</span>
                                )}
                                {imageFromWorkoutError && editingWorkoutIndex === originalIdx && (
                                  <button type="button" onClick={() => setImageFromWorkoutError(null)} className="text-xs text-muted-foreground hover:underline">Dismiss</button>
                                )}
                              </div>
                              <WorkoutContentTextarea
                                placeholder={"Warm-up: 200 free, 4×50 kick...\nMain set: 8×100 @ 1:30...\nCool-down: 200 easy"}
                                value={workout.content}
                                onChange={(next) => updateCoachWorkout(originalIdx, { content: next })}
                              />
                              {workout.content && (
                                <WorkoutAnalysis
                                  content={workout.content}
                                  date={dateKey}
                                  workoutId={workout.id || undefined}
                                  poolSize={workout.pool_size}
                                  refreshKey={feedbackRefreshKey}
                                  viewerRole="coach"
                                  hideFeedback
                                  onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)}
                                  className="mt-4 w-full min-w-0"
                                />
                              )}
                              <div className="flex gap-2 pt-2">
                                <Button type="button" size="sm" onClick={() => saveSingleWorkout(originalIdx)} disabled={loading || coachLoading}>{saved ? t("main.saved") : t("common.save")}</Button>
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); cancelEditingWorkout(); }} disabled={loading}
                                  className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-50">{t("common.cancel")}</button>
                                <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => deleteSingleWorkout(originalIdx)} disabled={loading}>{t("common.delete")}</Button>
                              </div>
                            </div>
                          </CardContent>
                        ) : (
                          <DayCardCornerAssigneeStack
                            iconsRow={(
                              <div className="flex shrink-0 justify-end gap-0.5">
                                {coachUsesWorkoutPreviews ? (
                                  <>
                                    {coachCollapsed && <span className="size-8 shrink-0" aria-hidden />}
                                    {!coachCollapsed && (
                                      <Button variant="ghost" size="icon" className="size-8 shrink-0"
                                        onClick={(e) => { e.stopPropagation(); startEditingWorkout(originalIdx); }} aria-label="Edit workout">
                                        <Pencil className="size-4" />
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="size-8 shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAggregatedDayExpandedWorkoutKey(coachCollapsed ? workoutKey : null);
                                      }}
                                      aria-label={coachCollapsed ? t("main.expandWorkout") : t("main.collapseWorkout")}
                                    >
                                      {coachCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    {workout.content.trim() && (
                                      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" title={t("main.exportPdfTitle")}
                                        aria-label={t("main.exportPdf")}
                                        onClick={(e) => { e.stopPropagation(); downloadWorkoutPdf([workout]); }}>
                                        <Printer className="size-4" />
                                      </Button>
                                    )}
                                    <Button variant="ghost" size="icon" className="size-8 shrink-0"
                                      onClick={(e) => { e.stopPropagation(); startEditingWorkout(originalIdx); }} aria-label="Edit workout">
                                      <Pencil className="size-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}
                            captionLine={
                              coachReadAssigneeNames && !assignedToCaptionRedundantForWorkout(workout, swimmers)
                                ? `${t("main.assignedTo")} ${coachReadAssigneeNames}`
                                : null
                            }
                            cardContentClassName={cn("pl-4 py-0", coachReadPr)}
                            renderBody={({ offsetWorkoutBodyForCornerAssignee, workoutBodyCornerOffsetClassName }) => (
                              <WorkoutBlock workout={workout} dateKey={dateKey} showLabel={coachWorkouts.length > 1} assigneeLabel={label}
                                assigneeNames={undefined}
                                offsetWorkoutBodyForCornerAssignee={offsetWorkoutBodyForCornerAssignee}
                                workoutBodyCornerOffsetClassName={workoutBodyCornerOffsetClassName}
                                feedbackRefreshKey={feedbackRefreshKey} onFeedbackChange={() => setFeedbackRefreshKey((k) => k + 1)} readOnly
                                contentDisplay={coachCollapsed ? "preview" : "full"}
                                onExpandPreview={
                                  coachCollapsed && workout.content.trim()
                                    ? () => setAggregatedDayExpandedWorkoutKey(workoutKey)
                                    : undefined
                                }
                                aggregatedPdfBelowBanner={
                                  coachUsesWorkoutPreviews && workout.content.trim() && !coachCollapsed
                                    ? {
                                        show: true,
                                        onClick: (e) => {
                                          e.stopPropagation();
                                          downloadWorkoutPdf([workout]);
                                        },
                                        exportTitle: t("main.exportPdfTitle"),
                                        exportAria: t("main.exportPdf"),
                                      }
                                    : undefined
                                }
                                analysisBleedClassName={coachAnalysisBleedClass(coachReadPr)}
                                t={t} />
                            )}
                          />
                        )}
                      </Card>
                    );
                  })}
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" size="icon" onClick={() => {
                      const assigneeForNew = (selectedCoachSwimmerId && selectedCoachSwimmerId !== ALL_ID && selectedCoachSwimmerId !== ONLY_GROUPS_ID) ? selectedCoachSwimmerId : null;
                      const newWorkout = { id: "", date: dateKey, content: "", session: null, workout_category: null, pool_size: null, assigned_to: assigneeForNew, assigned_to_group: null };
                      setEditingWorkoutSnapshot(null);
                      setCoachWorkouts((prev) => {
                        setEditingWorkoutIndex(prev.length);
                        return [...prev, newWorkout];
                      });
                    }} className="size-10" aria-label="Add workout"><Plus className="size-5" /></Button>
                  </div>
                  {coachWorkouts.length === 0 && <p className="text-center text-muted-foreground py-4">{t("main.noWorkoutForDay")}</p>}
                </div>
              )}
          </div>
        )}

        {/* Week view (shared) */}
        {viewMode === "week" && <div className="flex flex-1 flex-col gap-1">{renderWeekView()}</div>}

        {/* Month view (shared) */}
        {viewMode === "month" && (
          <div className="month-view-container flex w-full min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div className="month-view-calendar w-full shrink-0">
              <MonthCalendar selectedDate={selectedDate} weekStartsOn={weekStartsOn} monthWorkouts={coachScopedMonthWorkouts}
                onSelect={handleMonthCalendarSelect} onMonthChange={(d) => { setSelectedDate(d); setExpandedWeekKey(null); setExpandedMonthDayKey(null); }} />
            </div>
            <div className="month-view-week-list flex w-full min-w-0 flex-1 flex-col gap-2">{renderMonthView()}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <HomePage />
    </Suspense>
  );
}
