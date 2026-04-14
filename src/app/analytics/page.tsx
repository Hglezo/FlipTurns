"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useId, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutDropdown } from "@/components/sign-out-dropdown";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPreferences } from "@/lib/preferences";
import { useTranslations } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth-provider";
import { SWIMMER_GROUPS, type SwimmerGroup } from "@/lib/types";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, LogOut, Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  type TooltipPayload,
} from "recharts";
import {
  computeAllGroupsVolumeChartData,
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
import { fetchCoachTeamSwimmers, readCoachTeamSwimmersCache } from "@/lib/coach-team-swimmers-cache";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

const VOLUME_DISPLAY_UNIT_KEY = "flipturns.volumeAnalyticsDisplayUnit";

/**
 * Time for the tallest bar (max target height) to grow from 0 to full value at **constant speed**
 * in plot units (linear motion—no slowdown near the top). Shorter bars finish sooner.
 * Targets can update mid-motion (e.g. fetch returns) without restarting the tween.
 */
const VOL_BAR_GROW_DURATION_MS = 950;

function useSlowApproachPlotValues(plotTargets: number[], resetEpoch: string): number[] {
  const targetsRef = useRef(plotTargets);
  targetsRef.current = plotTargets;

  const [values, setValues] = useState<number[]>(() => plotTargets.map(() => 0));

  useLayoutEffect(() => {
    setValues(Array.from({ length: plotTargets.length }, () => 0));
  }, [resetEpoch, plotTargets.length]);

  useEffect(() => {
    let stopped = false;
    let raf = 0;

    const step = (now: number, last: number) => {
      if (stopped) return;
      const dt = Math.min(48, Math.max(0, now - last));
      const targets = targetsRef.current;
      const maxTarget = targets.reduce((m, x) => Math.max(m, Math.abs(x ?? 0)), 0);
      const speedPerMs = maxTarget > 1e-9 ? maxTarget / VOL_BAR_GROW_DURATION_MS : 0;
      const maxStep = speedPerMs * dt;

      setValues((prev) => {
        if (prev.length !== targets.length) return prev;
        let changed = false;
        const next = prev.map((v, i) => {
          const t = targets[i] ?? 0;
          const diff = t - v;
          if (Math.abs(diff) < 1e-7) return t;
          const mag = Math.min(Math.abs(diff), maxStep);
          const nv = v + Math.sign(diff) * mag;
          const snapped = Math.abs(t - nv) < 1e-6 ? t : nv;
          if (Math.abs(snapped - v) > 1e-7) changed = true;
          return snapped;
        });
        return changed ? next : prev;
      });
      raf = requestAnimationFrame((nextNow) => step(nextNow, now));
    };

    raf = requestAnimationFrame((now) => step(now, now));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [resetEpoch]);

  return values;
}

const K_VOLUME_AXIS_MAX: Record<SwimmerGroup, number> = {
  Sprint: 10,
  "Middle distance": 12.5,
  Distance: 15,
};

/** Y max (thousands) for UI "monthly" chart (`aggregation === "week"`). */
const K_VOLUME_MONTH_CHART_AXIS_MAX: Record<SwimmerGroup, number> = {
  Sprint: 40,
  "Middle distance": 50,
  Distance: 60,
};

const K_VOLUME_UNASSIGNED_MAX = K_VOLUME_AXIS_MAX["Middle distance"];
const K_VOLUME_MONTH_CHART_UNASSIGNED_MAX = K_VOLUME_MONTH_CHART_AXIS_MAX["Middle distance"];

function buildKVolumeAxis(max: number): { domain: [number, number]; ticks: number[] } {
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-6; v += 2.5) {
    ticks.push(Math.round(v * 10) / 10);
  }
  return { domain: [0, max], ticks };
}

function buildMonthChartKVolumeAxis(max: number): { domain: [number, number]; ticks: number[] } {
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-6; v += 10) {
    ticks.push(v);
  }
  return { domain: [0, max], ticks };
}

function kVolumeAxisForSwimmerGroup(
  group: SwimmerGroup | null | undefined,
  aggregation: Aggregation,
) {
  if (aggregation === "week") {
    const max =
      group == null ? K_VOLUME_MONTH_CHART_UNASSIGNED_MAX : K_VOLUME_MONTH_CHART_AXIS_MAX[group];
    return buildMonthChartKVolumeAxis(max);
  }
  const max = group == null ? K_VOLUME_UNASSIGNED_MAX : K_VOLUME_AXIS_MAX[group];
  return buildKVolumeAxis(max);
}

