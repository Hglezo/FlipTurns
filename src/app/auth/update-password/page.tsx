"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function UpdatePasswordPage() {
  const router = useRouter();
  const prefs = usePreferences();
  const { t, locale } = useTranslations();
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    function markReady() {
      if (cancelled || settled) return;
      settled = true;
      setSessionReady(true);
      setInvalid(false);
      setChecking(false);
    }

    function markInvalid() {
      if (cancelled || settled) return;
      settled = true;
      setInvalid(true);
      setSessionReady(false);
      setChecking(false);
    }

    async function initFromUrl() {
      const href = window.location.href;
      const url = new URL(href);
      const code = url.searchParams.get("code");
      if (code) {
        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          markInvalid();
          return;
        }
        window.history.replaceState({}, "", `${url.pathname}${url.hash}`);
        if (exchangeData.session) {
          markReady();
          return;
        }
      }

      const trySession = async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) markReady();
      };

      await trySession();
      if (!settled && !cancelled) {
        await new Promise((r) => setTimeout(r, 150));
        await trySession();
      }

      window.setTimeout(() => {
        if (!cancelled && !settled) markInvalid();
      }, 2500);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        markReady();
        return;
      }
      if (session) markReady();
    });

    void initFromUrl();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const em = session?.user?.email?.trim() ?? "";
      setRecoveryEmail(em);
    });
  }, [sessionReady]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError(t("settings.passwordMinLength"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("settings.passwordsNoMatch"));
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (updateError) {
      setError(updateError.message || t("settings.failedUpdatePassword"));
      return;
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
              {t("login.resetPasswordTitle")}
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
            {checking ? (
              <p className="text-center text-sm text-muted-foreground">{t("login.resetChecking")}</p>
            ) : invalid || !sessionReady ? (
              <div className="space-y-4">
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {t("login.resetLinkInvalid")}
                </p>
                <Button asChild className="w-full" variant="outline">
                  <Link href="/login">{t("login.backToSignIn")}</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("login.resetPasswordSubtitle")}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="email-reset">{t("login.email")}</Label>
                  <Input
                    id="email-reset"
                    type="email"
                    value={recoveryEmail}
                    readOnly
                    autoComplete="email"
                    className="bg-muted/60 text-muted-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password-reset">{t("settings.newPassword")}</Label>
                  <Input
                    id="new-password-reset"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("login.passwordPlaceholder")}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password-reset">{t("settings.confirmPassword")}</Label>
                  <Input
                    id="confirm-password-reset"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("login.confirmPasswordPlaceholder")}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                {error && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("login.pleaseWait") : t("login.resetPasswordSubmit")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
