"use client";

import { useState, useEffect } from "react";
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
} from "recharts";
import {
  computeSwimmerVolumes,
  computeGroupVolumes,
  aggregateByPeriod,
  fillPeriodsInRange,
  toLocalDateStr,
  type WorkoutRow,
  type SwimmerProfile as VolumeSwimmerProfile,
  type Aggregation,
  type SwimmerGroup as VolumeSwimmerGroup,
} from "@/lib/volume-analytics";
import { GROUP_KEYS } from "@/lib/i18n";
import { NotificationBell } from "@/components/notification-bell";

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

function VolumeChart({
  workouts,
  swimmers,
  viewMode,
  selectedSwimmerId,
  selectedGroup,
  aggregation,
  weekStartsOn,
  dateRangeStart,
  dateRangeEnd,
  t,
  formatDate,
  locale,
}: {
  workouts: WorkoutRow[];
  swimmers: VolumeSwimmerProfile[];
  viewMode: "swimmer" | "group";
  selectedSwimmerId: string | null;
  selectedGroup: VolumeSwimmerGroup | null;
  aggregation: Aggregation;
  weekStartsOn: 0 | 1;
  dateRangeStart: string;
  dateRangeEnd: string;
  t: (key: import("@/lib/i18n").TranslationKey, params?: Record<string, string>) => string;
  formatDate: (date: Date, type: import("@/lib/i18n").DateFormatType, endDate?: Date) => string;
  locale: string;
}) {
  let chartData: { label: string; meters: number; name?: string }[] = [];
  if (viewMode === "swimmer" && selectedSwimmerId) {
    const volByDate = computeSwimmerVolumes(workouts, swimmers).get(selectedSwimmerId);
    chartData = fillPeriodsInRange(
      volByDate ? aggregateByPeriod(volByDate, aggregation, weekStartsOn) : [],
      dateRangeStart,
      dateRangeEnd,
      aggregation,
      weekStartsOn
    );
  } else if (viewMode === "group" && selectedGroup) {
    const volByDate = computeGroupVolumes(workouts).get(selectedGroup);
    chartData = fillPeriodsInRange(
      volByDate ? aggregateByPeriod(volByDate, aggregation, weekStartsOn) : [],
      dateRangeStart,
      dateRangeEnd,
      aggregation,
      weekStartsOn
    );
  }

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
    return { ...d, shortLabel };
  });

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={displayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="shortLabel" tick={{ fontSize: 10 }} interval={0} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `${(Number(v) / 1000).toFixed(1)}k`} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              color: "var(--popover-foreground)",
            }}
            labelStyle={{
              color: "var(--foreground)",
              fontWeight: 600,
              marginBottom: 6,
            }}
            itemStyle={{ color: "var(--popover-foreground)" }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => [`${Number(v ?? 0).toLocaleString()} m`, t("settings.meters")]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            labelFormatter={(_: any, payload: any) => {
              const label = payload?.[0]?.payload?.label ?? "";
              if (aggregation === "week" && label) {
                const start = new Date(label + "T12:00:00");
                const end = new Date(start);
                end.setDate(start.getDate() + 6);
                return formatDate(start, "weekOf", end);
              }
              return label;
            }}
          />
          <Bar dataKey="meters" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
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
  const [prefs, setPrefsState] = useState<ReturnType<typeof getPreferences>>(getPreferences());

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
        .select("id, date, content, assigned_to, assigned_to_group, pool_size")
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
      <div className="mx-auto flex max-w-md flex-col px-5 py-5 w-full min-w-0">
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
            <div className="w-full flex justify-center">
                <div className="flex gap-1 items-center min-w-0 overflow-hidden">
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setVolumeDateOffset((o) => o - 1)} aria-label={t("settings.previousPeriod")}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-sm text-muted-foreground truncate min-w-0 flex-1 text-center px-2">
                  {getVolumePeriodLabel(volumeAggregation, volumeDateOffset, weekStartsOn, formatDate, t, locale)}
                </span>
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setVolumeDateOffset((o) => o + 1)} aria-label={t("settings.nextPeriod")}>
                  <ChevronRight className="size-4" />
                </Button>
                </div>
              </div>

            {volumeLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">{t("common.loading")}</p>
            ) : (() => {
              const { start, end } = getVolumeDateRange(volumeAggregation, volumeDateOffset, weekStartsOn);
              return (
                <VolumeChart
                  workouts={volumeWorkouts}
                  swimmers={teamSwimmers as VolumeSwimmerProfile[]}
                  viewMode={swimmerView ? "swimmer" : volumeViewMode}
                  selectedSwimmerId={swimmerView ? user?.id ?? null : volumeSelectedSwimmerId}
                  selectedGroup={swimmerView ? null : volumeSelectedGroup}
                  aggregation={volumeAggregation}
                  weekStartsOn={weekStartsOn}
                  dateRangeStart={toLocalDateStr(start)}
                  dateRangeEnd={toLocalDateStr(end)}
                  t={t}
                  formatDate={formatDate}
                  locale={locale}
                />
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