function formatKVolumeYAxisTick(v: number, ticks: number[]): string {
  const best = ticks.reduce((a, t) => (Math.abs(t - v) < Math.abs(a - v) ? t : a), ticks[0]!);
  return Number.isInteger(best) ? String(best) : best.toFixed(1);
}

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
      <text
        x={0}
        y={0}
        dy={10}
        textAnchor="middle"
        className="fill-foreground text-[11px] font-medium"
      >
        {payload.value}
      </text>
      <text
        x={0}
        y={0}
        dy={24}
        textAnchor="middle"
        className={cn(
          "tabular-nums text-[10px] tracking-tight",
          isZero ? "fill-chart-axis/65" : "fill-foreground",
        )}
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
  chartContainerClassName,
  kVolumeAxis,
  chartInstanceId,
  barGrowthResetKey,
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
  chartContainerClassName?: string;
  kVolumeAxis: { domain: [number, number]; ticks: number[] } | null;
  chartInstanceId?: string;
  /** Changes when period / chart identity changes; bars reset and grow again from zero. */
  barGrowthResetKey: string;
}) {
  const barGradientId = `vol-bar-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const seriesBase = useMemo(() => {
    return chartData.map((d, i) => {
      const dayNames = locale === "es-ES"
        ? (weekStartsOn === 1 ? DAY_NAMES_ES_MON : DAY_NAMES_ES_SUN)
        : (weekStartsOn === 1 ? DAY_NAMES_EN_MON : DAY_NAMES_EN_SUN);
      const shortLabel = aggregation === "day" ? dayNames[i] : (locale === "es-ES" ? t("volume.semanaLabel", { n: String(i + 1) }) : t("volume.weekLabel", { n: String(i + 1) }));
      const rawPlot = metersToDisplayDistance(d.meters, displayUnit);
      const finite = Number.isFinite(rawPlot) ? rawPlot : 0;
      const plotValueTarget = kVolumeAxis ? finite / 1000 : finite;
      return { ...d, shortLabel, plotValueTarget };
    });
  }, [chartData, weekStartsOn, locale, aggregation, kVolumeAxis, displayUnit, t]);

  const plotTargets = useMemo(() => seriesBase.map((r) => r.plotValueTarget), [seriesBase]);
  const animatedPlotValues = useSlowApproachPlotValues(plotTargets, barGrowthResetKey);

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

  const chartRows = seriesBase.map((row, i) => ({
    label: row.label,
    meters: row.meters,
    shortLabel: row.shortLabel,
    plotValue: animatedPlotValues[i] ?? 0,
  }));

  return (
    <div className={cn("h-[260px] w-full", chartContainerClassName)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          id={chartInstanceId}
          data={chartRows}
          margin={{ top: 10, right: 4, left: 0, bottom: 32 }}
        >
          <defs>
            <linearGradient id={barGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.45} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeOpacity={0.45}
            strokeDasharray="5 8"
          />
          <XAxis
            dataKey="shortLabel"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "var(--border)", strokeOpacity: 0.55 }}
            tick={(props) => (
              <VolumeAxisTick {...props} displayData={seriesBase} displayUnit={displayUnit} />
            )}
            height={40}
          />
          <YAxis
            type="number"
            width={48}
            domain={kVolumeAxis ? kVolumeAxis.domain : [0, "auto"]}
            ticks={kVolumeAxis ? kVolumeAxis.ticks : undefined}
            interval={kVolumeAxis ? 0 : undefined}
            allowDataOverflow={Boolean(kVolumeAxis)}
            niceTicks={kVolumeAxis ? "none" : undefined}
            tick={{ fontSize: 11, fill: "var(--chart-axis-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)", strokeOpacity: 0.55 }}
            tickFormatter={(v) =>
              kVolumeAxis ? formatKVolumeYAxisTick(Number(v), kVolumeAxis.ticks) : formatVolumeCompact(Number(v))
            }
            allowDecimals
          />
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
          <Bar
            dataKey="plotValue"
            radius={[7, 7, 3, 3]}
            maxBarSize={40}
            isAnimationActive={false}
            activeBar={{
              fill: "var(--chart-2)",
              stroke: "var(--border)",
              strokeWidth: 1,
              opacity: 0.95,
            }}
          >
            {chartRows.map((entry, index) => (
              <Cell
                key={`vol-${entry.label}-${index}`}
                fill={entry.plotValue > 1e-6 ? `url(#${barGradientId})` : "transparent"}
              />
            ))}
          </Bar>
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
  const [volumeLoading, setVolumeLoading] = useState(true);
  const [volumeAggregation, setVolumeAggregation] = useState<Aggregation>("day");
  const [volumeDateOffset, setVolumeDateOffset] = useState(0);
  const [volumeViewMode, setVolumeViewMode] = useState<"swimmer" | "group">("group");
  const [volumeSelectedSwimmerId, setVolumeSelectedSwimmerId] = useState<string | null>(null);
  const [volumeDisplayUnit, setVolumeDisplayUnit] = useState<VolumeDisplayUnit>("meters");
  const [prefs, setPrefsState] = useState<ReturnType<typeof getPreferences>>(getPreferences());
  const [volumeMenuBoundary, setVolumeMenuBoundary] = useState<HTMLElement | null>(null);

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
    if (profile?.role !== "coach" || !user?.id) return;
    const uid = user.id;
    const cached = readCoachTeamSwimmersCache(uid);
    if (cached) setTeamSwimmers(cached);
    void fetchCoachTeamSwimmers(uid)
      .then((rows) => setTeamSwimmers(rows))
      .catch(() => {
        if (!cached) setTeamSwimmers([]);
      });
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
        .eq("is_published", true)
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

  const { coachAllGroupsChart, volumeChartData, volumePeriodTotal } = useMemo(() => {
    const startStr = toLocalDateStr(volumeDateBounds.start);
    const endStr = toLocalDateStr(volumeDateBounds.end);
    const w = volumeLoading ? [] : volumeWorkouts;
    if (!swimmerView && volumeViewMode === "group") {
      const series = computeAllGroupsVolumeChartData(
        w,
        volumeAggregation,
        weekStartsOn,
        startStr,
        endStr,
        SWIMMER_GROUPS,
      );
      const volumePeriodTotal = series.reduce(
        (sum, { chartData }) => sum + chartData.reduce((s, r) => s + r.meters, 0),
        0,
      );
      return { coachAllGroupsChart: series, volumeChartData: [] as { label: string; meters: number }[], volumePeriodTotal };
    }
    const chartData = computeVolumeChartData(
      w,
      teamSwimmers as VolumeSwimmerProfile[],
      swimmerView ? "swimmer" : volumeViewMode,
      swimmerView ? user?.id ?? null : volumeSelectedSwimmerId,
      null,
      volumeAggregation,
      weekStartsOn,
      startStr,
      endStr,
    );
    return {
      coachAllGroupsChart: null as null | ReturnType<typeof computeAllGroupsVolumeChartData>,
      volumeChartData: chartData,
      volumePeriodTotal: chartData.reduce((s, r) => s + r.meters, 0),
    };
  }, [
    volumeWorkouts,
    volumeLoading,
    teamSwimmers,
    swimmerView,
    volumeViewMode,
    user?.id,
    volumeSelectedSwimmerId,
    volumeAggregation,
    weekStartsOn,
    volumeDateBounds,
  ]);

  const singleSwimmerKVolumeAxis = useMemo(() => {
    if (!swimmerView && (volumeViewMode !== "swimmer" || volumeSelectedSwimmerId == null)) return null;
    const group = swimmerView
      ? profile?.swimmer_group ?? null
      : teamSwimmers.find((s) => s.id === volumeSelectedSwimmerId)?.swimmer_group ?? null;
    return kVolumeAxisForSwimmerGroup(group, volumeAggregation);
  }, [
    swimmerView,
    volumeViewMode,
    volumeSelectedSwimmerId,
    profile?.swimmer_group,
    teamSwimmers,
    volumeAggregation,
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
    <div className="min-h-dvh bg-background pt-[env(safe-area-inset-top)]">
      <div ref={setVolumeMenuBoundary} className="app-shell mx-auto flex w-full min-w-0 max-w-md flex-col px-5 pt-5 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-5 lg:max-w-[34rem] lg:px-6">
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-w-0 flex-1 h-9 justify-between gap-1.5 px-3 text-left text-sm font-normal sm:max-w-[min(100%,12rem)]"
                    >
                      <span className="truncate">
                        {volumeViewMode === "group"
                          ? t("settings.groups")
                          : volumeViewMode === "swimmer" && volumeSelectedSwimmerId
                            ? teamSwimmers.find((s) => s.id === volumeSelectedSwimmerId)?.full_name ??
                              volumeSelectedSwimmerId.slice(0, 8)
                            : t("settings.selectSwimmerGroup")}
                      </span>
                      <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="bottom"
                    sideOffset={4}
                    collisionBoundary={volumeMenuBoundary ?? undefined}
                    collisionPadding={{ top: 8, bottom: 12, left: 8, right: 8 }}
                    className="box-border max-h-[min(70dvh,var(--radix-dropdown-menu-content-available-height))] w-max min-w-[var(--radix-popper-anchor-width)] max-w-[min(20rem,var(--radix-popper-available-width,100%))] overflow-x-hidden overflow-y-auto p-1"
                  >
                    <DropdownMenuItem
                      className="pl-3"
                      onSelect={() => {
                        setVolumeViewMode("group");
                        setVolumeSelectedSwimmerId(null);
                      }}
                    >
                      {t("settings.groups")}
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        chevron="down"
                        className="w-full min-w-0 pl-3 pr-2"
                        title={t("volume.personalOpenList")}
                      >
                        {t("group.personal")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        sideOffset={6}
                        collisionBoundary={volumeMenuBoundary ?? undefined}
                        collisionPadding={{ top: 8, bottom: 12, left: 8, right: 8 }}
                        className="box-border max-h-[min(60dvh,var(--radix-dropdown-menu-content-available-height))] w-max min-w-[var(--radix-popper-anchor-width)] max-w-[min(20rem,var(--radix-popper-available-width,100%))] overflow-x-hidden overflow-y-auto p-1"
                      >
                        {teamSwimmers.map((s) => (
                          <DropdownMenuItem
                            key={s.id}
                            className="h-auto min-h-8 min-w-0 max-w-full items-start justify-start whitespace-normal py-2"
                            onSelect={() => {
                              setVolumeViewMode("swimmer");
                              setVolumeSelectedSwimmerId(s.id);
                            }}
                          >
                            <span className="w-full break-words text-left leading-snug">
                              {s.full_name || s.id.slice(0, 8)}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                <span className="min-w-0 flex-1 truncate px-2 text-center text-sm text-chart-axis">
                  {getVolumePeriodLabel(volumeAggregation, volumeDateOffset, weekStartsOn, formatDate, t, locale)}
                </span>
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setVolumeDateOffset((o) => o + 1)} aria-label={t("settings.nextPeriod")}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="min-w-0 w-full">
              {coachAllGroupsChart ? (
                <div className="flex min-w-0 flex-col gap-5">
                  {coachAllGroupsChart.map(({ group, chartData }) => {
                    const groupPeriodMeters = chartData.reduce((s, r) => s + r.meters, 0);
                    return (
                    <div key={group} className="min-w-0 space-y-1.5">
                      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-0">
                        <p className="min-w-0 truncate text-xs font-semibold tracking-wide text-chart-axis">
                          {t(GROUP_KEYS[group])}
                        </p>
                        <span
                          className={cn(
                            "text-right text-sm font-semibold tabular-nums",
                            groupPeriodMeters <= 0 ? "text-chart-axis" : "text-foreground",
                          )}
                          title={t("feedback.volume")}
                        >
                          {formatVolumeCompact(metersToDisplayDistance(groupPeriodMeters, volumeDisplayUnit))}
                        </span>
                      </div>
                      <VolumeChart
                        chartData={chartData}
                        workouts={volumeLoading ? [] : volumeWorkouts}
                        swimmers={teamSwimmers as VolumeSwimmerProfile[]}
                        viewMode="group"
                        selectedSwimmerId={null}
                        selectedGroup={group}
                        aggregation={volumeAggregation}
                        weekStartsOn={weekStartsOn}
                        t={t}
                        formatDate={formatDate}
                        locale={locale}
                        displayUnit={volumeDisplayUnit}
                        chartContainerClassName="h-[200px]"
                        chartInstanceId={`coach-volume-${group.replace(/\s+/g, "-")}`}
                        kVolumeAxis={kVolumeAxisForSwimmerGroup(group, volumeAggregation)}
                        barGrowthResetKey={`${volumeAggregation}-${volumeDateOffset}-${volumeViewMode}-coach-${group}`}
                      />
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="min-w-0 space-y-1.5">
                  {volumePeriodTotal > 0 ? (
                    <div className="flex justify-end">
                      <span
                        className="text-sm font-semibold tabular-nums text-foreground"
                        title={t("feedback.volume")}
                      >
                        {formatVolumeCompact(metersToDisplayDistance(volumePeriodTotal, volumeDisplayUnit))}
                      </span>
                    </div>
                  ) : null}
                  <VolumeChart
                    chartData={volumeChartData}
                    workouts={volumeLoading ? [] : volumeWorkouts}
                    swimmers={teamSwimmers as VolumeSwimmerProfile[]}
                    viewMode={swimmerView ? "swimmer" : volumeViewMode}
                    selectedSwimmerId={swimmerView ? user?.id ?? null : volumeSelectedSwimmerId}
                    selectedGroup={null}
                    aggregation={volumeAggregation}
                    weekStartsOn={weekStartsOn}
                    t={t}
                    formatDate={formatDate}
                    locale={locale}
                    displayUnit={volumeDisplayUnit}
                    chartInstanceId={
                      swimmerView
                        ? "personal-volume"
                        : volumeSelectedSwimmerId
                          ? `coach-volume-swimmer-${volumeSelectedSwimmerId}`
                          : undefined
                    }
                    kVolumeAxis={singleSwimmerKVolumeAxis}
                    barGrowthResetKey={`${volumeAggregation}-${volumeDateOffset}-${volumeViewMode}-${swimmerView ? "swimmer" : volumeSelectedSwimmerId ?? "none"}`}
                  />
                </div>
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
