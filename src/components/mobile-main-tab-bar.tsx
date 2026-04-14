"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Dumbbell, Home, Users } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useTranslations } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function normalizePath(pathname: string | null): string {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1) || "/";
  return pathname;
}

function isMainAppPath(path: string): boolean {
  if (path === "/") return true;
  if (path === "/team-management" || path.startsWith("/team-management/")) return true;
  if (path === "/analytics" || path.startsWith("/analytics/")) return true;
  if (path === "/weights" || path.startsWith("/weights/")) return true;
  return false;
}

type TabItem = {
  href: string;
  labelKey: TranslationKey;
  icon: typeof Home;
  match: (p: string) => boolean;
};

const coachTabs: TabItem[] = [
  { href: "/", labelKey: "nav.home", icon: Home, match: (p) => p === "/" },
  {
    href: "/weights",
    labelKey: "nav.weights",
    icon: Dumbbell,
    match: (p) => p === "/weights" || p.startsWith("/weights/"),
  },
  {
    href: "/team-management",
    labelKey: "nav.team",
    icon: Users,
    match: (p) => p === "/team-management" || p.startsWith("/team-management/"),
  },
  {
    href: "/analytics",
    labelKey: "nav.analytics",
    icon: BarChart3,
    match: (p) => p === "/analytics" || p.startsWith("/analytics/"),
  },
];

const swimmerTabs: TabItem[] = [
  { href: "/", labelKey: "nav.home", icon: Home, match: (p) => p === "/" },
  {
    href: "/weights",
    labelKey: "nav.weights",
    icon: Dumbbell,
    match: (p) => p === "/weights" || p.startsWith("/weights/"),
  },
  {
    href: "/analytics",
    labelKey: "nav.analytics",
    icon: BarChart3,
    match: (p) => p === "/analytics" || p.startsWith("/analytics/"),
  },
];

export function MobileMainTabBar() {
  const pathname = usePathname();
  const path = normalizePath(pathname);
  const { user, role, loading } = useAuth();
  const { t } = useTranslations();

  if (loading || !user || (role !== "coach" && role !== "swimmer")) {
    return null;
  }

  if (!isMainAppPath(path)) {
    return null;
  }

  const tabs = role === "coach" ? coachTabs : swimmerTabs;

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex md:hidden",
        "border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "pb-[env(safe-area-inset-bottom)]",
      )}
      aria-label={t("nav.mainLabel")}
    >
      <div className="flex h-14 w-full">
        {tabs.map(({ href, labelKey, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] font-medium leading-tight",
                active ? "text-primary" : "text-muted-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("size-6 shrink-0", active && "text-primary")} aria-hidden />
              <span className="line-clamp-2 w-full">{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
