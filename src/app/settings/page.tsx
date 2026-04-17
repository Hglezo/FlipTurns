"use client";

import { useState, useEffect } from "react";
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
  type FirstDayOfWeek,
} from "@/lib/preferences";
import { LOCALES, GROUP_KEYS, type Locale } from "@/lib/i18n";
import { useTranslations } from "@/components/i18n-provider";
import { usePreferences } from "@/components/preferences-provider";
import { useViewportPreview } from "@/components/viewport-preview-provider";
import { useAuth } from "@/components/auth-provider";
import type { SwimmerGroup } from "@/lib/types";
import { ArrowLeft, Trash2, KeyRound, LogOut, Pencil, Smartphone, Monitor } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { IN_APP_CLIENT_ROUTE_KEY } from "@/lib/in-app-navigation";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const WEEK_OPTIONS: { value: FirstDayOfWeek; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 0, label: "Sunday" },
];

const SWIMMER_GROUPS: { value: SwimmerGroup; label: string }[] = [
  { value: "Sprint", label: "Sprint" },
  { value: "Middle distance", label: "Middle distance" },
  { value: "Distance", label: "Distance" },
];

function prefsSegmentButtonClass(selected: boolean) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
    selected ? "border-primary bg-primary/10 hover:bg-primary/20" : "border-input bg-background hover:bg-accent",
  );
}

function ViewportPreviewButtons() {
  const { t } = useTranslations();
  const viewport = useViewportPreview();
  if (!viewport) return null;
  const { previewViewport, setPreviewViewport } = viewport;
  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewViewport(null)}
        className={prefsSegmentButtonClass(previewViewport === null)}
      >
        {t("settings.viewportAuto")}
      </button>
      <button
        type="button"
        onClick={() => setPreviewViewport("mobile")}
        className={prefsSegmentButtonClass(previewViewport === "mobile")}
      >
        <Smartphone className="size-3.5" />
        {t("settings.viewportMobile")}
      </button>
      <button
        type="button"
        onClick={() => setPreviewViewport("desktop")}
        className={prefsSegmentButtonClass(previewViewport === "desktop")}
      >
        <Monitor className="size-3.5" />
        {t("settings.viewportDesktop")}
      </button>
    </>
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

  useEffect(() => {
    setPrefsState(getPreferences());
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

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

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="app-shell mx-auto flex max-w-md flex-col px-5 pb-8 pt-6 lg:max-w-[34rem] lg:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10"
            aria-label={t("common.back")}
            onClick={() =>
              sessionStorage.getItem(IN_APP_CLIENT_ROUTE_KEY) === "1" ? router.back() : router.push("/")
            }
          >
            <ArrowLeft className="size-6" />
          </Button>
          <h1 className="text-xl font-bold">{t("common.settings")}</h1>
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
                  <Pencil className="size-5" />
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
              {profile?.role === "swimmer" && (
                <div className="space-y-2">
                  <Label>{t("settings.group")}</Label>
                  <div className="flex gap-2 flex-wrap">
                    {SWIMMER_GROUPS.map((g) => (
                      <Button
                        key={g.value}
                        type="button"
                        variant={profile?.swimmer_group === g.value ? "default" : "outline"}
                        size="sm"
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
                        disabled={groupSaving}
                      >
                        {t(GROUP_KEYS[g.value])}
                      </Button>
                    ))}
                  </div>
                  {groupError && <p className="text-sm text-destructive">{groupError}</p>}
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("settings.firstDayOfWeek")}</Label>
                <div className="flex gap-2 flex-wrap">
                  {WEEK_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={prefsSegmentButtonClass(prefs?.firstDayOfWeek === opt.value)}
                      onClick={() => handleSavePrefs({ firstDayOfWeek: opt.value })}
                    >
                      {opt.value === 1 ? t("settings.monday") : t("settings.sunday")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("settings.viewportPreview")}</Label>
                <div className="flex gap-2 flex-wrap">
                  <ViewportPreviewButtons />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
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
