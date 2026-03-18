"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutDropdown } from "@/components/sign-out-dropdown";
import {
  getPreferences,
  savePreferences,
  DEFAULT_PREFERENCES,
  type Preferences,
  type PoolSize,
  type FirstDayOfWeek,
} from "@/lib/preferences";
import { LOCALES, GROUP_KEYS, getPoolLabel, type Locale } from "@/lib/i18n";
import { useTranslations } from "@/components/i18n-provider";
import { usePreferences } from "@/components/preferences-provider";
import { useAuth } from "@/components/auth-provider";
import type { SwimmerGroup } from "@/lib/types";
import { ArrowLeft, Waves, Trash2, KeyRound, LogOut, Users, BarChart3, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  type WorkoutRow,
  type SwimmerProfile as VolumeSwimmerProfile,
  type Aggregation,
  type SwimmerGroup as VolumeSwimmerGroup,
} from "@/lib/volume-analytics";

const POOL_OPTIONS: { value: PoolSize; label: string }[] = [
  { value: "LCM", label: "LCM" },
  { value: "SCM", label: "SCM" },
  { value: "SCY", label: "SCY" },
];

const WEEK_OPTIONS: { value: FirstDayOfWeek; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 0, label: "Sunday" },
];

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

export default function SettingsPage() {
  const router = useRouter();
  const { t, formatDate, locale } = useTranslations();
  const prefsContext = usePreferences();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [prefs, setPrefsState] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState(false);

  // Change password state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Delete account state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [teamSwimmers, setTeamSwimmers] = useState<{ id: string; full_name: string | null; swimmer_group: SwimmerGroup | null }[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [updatingSwimmerId, setUpdatingSwimmerId] = useState<string | null>(null);
  const [deleteSwimmerTargetId, setDeleteSwimmerTargetId] = useState<string | null>(null);
  const [deleteSwimmerLoading, setDeleteSwimmerLoading] = useState(false);
  const [deleteSwimmerError, setDeleteSwimmerError] = useState("");

  const [volumeWorkouts, setVolumeWorkouts] = useState<WorkoutRow[]>([]);
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [volumeAggregation, setVolumeAggregation] = useState<Aggregation>("day");
  const [volumeDateOffset, setVolumeDateOffset] = useState(0);
  const [volumeViewMode, setVolumeViewMode] = useState<"swimmer" | "group">("group");
  const [volumeSelectedSwimmerId, setVolumeSelectedSwimmerId] = useState<string | null>(null);
  const [volumeSelectedGroup, setVolumeSelectedGroup] = useState<VolumeSwimmerGroup | null>(null);

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
      setTeamLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, swimmer_group")
        .eq("role", "swimmer")
        .order("full_name");
      if (error) {
        setTeamError(error.message);
        setTeamSwimmers([]);
      } else {
        setTeamError("");
        setTeamSwimmers((data ?? []) as { id: string; full_name: string | null; swimmer_group: SwimmerGroup | null }[]);
      }
      setTeamLoading(false);
    }
    loadSwimmers();
  }, [profile?.role, profile?.full_name, profile?.swimmer_group, user?.id]);

  useEffect(() => {
    if (!user) return;
    const weekStartsOn = (prefs?.firstDayOfWeek ?? 1) as 0 | 1;
    async function loadWorkouts() {
      setVolumeLoading(true);
      const { start, end } = getVolumeDateRange(volumeAggregation, volumeDateOffset, weekStartsOn);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
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

  const handleSavePrefs = (updates: Partial<Preferences>) => {
    const next = savePreferences(updates);
    setPrefsState(next);
    prefsContext?.setPreferences(updates);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to update password"
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== "delete") return;

    setDeleteLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        setDeleteError("You must be signed in to delete your account");
        return;
      }

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete account");
      }

      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete account"
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    if (!open) {
      setDeleteConfirmText("");
      setDeleteError("");
    }
    setShowDeleteDialog(open);
  };

  const canDelete = deleteConfirmText.toLowerCase() === "delete";

  const weekStartsOn = (prefs?.firstDayOfWeek ?? 1) as 0 | 1;
  const isCoach = profile?.role === "coach";

  const handleCoachSetGroup = async (swimmerId: string, group: SwimmerGroup | null) => {
    setUpdatingSwimmerId(swimmerId);
    setTeamError("");
    const { data, error } = await supabase
      .from("profiles")
      .update({ swimmer_group: group })
      .eq("id", swimmerId)
      .select("id");
    if (error) {
      setTeamError(error.message);
    } else if (!data?.length) {
      setTeamError("Could not save. Run the coach migration (see setup page).");
    } else {
      setTeamSwimmers((prev) =>
        prev.map((s) => (s.id === swimmerId ? { ...s, swimmer_group: group } : s))
      );
    }
    setUpdatingSwimmerId(null);
  };

  const handleDeleteSwimmerAccount = async () => {
    if (!deleteSwimmerTargetId || !user) return;
    setDeleteSwimmerLoading(true);
    setDeleteSwimmerError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setDeleteSwimmerError("Not signed in");
        return;
      }
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId: deleteSwimmerTargetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteSwimmerError(data.error ?? "Failed to delete account");
        return;
      }
      setTeamSwimmers((prev) => prev.filter((s) => s.id !== deleteSwimmerTargetId));
      setDeleteSwimmerTargetId(null);
    } catch (e) {
      setDeleteSwimmerError(e instanceof Error ? e.message : "Failed to delete account");
    } finally {
      setDeleteSwimmerLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-md flex-col px-5 pb-8 pt-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="size-10" aria-label={t("common.back")}>
              <ArrowLeft className="size-5" />
            </Button>
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Waves className="size-6 text-primary" />
            {t("common.settings")}
          </h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SignOutDropdown
            trigger={
              <Button variant="ghost" size="icon" className="size-9" aria-label={t("common.signOut")}>
                <LogOut className="size-5" />
              </Button>
            }
            />
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("settings.profile")}</CardTitle>
              <CardAction>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("settings.editProfile")}
                  onClick={() => {
                    setEditName(profile?.full_name ?? user?.user_metadata?.full_name ?? "");
                    setEditEmail(user?.email ?? "");
                    setShowProfileForm(true);
                    setProfileError("");
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              {showProfileForm ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!user) return;
                    setProfileSaving(true);
                    setProfileError("");
                    const nameTrimmed = editName.trim() || null;
                    const { error: profileErr } = await supabase.from("profiles").update({ full_name: nameTrimmed }).eq("id", user.id);
                    if (profileErr) {
                      setProfileError(profileErr.message);
                      setProfileSaving(false);
                      return;
                    }
                    const newEmail = editEmail.trim();
                    if (newEmail && newEmail !== user.email) {
                      const { error: emailErr } = await supabase.auth.updateUser({ email: newEmail });
                      if (emailErr) {
                        setProfileError(emailErr.message);
                        setProfileSaving(false);
                        return;
                      }
                    }
                    await refreshProfile();
                    setShowProfileForm(false);
                    setProfileSaving(false);
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">{t("settings.name")}</Label>
                    <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t("settings.namePlaceholder")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-email">{t("settings.email")}</Label>
                    <Input id="edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder={t("settings.emailPlaceholder")} />
                  </div>
                  {profileError && <p className="text-sm text-destructive">{profileError}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={profileSaving}>{profileSaving ? t("settings.saving") : t("common.save")}</Button>
                    <Button type="button" variant="outline" onClick={() => { setShowProfileForm(false); setProfileError(""); }} disabled={profileSaving}>{t("common.cancel")}</Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>{t("settings.name")}</Label>
                    <p className="text-sm text-foreground">{profile?.full_name ?? user?.user_metadata?.full_name ?? "—"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.email")}</Label>
                    <p className="text-sm text-foreground">{user?.email ?? "—"}</p>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>{t("settings.memberSince")}</Label>
                <p className="text-sm text-muted-foreground">
                  {profile?.created_at
                    ? formatDate(new Date(profile.created_at), "memberSince")
                    : "—"}
                </p>
              </div>
              {profile?.role === "swimmer" && (
                <div className="space-y-2">
                  <Label>{t("settings.group")}</Label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user) return;
                        setGroupSaving(true);
                        setGroupError("");
                        const { error } = await supabase
                          .from("profiles")
                          .update({ swimmer_group: null })
                          .eq("id", user.id);
                        if (!error) {
                          await refreshProfile();
                        } else {
                          setGroupError(error.message);
                        }
                        setGroupSaving(false);
                      }}
                      className={`rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50 disabled:pointer-events-none ${!profile?.swimmer_group ? "border-primary bg-primary/10 hover:bg-primary/20" : "border-input bg-background hover:bg-accent"}`}
                      disabled={groupSaving}
                    >
                      {t("group.notSet")}
                    </button>
                    {SWIMMER_GROUPS.map((g) => (
                      <button
                        key={g.value}
                        type="button"
                        onClick={async () => {
                          if (!user) return;
                          setGroupSaving(true);
                          setGroupError("");
                          const { error } = await supabase
                            .from("profiles")
                            .update({ swimmer_group: g.value })
                            .eq("id", user.id);
                          if (!error) {
                            await refreshProfile();
                          } else {
                            setGroupError(error.message);
                          }
                          setGroupSaving(false);
                        }}
                        className={`rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50 disabled:pointer-events-none ${profile?.swimmer_group === g.value ? "border-primary bg-primary/10 hover:bg-primary/20" : "border-input bg-background hover:bg-accent"}`}
                        disabled={groupSaving}
                      >
                        {t(GROUP_KEYS[g.value])}
                      </button>
                    ))}
                  </div>
                  {groupError && <p className="text-sm text-destructive">{groupError}</p>}
                  <p className="text-xs text-muted-foreground">
                    {t("settings.coachesAssignGroup")}
                  </p>
                </div>
              )}
              <div className="border-t pt-4 space-y-3">
                {showPasswordForm ? (
                  <form
                    onSubmit={handleChangePassword}
                    className="space-y-3"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={6}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        minLength={6}
                        autoComplete="new-password"
                      />
                    </div>
                    {passwordError && (
                      <p className="text-sm text-destructive">{passwordError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        disabled={passwordLoading}
                      >
                        {passwordLoading ? "Updating…" : "Update password"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowPasswordForm(false);
                          setNewPassword("");
                          setConfirmPassword("");
                          setPasswordError("");
                        }}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowPasswordForm(true)}
                  >
                    <KeyRound className="size-4 mr-2" />
                    {t("settings.changePassword")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("settings.preferences")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t("settings.poolSize")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.poolSizeDescription")}
                </p>
                <div className="flex gap-2">
                  {POOL_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={prefs?.poolSize === opt.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleSavePrefs({ poolSize: opt.value })}
                    >
                      {getPoolLabel(opt.value, t)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("settings.firstDayOfWeek")}</Label>
                <div className="flex gap-2">
                  {WEEK_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={prefs?.firstDayOfWeek === opt.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleSavePrefs({ firstDayOfWeek: opt.value })}
                    >
                      {opt.value === 1 ? t("settings.monday") : t("settings.sunday")}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("settings.language")}</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={prefs?.locale ?? "en-US"}
                  onChange={(e) => handleSavePrefs({ locale: e.target.value as Locale })}
                >
                  {LOCALES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {isCoach && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="size-4" />
                  {t("settings.teamManagement")}
                </CardTitle>
                <p className="text-xs text-muted-foreground font-normal">
                  {t("settings.teamManagementDesc")}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {teamError && <p className="text-sm text-destructive">{teamError}</p>}
                {teamLoading ? (
                  <p className="text-sm text-muted-foreground">{t("settings.loadingSwimmers")}</p>
                ) : teamSwimmers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("settings.noSwimmersYet")}</p>
                ) : (
                  <div className="space-y-4">
                    {SWIMMER_GROUPS.map((g) => {
                      const inGroup = teamSwimmers.filter((s) => s.swimmer_group === g.value).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
                      const notInGroup = teamSwimmers.filter((s) => s.swimmer_group !== g.value).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
                      return (
                        <div key={g.value} className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(GROUP_KEYS[g.value])}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {inGroup.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => handleCoachSetGroup(s.id, null)}
                                disabled={updatingSwimmerId === s.id}
                                className="rounded-md border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-primary/20 disabled:opacity-50"
                              >
                                {s.full_name || s.id.slice(0, 8)}
                              </button>
                            ))}
                            {notInGroup.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => handleCoachSetGroup(s.id, g.value)}
                                disabled={updatingSwimmerId === s.id}
                                className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                              >
                                {s.full_name || s.id.slice(0, 8)}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {(isCoach || profile?.role === "swimmer") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="size-4" />
                  {t("settings.volumeAnalytics")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 overflow-x-hidden min-w-0">
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 items-stretch sm:items-center min-w-0">
                  {isCoach && (
                    <div className="min-w-0 flex-1 sm:flex-initial">
                      <select
                        className="w-full sm:w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 min-w-0 w-full sm:w-auto">
                    <div className="flex gap-1 items-center shrink-0">
                      {(["day", "week"] as const).map((a) => (
                        <Button
                          key={a}
                          variant={volumeAggregation === a ? "default" : "outline"}
                          size="sm"
                          onClick={() => { setVolumeAggregation(a); setVolumeDateOffset(0); }}
                        >
                          {a === "day" ? t("settings.weekly") : t("settings.monthly")}
                        </Button>
                      ))}
                    </div>
                    <div className="flex gap-1 items-center min-w-0 overflow-hidden">
                      <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setVolumeDateOffset((o) => o - 1)} aria-label={t("settings.previousPeriod")}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground truncate min-w-0 flex-1 text-center">
                        {getVolumePeriodLabel(volumeAggregation, volumeDateOffset, weekStartsOn, formatDate, t, locale)}
                      </span>
                      <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setVolumeDateOffset((o) => o + 1)} aria-label={t("settings.nextPeriod")}>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {volumeLoading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t("common.loading")}</p>
                ) : (() => {
                  const { start, end } = getVolumeDateRange(volumeAggregation, volumeDateOffset, weekStartsOn);
                  const swimmerView = profile?.role === "swimmer";
                  return (
                    <VolumeChart
                      workouts={volumeWorkouts}
                      swimmers={teamSwimmers as VolumeSwimmerProfile[]}
                      viewMode={swimmerView ? "swimmer" : volumeViewMode}
                      selectedSwimmerId={swimmerView ? user?.id ?? null : volumeSelectedSwimmerId}
                      selectedGroup={swimmerView ? null : volumeSelectedGroup}
                      aggregation={volumeAggregation}
                      weekStartsOn={weekStartsOn}
                      dateRangeStart={start.toISOString().slice(0, 10)}
                      dateRangeEnd={end.toISOString().slice(0, 10)}
                      t={t}
                      formatDate={formatDate}
                      locale={locale}
                    />
                  );
                })()}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6 space-y-4">
              {isCoach && teamSwimmers.length > 0 && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full">
                        <Users className="size-4 mr-2" />
                        {t("settings.removeSwimmer")}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-48" align="start">
                      {teamSwimmers.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          variant="destructive"
                          onClick={() => setDeleteSwimmerTargetId(s.id)}
                        >
                          {s.full_name || s.id.slice(0, 8)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {deleteSwimmerError && <p className="text-sm text-destructive">{deleteSwimmerError}</p>}
                  <AlertDialog open={deleteSwimmerTargetId !== null} onOpenChange={(open) => { if (!open) { setDeleteSwimmerTargetId(null); setDeleteSwimmerError(""); } }}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("removeSwimmer.title", { name: deleteSwimmerTargetId ? (teamSwimmers.find((x) => x.id === deleteSwimmerTargetId)?.full_name || t("removeSwimmer.thisSwimmer")) : "" })}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("removeSwimmer.description")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteSwimmerLoading}>{t("common.cancel")}</AlertDialogCancel>
                        <Button variant="destructive" onClick={handleDeleteSwimmerAccount} disabled={deleteSwimmerLoading}>
                          {deleteSwimmerLoading ? t("coach.deleting") : t("coach.deleteAccount")}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <div className="border-t pt-4" />
                </>
              )}
              <AlertDialog open={showDeleteDialog} onOpenChange={handleDeleteDialogOpenChange}>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="size-4 mr-2" />
                  {t("settings.deleteAccount")}
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("deleteAccount.title")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("deleteAccount.description")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="delete-confirm">
                      {t("deleteAccount.typeToConfirm")}
                    </Label>
                    <Input
                      id="delete-confirm"
                      placeholder={t("deleteAccount.placeholder")}
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="font-mono"
                      autoComplete="off"
                    />
                  </div>
                  {deleteError && (
                    <p className="text-sm text-destructive">{deleteError}</p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <Button
                      variant="destructive"
                      disabled={!canDelete || deleteLoading}
                      onClick={handleDeleteAccount}
                    >
                      {deleteLoading ? t("coach.deleting") : t("coach.deleteAccount")}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>

{saved && (
        <p className="mt-4 text-center text-sm text-muted-foreground">{t("common.saved")}</p>
      )}
      </div>
    </div>
  );
}
