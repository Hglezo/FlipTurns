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
import { ArrowLeft, Waves, Trash2, KeyRound, LogOut } from "lucide-react";
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
