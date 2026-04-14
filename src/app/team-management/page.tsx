"use client";

import { useState, useEffect, type DragEvent } from "react";
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
  fetchCoachTeamSwimmers,
  patchCoachTeamSwimmerGroup,
  readCoachTeamSwimmersCache,
  removeCoachTeamSwimmerFromCache,
} from "@/lib/coach-team-swimmers-cache";
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
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";

const SWIMMER_GROUPS: { value: SwimmerGroup; label: string }[] = [
  { value: "Sprint", label: "Sprint" },
  { value: "Middle distance", label: "Middle distance" },
  { value: "Distance", label: "Distance" },
];

type DragBucket = "unassigned" | SwimmerGroup;

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
  const [draggingSwimmerId, setDraggingSwimmerId] = useState<string | null>(null);
  const [dragOverBucket, setDragOverBucket] = useState<DragBucket | null>(null);

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
    const uid = user?.id;
    if (!uid) return;

    const cached = readCoachTeamSwimmersCache(uid);
    if (cached) {
      setTeamSwimmers(cached);
      setTeamLoading(false);
      setTeamError("");
    } else {
      setTeamLoading(true);
    }

    let cancelled = false;
    void fetchCoachTeamSwimmers(uid)
      .then((rows) => {
        if (cancelled) return;
        setTeamError("");
        setTeamSwimmers(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setTeamError(e instanceof Error ? e.message : "Failed to load swimmers");
        if (!cached) setTeamSwimmers([]);
      })
      .finally(() => {
        if (!cancelled) setTeamLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profile?.role, authLoading, router, user?.id]);

  const sortByName = (a: { full_name: string | null }, b: { full_name: string | null }) =>
    (a.full_name ?? "").localeCompare(b.full_name ?? "");

  const unassignedSwimmers = teamSwimmers.filter((s) => s.swimmer_group == null).sort(sortByName);

  const endDragSession = () => {
    setDraggingSwimmerId(null);
    setDragOverBucket(null);
  };

  const onSwimmerDragStart = (e: DragEvent, swimmerId: string) => {
    e.dataTransfer.setData("text/plain", swimmerId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingSwimmerId(swimmerId);
  };

  const onBucketDragOver = (e: DragEvent, bucket: DragBucket) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverBucket(bucket);
  };

  const onBucketDragLeave = (e: DragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDragOverBucket(null);
  };

  const onBucketDrop = (e: DragEvent, targetGroup: SwimmerGroup | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain").trim() || null;
    endDragSession();
    if (!id) return;
    void handleCoachSetGroup(id, targetGroup);
  };

  const bucketDropClass = (bucket: DragBucket) =>
    cn(
      "min-h-[2.75rem] rounded-md border-2 border-dashed p-1.5 transition-colors",
      dragOverBucket === bucket ? "border-primary/60 bg-primary/10" : "border-transparent",
    );

  const handleCoachSetGroup = async (swimmerId: string, group: SwimmerGroup | null) => {
    const current = teamSwimmers.find((s) => s.id === swimmerId)?.swimmer_group ?? null;
    if (current === group) return;
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
      patchCoachTeamSwimmerGroup(swimmerId, group);
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
      removeCoachTeamSwimmerFromCache(deleteSwimmerTargetId);
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
    <div className="min-h-dvh bg-background pt-[env(safe-area-inset-top)]">
      <div className="app-shell mx-auto flex w-full min-w-0 max-w-md flex-col px-5 pt-5 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-5 lg:max-w-[34rem] lg:px-6">
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
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("settings.teamUnassignedSwimmers")}</p>
                    <div
                      onDragOver={(e) => onBucketDragOver(e, "unassigned")}
                      onDrop={(e) => onBucketDrop(e, null)}
                      onDragLeave={onBucketDragLeave}
                      className={bucketDropClass("unassigned")}
                    >
                      {unassignedSwimmers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("settings.teamUnassignedEmpty")}</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {unassignedSwimmers.map((s) => (
                            <span
                              key={s.id}
                              draggable
                              onDragStart={(e) => onSwimmerDragStart(e, s.id)}
                              onDragEnd={endDragSession}
                              className={cn(
                                "rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground cursor-grab touch-none active:cursor-grabbing select-none",
                                draggingSwimmerId === s.id && "opacity-50",
                              )}
                            >
                              {s.full_name || s.id.slice(0, 8)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {SWIMMER_GROUPS.map((g) => {
                    const inGroup = teamSwimmers.filter((s) => s.swimmer_group === g.value).sort(sortByName);
                    return (
                      <div key={g.value} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(GROUP_KEYS[g.value])}</p>
                        <div
                          onDragOver={(e) => onBucketDragOver(e, g.value)}
                          onDrop={(e) => onBucketDrop(e, g.value)}
                          onDragLeave={onBucketDragLeave}
                          className={bucketDropClass(g.value)}
                        >
                          {inGroup.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t("settings.teamGroupEmpty")}</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {inGroup.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  draggable
                                  onDragStart={(e) => onSwimmerDragStart(e, s.id)}
                                  onDragEnd={endDragSession}
                                  onClick={() => handleCoachSetGroup(s.id, null)}
                                  disabled={updatingSwimmerId === s.id}
                                  className={cn(
                                    "rounded-md border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-primary/20 disabled:opacity-50 cursor-grab touch-none active:cursor-grabbing",
                                    draggingSwimmerId === s.id && "opacity-50",
                                  )}
                                >
                                  {s.full_name || s.id.slice(0, 8)}
                                </button>
                              ))}
                            </div>
                          )}
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
