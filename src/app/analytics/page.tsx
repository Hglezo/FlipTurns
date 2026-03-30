"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SignOutDropdown } from "@/components/sign-out-dropdown";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPreferences } from "@/lib/preferences";
import { useTranslations } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth-provider";
import type { SwimmerGroup } from "@/lib/types";
import { ArrowLeft, ChevronLeft, ChevronRight, LogOut, Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  type TooltipPayload,
} from "recharts";
import {
  computeVolumeChartData,
  formatVolumeCompact,
  getDayVolumeBreakdown,
  getWeekVolumeBreakdown,
  metersToDisplayDistance,
  toLocalDateStr,
  type WorkoutRow,
  type SwimmerProfile as VolumeSwimmerProfile,
  type Aggregation,
  type SwimmerGroup as VolumeSwimmerGroup,
  type VolumeDisplayUnit,
} from "@/lib/volume-analytics";
import { GROUP_KEYS } from "@/lib/i18n";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

const VOLUME_DISPLAY_UNIT_KEY = "flipturns.volumeAnalyticsDisplayUnit";

const SWIMMER_GROUPS: { value: SwimmerGroup; label: string }[] = [
  { value: "Sprint", label: "Sprint" },
  { value: "Middle distance", label: "Middle distance" },
  { value: "Distance", label: "Distance" },
];

function getVolumeDateRange(
  aggregation: Aggregation,
  dateOffset: number,
  weekStartsOn: 0 | 1
): { start: Date; end: Date } {
  const today = new Date();
  if (aggregation === "day") {
    const day = today.getDay();
    const diff = (day - weekStartsOn + 7) % 7;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - diff);
    const start = new Date(weekStart);
    start.setDate(weekStart.getDate() + dateOffset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }
  const d = new Date(today.getFullYear(), today.getMonth() + dateOffset, 1);
  return { start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 0) };
}

function getVolumePeriodLabel(
  aggregation: Aggregation,
  dateOffset: number,
  weekStartsOn: 0 | 1,
  formatDate: (date: Date, type: import("@/lib/i18n").DateFormatType, endDate?: Date) => string,
  t: (key: import("@/lib/i18n").TranslationKey, params?: Record<string, string>) => string,
  locale: string
): string {
  const { start } = getVolumeDateRange(aggregation, dateOffset, weekStartsOn);
  if (aggregation === "day") {
    const weekStart = start;
    const monthCounts: Record<number, number> = {};
    const earliestInMonth: Record<number, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const m = d.getMonth();
      monthCounts[m] = (monthCounts[m] || 0) + 1;
      earliestInMonth[m] = Math.min(earliestInMonth[m] ?? 32, d.getDate());
    }
    const bestMonth = Number(Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0][0]);
    const year = new Date(weekStart.getTime() + 3 * 24 * 60 * 60 * 1000).getFullYear();
    const weekNum = Math.ceil((earliestInMonth[bestMonth] ?? 1) / 7);
    const weekLabel = locale === "es-ES" ? t("volume.semanaLabel", { n: String(weekNum) }) : t("volume.weekLabel", { n: String(weekNum) });
    return `${weekLabel}, ${formatDate(new Date(year, bestMonth, 1), "monthYear")}`;
  }
  return formatDate(start, "monthYear");
}

const DAY_NAMES_EN_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_EN_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_ES_MON = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAY_NAMES_ES_SUN = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

type VolumeBarRow = { label: string; meters: number; shortLabel: string };

function volTotalClass(m: number) {
  return cn("tabular-nums", m <= 0 ? "text-muted-foreground" : "font-medium text-foreground");
}

function sessionTooltipLabel(
  session: string | null | undefined,
  t: (key: import("@/lib/i18n").TranslationKey, params?: Record<string, string>) => string,
): string {
  const tr = session?.trim();
  if (tr === "AM") return t("volume.tooltipSessionAm");
  if (tr === "PM") return t("volume.tooltipSessionPm");
  return t("main.anytime");
}

