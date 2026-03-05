"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/theme-provider";
import {
  getProfile,
  saveProfile,
  getPreferences,
  savePreferences,
  DEFAULT_PREFERENCES,
  type Profile,
  type Preferences,
  type PoolSize,
  type FirstDayOfWeek,
  type Theme,
} from "@/lib/preferences";
import { ArrowLeft, Waves } from "lucide-react";
import { format } from "date-fns";

const POOL_OPTIONS: { value: PoolSize; label: string }[] = [
  { value: "50m", label: "50 m" },
  { value: "25m", label: "25 m" },
  { value: "25y", label: "25 yd" },
];

const WEEK_OPTIONS: { value: FirstDayOfWeek; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 0, label: "Sunday" },
];

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [profile, setProfileState] = useState<Profile>({ name: "", email: "", memberSince: "" });
  const [prefs, setPrefsState] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfileState(getProfile());
    setPrefsState(getPreferences());
  }, []);

  const handleSaveProfile = (updates: Partial<Profile>) => {
    const next = saveProfile(updates);
    setProfileState(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSavePrefs = (updates: Partial<Preferences>) => {
    const next = savePreferences(updates);
    setPrefsState(next);
    if (updates.defaultTheme) {
      setTheme(updates.defaultTheme);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
          <div className="size-10" />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Your name"
                  value={profile.name}
                  onChange={(e) => setProfileState((p) => ({ ...p, name: e.target.value }))}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== profile.name) handleSaveProfile({ name: v });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={profile.email}
                  onChange={(e) => setProfileState((p) => ({ ...p, email: e.target.value }))}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== profile.email) handleSaveProfile({ email: v });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Member since</Label>
                <p className="text-sm text-muted-foreground">
                  {profile.memberSince
                    ? format(new Date(profile.memberSince + "T12:00:00"), "MMMM d, yyyy")
                    : "—"}
                </p>
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
              <div className="space-y-2">
                <Label>Default theme</Label>
                <div className="flex gap-2">
                  {THEME_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={prefs?.defaultTheme === opt.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleSavePrefs({ defaultTheme: opt.value })}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
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
