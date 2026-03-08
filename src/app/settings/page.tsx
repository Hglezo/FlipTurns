"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { usePreferences } from "@/components/preferences-provider";
import { useAuth, type SwimmerGroup } from "@/components/auth-provider";
import { ArrowLeft, Waves, Trash2, KeyRound, LogOut, Users, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
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
  { value: "50m", label: "50 m" },
  { value: "25m", label: "25 m" },
  { value: "25y", label: "25 yd" },
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

const DAY_NAMES_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function getVolumePeriodLabel(aggregation: Aggregation, dateOffset: number, weekStartsOn: 0 | 1): string {
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
    return `Week ${weekNum}, ${format(new Date(year, bestMonth, 1), "MMMM yyyy")}`;
  }
  return format(start, "MMMM yyyy");
}

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
          ? "Select a swimmer"
          : "No volume data in this range"}
      </p>
    );
  }

  const displayData = chartData.map((d, i) => {
    const dayNames = weekStartsOn === 1 ? DAY_NAMES_MON : DAY_NAMES_SUN;
    const shortLabel = aggregation === "day" ? dayNames[i] : `Week ${i + 1}`;
    return { ...d, shortLabel };
  });

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={displayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="shortLabel" tick={{ fontSize: 10 }} interval={0} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(1)}k`} />
          <Tooltip
            formatter={(v) => [`${Number(v ?? 0).toLocaleString()} m`, "Meters"]}
            labelFormatter={(_, payload) => {
              const label = payload?.[0]?.payload?.label ?? "";
              if (aggregation === "week" && label) {
                const start = new Date(label + "T12:00:00");
                const end = new Date(start);
                end.setDate(start.getDate() + 6);
                return `Week of ${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
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
  const prefsContext = usePreferences();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState("");
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

  const [volumeWorkouts, setVolumeWorkouts] = useState<WorkoutRow[]>([]);
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [volumeAggregation, setVolumeAggregation] = useState<Aggregation>("day");
  const [volumeDateOffset, setVolumeDateOffset] = useState(0);
  const [volumeViewMode, setVolumeViewMode] = useState<"swimmer" | "group">("swimmer");
  const [volumeSelectedSwimmerId, setVolumeSelectedSwimmerId] = useState<string | null>(null);
  const [volumeSelectedGroup, setVolumeSelectedGroup] = useState<VolumeSwimmerGroup | null>("Sprint");

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
        .select("id, date, content, assigned_to, assigned_to_group")
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

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-md flex-col px-5 pb-8 pt-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="size-10" aria-label="Back">
              <ArrowLeft className="size-5" />
            </Button>
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Waves className="size-6 text-primary" />
            Settings
          </h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SignOutDropdown
            trigger={
              <Button variant="ghost" size="icon" className="size-9" aria-label="Sign out">
                <LogOut className="size-5" />
              </Button>
            }
            />
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <p className="text-sm text-foreground">
                  {profile?.full_name ?? user?.user_metadata?.full_name ?? "—"}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <p className="text-sm text-foreground">{user?.email ?? "—"}</p>
              </div>
              <div className="space-y-2">
                <Label>Member since</Label>
                <p className="text-sm text-muted-foreground">
                  {profile?.created_at
                    ? format(new Date(profile.created_at), "MMMM d, yyyy")
                    : "—"}
                </p>
              </div>
              {profile?.role === "swimmer" && (
                <div className="space-y-2">
                  <Label>Group</Label>
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
                      Not set
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
                        {g.label}
                      </button>
                    ))}
                  </div>
                  {groupError && <p className="text-sm text-destructive">{groupError}</p>}
                  <p className="text-xs text-muted-foreground">
                    Coaches can assign workouts to your group; all swimmers in that group will see them.
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
                        Cancel
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
                    Change password
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Pool size</Label>
                <div className="flex gap-2">
                  {POOL_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={prefs?.poolSize === opt.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleSavePrefs({ poolSize: opt.value })}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>First day of week</Label>
                <div className="flex gap-2">
                  {WEEK_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={prefs?.firstDayOfWeek === opt.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleSavePrefs({ firstDayOfWeek: opt.value })}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {isCoach && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="size-4" />
                  Team management
                </CardTitle>
                <p className="text-xs text-muted-foreground font-normal">
                  Assign swimmers to groups. This overrides the group they chose in their own profile.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {teamError && <p className="text-sm text-destructive">{teamError}</p>}
                {teamLoading ? (
                  <p className="text-sm text-muted-foreground">Loading swimmers…</p>
                ) : teamSwimmers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No swimmers yet.</p>
                ) : (
                  <div className="space-y-4">
                    {SWIMMER_GROUPS.map((g) => {
                      const inGroup = teamSwimmers.filter((s) => s.swimmer_group === g.value).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
                      const notInGroup = teamSwimmers.filter((s) => s.swimmer_group !== g.value).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
                      return (
                        <div key={g.value} className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
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
                  Volume analytics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                  {isCoach && (
                    <div className="flex gap-1">
                      <Button
                        variant={volumeViewMode === "swimmer" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setVolumeViewMode("swimmer")}
                      >
                        Swimmer
                      </Button>
                      <Button
                        variant={volumeViewMode === "group" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setVolumeViewMode("group")}
                      >
                        Group
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-1 items-center">
                    {(["day", "week"] as const).map((a) => (
                      <Button
                        key={a}
                        variant={volumeAggregation === a ? "default" : "outline"}
                        size="sm"
                        onClick={() => { setVolumeAggregation(a); setVolumeDateOffset(0); }}
                      >
                        {a === "day" ? "Weekly" : "Monthly"}
                      </Button>
                    ))}
                    <Button variant="outline" size="icon" className="size-8" onClick={() => setVolumeDateOffset((o) => o - 1)} aria-label="Previous period">
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground min-w-[140px] text-center">
                      {getVolumePeriodLabel(volumeAggregation, volumeDateOffset, weekStartsOn)}
                    </span>
                    <Button variant="outline" size="icon" className="size-8" onClick={() => setVolumeDateOffset((o) => o + 1)} aria-label="Next period">
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>

                {isCoach && volumeViewMode === "swimmer" && (
                  <div className="space-y-2">
                    <Label className="text-xs">Swimmer</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={volumeSelectedSwimmerId ?? ""}
                      onChange={(e) => setVolumeSelectedSwimmerId(e.target.value || null)}
                    >
                      <option value="">Select swimmer</option>
                      {teamSwimmers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name || s.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isCoach && volumeViewMode === "group" && (
                  <div className="space-y-2">
                    <Label className="text-xs">Group</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={volumeSelectedGroup ?? ""}
                      onChange={(e) => setVolumeSelectedGroup((e.target.value || null) as VolumeSwimmerGroup | null)}
                    >
                      {SWIMMER_GROUPS.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {volumeLoading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
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
                    />
                  );
                })()}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <AlertDialog open={showDeleteDialog} onOpenChange={handleDeleteDialogOpenChange}>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="size-4 mr-2" />
                  Delete account
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. All your data will be permanently deleted.
                      Type <strong>delete</strong> below to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="delete-confirm">
                      Type &quot;delete&quot; to confirm
                    </Label>
                    <Input
                      id="delete-confirm"
                      placeholder="delete"
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
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button
                      variant="destructive"
                      disabled={!canDelete || deleteLoading}
                      onClick={handleDeleteAccount}
                    >
                      {deleteLoading ? "Deleting…" : "Delete account"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>

        {saved && (
          <p className="mt-4 text-center text-sm text-muted-foreground">Saved</p>
        )}
      </div>
    </div>
  );
}
