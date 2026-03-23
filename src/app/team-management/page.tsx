"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SignOutDropdown } from "@/components/sign-out-dropdown";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslations } from "@/components/i18n-provider";
import { useAuth } from "@/components/auth-provider";
import type { SwimmerGroup } from "@/lib/types";
import { ArrowLeft, LogOut, Users, Settings, Pencil } from "lucide-react";
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
import { GROUP_KEYS } from "@/lib/i18n";
import { NotificationBell } from "@/components/notification-bell";

const SWIMMER_GROUPS: { value: SwimmerGroup; label: string }[] = [
  { value: "Sprint", label: "Sprint" },
  { value: "Middle distance", label: "Middle distance" },
  { value: "Distance", label: "Distance" },
];

export default function TeamManagementPage() {
  const router = useRouter();
  const { t } = useTranslations();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
  const [teamSwimmers, setTeamSwimmers] = useState<{ id: string; full_name: string | null; swimmer_group: SwimmerGroup | null }[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [updatingSwimmerId, setUpdatingSwimmerId] = useState<string | null>(null);
  const [deleteSwimmerTargetId, setDeleteSwimmerTargetId] = useState<string | null>(null);
  const [deleteSwimmerLoading, setDeleteSwimmerLoading] = useState(false);
  const [deleteSwimmerError, setDeleteSwimmerError] = useState("");
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameEdit, setTeamNameEdit] = useState("");
  const [teamNameSaving, setTeamNameSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (profile?.role !== "coach") {
      if (!authLoading && profile?.role === "swimmer") {
        router.push("/");
      }
      return;
    }
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
  }, [profile?.role, authLoading, router]);

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

  if (authLoading || (profile?.role !== "coach" && !authLoading)) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  const role = profile?.role ?? "swimmer";

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="app-shell mx-auto flex w-full min-w-0 max-w-md flex-col px-5 py-5 lg:max-w-lg lg:px-6">
        {/* Header: back button left, title center, icons right */}
        <div className="mb-5 flex w-full min-w-0 items-center justify-between gap-2">
          <Link href="/" className="shrink-0">
            <Button variant="ghost" size="icon" className="size-10" aria-label={t("common.back")}>
              <ArrowLeft className="size-5" />
            </Button>
          </Link>
          <h1 className="flex-1 text-center text-lg font-bold truncate min-w-0">{t("settings.teamManagement")}</h1>
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

        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                {editingTeamName ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!user) return;
                      setTeamNameSaving(true);
                      const val = teamNameEdit.trim() || null;
                      const { error } = await supabase.from("profiles").update({ team_name: val }).eq("id", user.id);
                      if (!error) {
                        await refreshProfile();
                        setEditingTeamName(false);
                      }
                      setTeamNameSaving(false);
                    }}
                  >
                    <Input
                      className="flex-1 min-w-0"
                      value={teamNameEdit}
                      onChange={(e) => setTeamNameEdit(e.target.value)}
                      placeholder={t("settings.teamNamePlaceholder")}
                      autoFocus
                    />
                    <Button type="submit" size="sm" disabled={teamNameSaving}>{teamNameSaving ? t("settings.saving") : t("common.save")}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setEditingTeamName(false); setTeamNameEdit(""); }} disabled={teamNameSaving}>{t("common.cancel")}</Button>
                  </form>
                ) : (
                  <>
                    <span className="text-lg font-medium">{profile?.team_name?.trim() || "—"}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 ml-auto"
                      aria-label={t("settings.editTeamName")}
                      onClick={() => {
                        setTeamNameEdit(profile?.team_name?.trim() ?? "");
                        setEditingTeamName(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </>
                )}
              </div>
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
              <p className="text-xs text-muted-foreground font-normal pt-2">
                {t("settings.teamManagementDesc")}
              </p>
            </CardContent>
          </Card>

          {teamSwimmers.length > 0 && (
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
