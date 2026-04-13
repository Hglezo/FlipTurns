"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlipTurnsLogo } from "@/components/flipturns-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTranslations } from "@/components/i18n-provider";
import { usePreferences } from "@/components/preferences-provider";
import { LOCALES, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LOCALE_FLAG_SRC: Record<Locale, string> = {
  "en-US": "/locale-flags/en-US.png",
  "es-ES": "/locale-flags/es-ES.png",
};

type FormMode = "signin" | "signup" | "forgot";
type Role = "swimmer" | "coach";

export default function LoginPage() {
  const router = useRouter();
  const prefs = usePreferences();
  const { t, locale } = useTranslations();
  const [formMode, setFormMode] = useState<FormMode>("signin");
  const [role, setRole] = useState<Role>("swimmer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  function switchMode(mode: FormMode) {
    setFormMode(mode);
    setError(null);
    setResetEmailSent(false);
    if (mode === "signin") setConfirmPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (formMode === "forgot") {
      const redirectTo = `${window.location.origin}/auth/update-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      setLoading(false);
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setResetEmailSent(true);
      return;
    }

    if (formMode === "signup") {
      if (password.length < 6) {
        setError(t("settings.passwordMinLength"));
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError(t("settings.passwordsNoMatch"));
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role } },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
    }

    router.replace("/");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <FlipTurnsLogo className="size-8" size={32} />
          <h1 className="text-2xl font-bold">{t("app.title")}</h1>
        </div>

        <Card>
          <CardHeader className="flex flex-col items-center gap-3 space-y-0 pb-4 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-2">
            <div className="hidden min-w-0 sm:block" aria-hidden />
            <CardTitle className="min-w-0 max-w-full px-1 text-center leading-snug sm:px-0 sm:leading-none">
              {formMode === "forgot"
                ? t("login.forgotPassword")
                : formMode === "signin"
                  ? t("login.signIn")
                  : t("login.createAccount")}
            </CardTitle>
            <div className="flex w-full min-w-0 shrink-0 items-center justify-center gap-0.5 sm:w-auto sm:justify-end">
              <ThemeToggle className="size-8 shrink-0" />
              <div
                className="flex shrink-0 items-center justify-end gap-1.5"
                role="group"
                aria-label={t("settings.language")}
              >
                {LOCALES.map((opt) => {
                  const active = locale === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => prefs?.setPreferences({ locale: opt.value })}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-sm p-0 transition-opacity",
                        active ? "opacity-100" : "opacity-45 hover:opacity-90",
                      )}
                      aria-pressed={active}
                      aria-label={opt.label}
                    >
                      <img
                        src={LOCALE_FLAG_SRC[opt.value]}
                        alt=""
                        width={22}
                        height={22}
                        draggable={false}
                        className="pointer-events-none size-[22px] select-none object-contain"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {formMode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">{t("login.fullName")}</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("login.fullNamePlaceholder")}
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">{t("login.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("login.emailPlaceholder")}
                  required
                />
              </div>

              {formMode !== "forgot" && (
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t("login.password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("login.passwordPlaceholder")}
                    required
                    minLength={6}
                    autoComplete={formMode === "signup" ? "new-password" : "current-password"}
                  />
                  {formMode === "signin" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-left text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {t("login.forgotPassword")}
                    </button>
                  )}
                </div>
              )}

              {formMode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">{t("login.confirmPassword")}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("login.confirmPasswordPlaceholder")}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {formMode === "signup" && (
                <div className="space-y-1.5">
                  <Label>{t("login.iAmA")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole("swimmer")}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        role === "swimmer"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent"
                      }`}
                    >
                      {t("login.swimmer")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("coach")}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        role === "coach"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent"
                      }`}
                    >
                      {t("login.coach")}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              {resetEmailSent && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground" role="status">
                  {t("login.resetEmailSent")}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading || resetEmailSent}>
                {loading
                  ? t("login.pleaseWait")
                  : formMode === "forgot"
                    ? t("login.sendResetLink")
                    : formMode === "signin"
                      ? t("login.signIn")
                      : t("login.createAccount")}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {formMode === "forgot" ? (
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {t("login.backToSignIn")}
                </button>
              ) : formMode === "signin" ? (
                <>
                  {t("login.noAccount")}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {t("login.signUp")}
                  </button>
                </>
              ) : (
                <>
                  {t("login.haveAccount")}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {t("login.signIn")}
                  </button>
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