function VolumeAxisTick({
  x,
  y,
  payload,
  index,
  displayData,
  displayUnit,
}: {
  x: number | string;
  y: number | string;
  payload: { value: string };
  index: number;
  displayData: { shortLabel: string; meters: number }[];
  displayUnit: VolumeDisplayUnit;
}) {
  const row = displayData[index];
  const m = row?.meters ?? 0;
  const plot = metersToDisplayDistance(m, displayUnit);
  const vol = formatVolumeCompact(plot);
  const nx = Number(x);
  const ny = Number(y);
  const isZero = m <= 0;
  return (
    <g transform={`translate(${nx},${ny})`}>
      <text x={0} y={0} dy={10} textAnchor="middle" className="fill-foreground text-[10px]">
        {payload.value}
      </text>
      <text
        x={0}
        y={0}
        dy={22}
        textAnchor="middle"
        className={cn("text-[9px]", isZero ? "fill-muted-foreground" : "fill-foreground")}
      >
        {vol}
      </text>
    </g>
  );
}

function VolumeTooltipContent({
  active,
  payload,
  aggregation,
  workouts,
  viewMode,
  selectedSwimmerId,
  selectedGroup,
  swimmers,
  formatDate,
  t,
  displayUnit,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  aggregation: Aggregation;
  workouts: WorkoutRow[];
  viewMode: "swimmer" | "group";
  selectedSwimmerId: string | null;
  selectedGroup: VolumeSwimmerGroup | null;
  swimmers: VolumeSwimmerProfile[];
  formatDate: (date: Date, type: import("@/lib/i18n").DateFormatType, endDate?: Date) => string;
  t: (key: import("@/lib/i18n").TranslationKey, params?: Record<string, string>) => string;
  displayUnit: VolumeDisplayUnit;
}) {
  if (!active || !payload?.length) return null;
  const pl = payload[0].payload as VolumeBarRow;
  const swimmerProfile =
    viewMode === "swimmer" && selectedSwimmerId
      ? swimmers.find((s) => s.id === selectedSwimmerId) ?? null
      : null;

  const boxClass =
    "max-w-[min(100vw-2rem,18rem)] rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md";

  if (aggregation === "day") {
    const d = new Date(pl.label + "T12:00:00");
    const dateTitle = formatDate(d, "numericDMY");
    const lines = getDayVolumeBreakdown(pl.label, workouts, viewMode, swimmerProfile, selectedGroup);
    return (
      <div className={boxClass}>
        <p className="mb-1.5 font-semibold text-foreground">{dateTitle}</p>
        {lines.length === 0 ? (
          <p className={volTotalClass(pl.meters)}>
            {formatVolumeCompact(metersToDisplayDistance(pl.meters, displayUnit))}
          </p>
        ) : (
          <ul className="space-y-0.5 tabular-nums text-foreground">
            {lines.map((row, i) => (
              <li key={i}>
                {sessionTooltipLabel(row.session, t)}:{" "}
                {formatVolumeCompact(metersToDisplayDistance(row.meters, displayUnit))}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const weekStart = new Date(pl.label + "T12:00:00");
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const title = formatDate(weekStart, "weekOf", weekEnd);
  const byDay = getWeekVolumeBreakdown(pl.label, workouts, viewMode, swimmerProfile, selectedGroup);
  return (
    <div className={boxClass}>
      <p className="mb-1.5 font-semibold text-foreground">{title}</p>
      {byDay.length === 0 ? (
        <p className={volTotalClass(pl.meters)}>
          {formatVolumeCompact(metersToDisplayDistance(pl.meters, displayUnit))}
        </p>
      ) : (
        <div className="space-y-2">
          {byDay.map((day) => (
            <div key={day.dateStr}>
              <p className="text-xs font-medium text-muted-foreground">
                {formatDate(new Date(day.dateStr + "T12:00:00"), "numericDMY")}
              </p>
              <ul className="mt-0.5 space-y-0.5 tabular-nums text-foreground">
                {day.workouts.map((w, i) => (
                  <li key={i}>
                    {sessionTooltipLabel(w.session, t)}:{" "}
                    {formatVolumeCompact(metersToDisplayDistance(w.meters, displayUnit))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VolumeChart({
  chartData,
  workouts,
  swimmers,
  viewMode,
  selectedSwimmerId,
  selectedGroup,
  aggregation,
  weekStartsOn,
  t,
  formatDate,
  locale,
  displayUnit,
}: {
  chartData: { label: string; meters: number }[];
  workouts: WorkoutRow[];
  swimmers: VolumeSwimmerProfile[];
  viewMode: "swimmer" | "group";
  selectedSwimmerId: string | null;
  selectedGroup: VolumeSwimmerGroup | null;
  aggregation: Aggregation;
  weekStartsOn: 0 | 1;
  t: (key: import("@/lib/i18n").TranslationKey, params?: Record<string, string>) => string;
  formatDate: (date: Date, type: import("@/lib/i18n").DateFormatType, endDate?: Date) => string;
  locale: string;
  displayUnit: VolumeDisplayUnit;
}) {
  if (chartData.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {viewMode === "swimmer" && !selectedSwimmerId
          ? t("settings.selectSwimmerGroup")
          : viewMode === "group" && !selectedGroup
            ? t("settings.selectSwimmerGroup")
            : t("settings.noVolumeData")}
      </p>
    );
  }

  const displayData = chartData.map((d, i) => {
    const dayNames = locale === "es-ES"
      ? (weekStartsOn === 1 ? DAY_NAMES_ES_MON : DAY_NAMES_ES_SUN)
      : (weekStartsOn === 1 ? DAY_NAMES_EN_MON : DAY_NAMES_EN_SUN);
    const shortLabel = aggregation === "day" ? dayNames[i] : (locale === "es-ES" ? t("volume.semanaLabel", { n: String(i + 1) }) : t("volume.weekLabel", { n: String(i + 1) }));
    const plotValue = metersToDisplayDistance(d.meters, displayUnit);
    return { ...d, shortLabel, plotValue };
  });

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={displayData} margin={{ top: 8, right: 8, left: 0, bottom: 28 }}>
          <XAxis
            dataKey="shortLabel"
            interval={0}
            tick={(props) => (
              <VolumeAxisTick {...props} displayData={displayData} displayUnit={displayUnit} />
            )}
            height={36}
          />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatVolumeCompact(Number(v))} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.35 }}
            content={(tipProps) => (
              <VolumeTooltipContent
                active={tipProps.active}
                payload={tipProps.payload}
                aggregation={aggregation}
                workouts={workouts}
                viewMode={viewMode}
                selectedSwimmerId={selectedSwimmerId}
                selectedGroup={selectedGroup}
                swimmers={swimmers}
                formatDate={formatDate}
                t={t}
                displayUnit={displayUnit}
              />
            )}
          />
          <Bar dataKey="plotValue" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { t, formatDate, locale } = useTranslations();
  const { user, profile, loading: authLoading } = useAuth();
  const [teamSwimmers, setTeamSwimmers] = useState<{ id: string; full_name: string | null; swimmer_group: SwimmerGroup | null }[]>([]);
  const [volumeWorkouts, setVolumeWorkouts] = useState<WorkoutRow[]>([]);
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [volumeAggregation, setVolumeAggregation] = useState<Aggregation>("day");
  const [volumeDateOffset, setVolumeDateOffset] = useState(0);
  const [volumeViewMode, setVolumeViewMode] = useState<"swimmer" | "group">("group");
  const [volumeSelectedSwimmerId, setVolumeSelectedSwimmerId] = useState<string | null>(null);
  const [volumeSelectedGroup, setVolumeSelectedGroup] = useState<VolumeSwimmerGroup | null>(null);
  const [volumeDisplayUnit, setVolumeDisplayUnit] = useState<VolumeDisplayUnit>("meters");
  const [prefs, setPrefsState] = useState<ReturnType<typeof getPreferences>>(getPreferences());

  useEffect(() => {
    const raw = localStorage.getItem(VOLUME_DISPLAY_UNIT_KEY);
    if (raw === "yards" || raw === "meters") setVolumeDisplayUnit(raw);
  }, []);

  useEffect(() => {
    localStorage.setItem(VOLUME_DISPLAY_UNIT_KEY, volumeDisplayUnit);
  }, [volumeDisplayUnit]);

  useEffect(() => {
    setPrefsState(getPreferences());
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (profile?.role === "swimmer" && user?.id) {
      setTeamSwimmers([{ id: user.id, full_name: profile?.full_name ?? null, swimmer_group: profile?.swimmer_group ?? null }]);
      return;
    }
    if (profile?.role !== "coach") return;
    async function loadSwimmers() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, swimmer_group")
        .eq("role", "swimmer")
        .order("full_name");
      if (!error && data) {
        setTeamSwimmers((data ?? []) as { id: string; full_name: string | null; swimmer_group: SwimmerGroup | null }[]);
      } else {
        setTeamSwimmers([]);
      }
    }
    loadSwimmers();
  }, [profile?.role, profile?.full_name, profile?.swimmer_group, user?.id]);

  useEffect(() => {
    if (!user) return;
    const weekStartsOn = (prefs?.firstDayOfWeek ?? 1) as 0 | 1;
    async function loadWorkouts() {
      setVolumeLoading(true);
      const { start, end } = getVolumeDateRange(volumeAggregation, volumeDateOffset, weekStartsOn);
      const startStr = toLocalDateStr(start);
      const endStr = toLocalDateStr(end);
      const { data, error } = await supabase
        .from("workouts")
        .select("id, date, content, session, assigned_to, assigned_to_group, pool_size")
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date", { ascending: true });
      if (error) {
        setVolumeWorkouts([]);
        setVolumeLoading(false);
        return;
      }
      let rows = (data ?? []) as WorkoutRow[];
      const groupIds = rows.filter((w) => w.assigned_to_group).map((w) => w.id);
      if (groupIds.length > 0) {
        const { data: assigneeData } = await supabase
          .from("workout_assignees")
          .select("workout_id, user_id")
          .in("workout_id", groupIds);
        const assigneesByWorkout = new Map<string, string[]>();
        for (const row of assigneeData ?? []) {
          const list = assigneesByWorkout.get(row.workout_id) ?? [];
          list.push(row.user_id);
          assigneesByWorkout.set(row.workout_id, list);
        }
        rows = rows.map((w) => {
          if (!w.assigned_to_group) return w;
          const ids = assigneesByWorkout.get(w.id);
          return { ...w, assignee_ids: ids ?? [] };
        });
      }
      setVolumeWorkouts(rows);
      setVolumeLoading(false);
    }
    loadWorkouts();
  }, [user, volumeAggregation, volumeDateOffset, prefs?.firstDayOfWeek]);

  const weekStartsOn = (prefs?.firstDayOfWeek ?? 1) as 0 | 1;
  const swimmerView = profile?.role === "swimmer";

  const volumeDateBounds = useMemo(
    () => getVolumeDateRange(volumeAggregation, volumeDateOffset, weekStartsOn),
    [volumeAggregation, volumeDateOffset, weekStartsOn],
  );

  const { volumeChartData, volumePeriodTotal } = useMemo(() => {
    const chartData = computeVolumeChartData(
      volumeWorkouts,
      teamSwimmers as VolumeSwimmerProfile[],
      swimmerView ? "swimmer" : volumeViewMode,
      swimmerView ? user?.id ?? null : volumeSelectedSwimmerId,
      swimmerView ? null : volumeSelectedGroup,
      volumeAggregation,
      weekStartsOn,
      toLocalDateStr(volumeDateBounds.start),
      toLocalDateStr(volumeDateBounds.end),
    );
    return {
      volumeChartData: chartData,
      volumePeriodTotal: chartData.reduce((s, r) => s + r.meters, 0),
    };
  }, [
    volumeWorkouts,
    teamSwimmers,
    swimmerView,
    volumeViewMode,
    user?.id,
    volumeSelectedSwimmerId,
    volumeSelectedGroup,
    volumeAggregation,
    weekStartsOn,
    volumeDateBounds,
  ]);

  if (authLoading || !user) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  const role = profile?.role ?? "swimmer";

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="app-shell mx-auto flex w-full min-w-0 max-w-md flex-col px-5 py-5 lg:max-w-[34rem] lg:px-6">
        {/* Header: back button left, title center, icons right */}
        <div className="mb-5 flex w-full min-w-0 items-center justify-between gap-2">
          <Link href="/">
            <Button variant="ghost" size="icon" className="size-10" aria-label={t("common.back")}>
              <ArrowLeft className="size-5" />
            </Button>
          </Link>
          <h1 className="flex-1 text-center text-lg font-bold truncate min-w-0">{t("settings.volumeAnalytics")}</h1>
          <div className="flex shrink-0 items-center gap-1 justify-end">
            <ThemeToggle />
            {role && user?.id && (
              <NotificationBell
                role={role}
                userId={user.id}
                swimmerGroup={profile?.swimmer_group ?? null}
                swimmers={teamSwimmers}
                onNotificationNavigate={(info) => {
                  const q = new URLSearchParams({ date: info.date });
                  if (info.workoutId) q.set("workout", info.workoutId);
                  router.push(`/?${q.toString()}`);
                }}
              />
            )}
            <Link href="/settings"><Button variant="ghost" size="icon" className="size-9" aria-label="Settings"><Settings className="size-5" /></Button></Link>
            <SignOutDropdown trigger={<Button variant="ghost" size="icon" className="size-9" aria-label="Sign out"><LogOut className="size-5" /></Button>} />
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 overflow-x-hidden min-w-0 pt-6">
            <div className="flex flex-nowrap items-center gap-2 min-w-0">
              {!swimmerView ? (
                <select
                  className="min-w-0 flex-1 sm:w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={
                    volumeViewMode === "group" && volumeSelectedGroup
                      ? `group:${volumeSelectedGroup}`
                      : volumeViewMode === "swimmer" && volumeSelectedSwimmerId
                        ? `swimmer:${volumeSelectedSwimmerId}`
                        : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith("group:")) {
                      const group = v.slice(6) as VolumeSwimmerGroup;
                      setVolumeViewMode("group");
                      setVolumeSelectedGroup(group);
                      setVolumeSelectedSwimmerId(null);
                    } else if (v.startsWith("swimmer:")) {
                      setVolumeViewMode("swimmer");
                      setVolumeSelectedSwimmerId(v.slice(8));
                      setVolumeSelectedGroup(null);
                    }
                  }}
                >
                  <option value="">{t("settings.selectSwimmerGroup")}</option>
                  <optgroup label={t("settings.groups")}>
                    {SWIMMER_GROUPS.map((g) => (
                      <option key={g.value} value={`group:${g.value}`}>
                        {t(GROUP_KEYS[g.value])}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("settings.swimmers")}>
                    {teamSwimmers.map((s) => (
                      <option key={s.id} value={`swimmer:${s.id}`}>
                        {s.full_name || s.id.slice(0, 8)}
                      </option>
                    ))}
                  </optgroup>
                </select>
              ) : null}
              <div className="flex gap-1 items-center shrink-0">
                {(["day", "week"] as const).map((a) => (
                  <Button
                    key={a}
                    variant={volumeAggregation === a ? "default" : "outline"}
                    size="sm"
                    className="whitespace-nowrap"
                    onClick={() => { setVolumeAggregation(a); setVolumeDateOffset(0); }}
                  >
                    {a === "day" ? t("settings.weekly") : t("settings.monthly")}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <div className="flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setVolumeDateOffset((o) => o - 1)} aria-label={t("settings.previousPeriod")}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-0 flex-1 truncate px-2 text-center text-sm text-muted-foreground">
                  {getVolumePeriodLabel(volumeAggregation, volumeDateOffset, weekStartsOn, formatDate, t, locale)}
                </span>
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setVolumeDateOffset((o) => o + 1)} aria-label={t("settings.nextPeriod")}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              {!volumeLoading && volumeChartData.length > 0 && (
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground" title={t("feedback.volume")}>
                  {formatVolumeCompact(metersToDisplayDistance(volumePeriodTotal, volumeDisplayUnit))}
                </span>
              )}
            </div>

            <div className="min-w-0 w-full">
              {volumeLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{t("common.loading")}</p>
              ) : (
                <VolumeChart
                  chartData={volumeChartData}
                  workouts={volumeWorkouts}
                  swimmers={teamSwimmers as VolumeSwimmerProfile[]}
                  viewMode={swimmerView ? "swimmer" : volumeViewMode}
                  selectedSwimmerId={swimmerView ? user?.id ?? null : volumeSelectedSwimmerId}
                  selectedGroup={swimmerView ? null : volumeSelectedGroup}
                  aggregation={volumeAggregation}
                  weekStartsOn={weekStartsOn}
                  t={t}
                  formatDate={formatDate}
                  locale={locale}
                  displayUnit={volumeDisplayUnit}
                />
              )}
              <div className="flex justify-end pt-2">
                <div className="inline-flex rounded-md border border-input bg-muted/30 p-0.5 dark:bg-muted/20">
                  <Button
                    type="button"
                    variant={volumeDisplayUnit === "meters" ? "default" : "ghost"}
                    size="sm"
                    className="h-8 rounded-sm px-3 text-xs"
                    onClick={() => setVolumeDisplayUnit("meters")}
                  >
                    {t("volume.displayMeters")}
                  </Button>
                  <Button
                    type="button"
                    variant={volumeDisplayUnit === "yards" ? "default" : "ghost"}
                    size="sm"
                    className="h-8 rounded-sm px-3 text-xs"
                    onClick={() => setVolumeDisplayUnit("yards")}
                  >
                    {t("volume.displayYards")}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
