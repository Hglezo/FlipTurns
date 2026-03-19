"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlipTurnsLogo } from "@/components/flipturns-logo";
import { useTranslations } from "@/components/i18n-provider";

type FormMode = "signin" | "signup";
type Role = "swimmer" | "coach";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslations();
  const [formMode, setFormMode] = useState<FormMode>("signin");
  const [role, setRole] = useState<Role>("swimmer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(mode: FormMode) {
    setFormMode(mode);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (formMode === "signup") {
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

    router.push("/");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <FlipTurnsLogo className="size-8" size={32} />
          <h1 className="text-2xl font-bold">{t("app.title")}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">
              {formMode === "signin" ? t("login.signIn") : t("login.createAccount")}
            </CardTitle>
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
                />
              </div>

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

              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? t("login.pleaseWait")
                  : formMode === "signin"
                  ? t("login.signIn")
                  : t("login.createAccount")}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {formMode === "signin" ? (
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
