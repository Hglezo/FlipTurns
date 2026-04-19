"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useRef, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { BarChart3, Dumbbell, Home, Users } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useTranslations } from "@/components/i18n-provider";
import { useViewportPreview } from "@/components/viewport-preview-provider";
import type { TranslationKey } from "@/lib/i18n";
import {
  isSlideInFlight,
  SLIDE_DURATION_MS,
  SLIDE_EASING,
  triggerTabSlide,
} from "@/lib/mobile-main-tab-slide";
import { subscribeTabDragProgress } from "@/lib/mobile-main-tab-drag-progress";
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
  const router = useRouter();
  const previewMobile = useViewportPreview()?.previewViewport === "mobile";

  if (loading || !user || (role !== "coach" && role !== "swimmer")) {
    return null;
  }

  if (!isMainAppPath(path)) {
    return null;
  }

  const tabs = role === "coach" ? coachTabs : swimmerTabs;
  const activeIndex = tabs.findIndex((tab) => tab.match(path));
  // Clamp: a sub-path (/weights/abc) matches its tab by prefix but we still
  // want the bubble parked, not slid off-screen.
  const bubbleIndex = activeIndex < 0 ? 0 : activeIndex;
  const tabCount = tabs.length;
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const isFirstBubbleLayout = useRef(true);
  const drag = useRef({
    pointerId: null as number | null,
    startX: 0,
    startBubbleX: 0,
    cellW: 0,
    maxBubbleX: 0,
    active: false,
    wasDragging: false,
  });

  const DRAG_THRESHOLD_PX = 12;

  const parkBubble = (withTransition: boolean) => {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    bubble.style.transition = withTransition
      ? `transform ${SLIDE_DURATION_MS}ms ${SLIDE_EASING}`
      : "none";
    bubble.style.transform = `translate3d(${bubbleIndex * 100}%, 0, 0)`;
  };

  // Skip the transition on first mount so the bubble doesn't visibly slide
  // from slot 0 on load. Subsequent active-tab changes animate.
  useLayoutEffect(() => {
    const firstLayout = isFirstBubbleLayout.current;
    isFirstBubbleLayout.current = false;
    parkBubble(!firstLayout);
  }, [bubbleIndex]);

  // Follow finger-drag from the swipe shell. Bubble moves opposite to the
  // page (finger right reveals previous tab → bubble goes left), scaled so a
  // full-viewport drag == one tab cell.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    return subscribeTabDragProgress((progress) => {
      if (!progress) {
        parkBubble(true);
        return;
      }
      const offsetPx = -progress.dx / tabCount;
      bubble.style.transition = "none";
      bubble.style.transform = `translate3d(calc(${bubbleIndex * 100}% + ${offsetPx}px), 0, 0)`;
    });
  }, [bubbleIndex, tabCount]);

  const handleTabClick = (
    e: MouseEvent<HTMLAnchorElement>,
    targetHref: string,
    targetIndex: number,
  ) => {
    // Suppress the click that fires after a drag-release on touchscreens.
    if (drag.current.wasDragging) {
      drag.current.wasDragging = false;
      e.preventDefault();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (path === targetHref) {
      e.preventDefault();
      return;
    }
    if (activeIndex < 0 || path !== tabs[activeIndex].href) return;
    if (isSlideInFlight()) return;
    e.preventDefault();
    const direction = targetIndex > activeIndex ? "next" : "prev";
    triggerTabSlide({ direction, targetHref, startOffsetPx: 0, router });
  };

  const handleBarPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (activeIndex < 0) return;
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cellW = rect.width / tabCount;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startBubbleX: bubbleIndex * cellW,
      cellW,
      maxBubbleX: (tabCount - 1) * cellW,
      active: false,
      wasDragging: false,
    };
  };

  const handleBarPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.active) {
      if (Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
      d.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const bubbleX = Math.max(0, Math.min(d.maxBubbleX, d.startBubbleX + dx));
    bubble.style.transition = "none";
    bubble.style.transform = `translate3d(${bubbleX}px, 0, 0)`;
  };

  const handleBarPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d.pointerId !== e.pointerId) return;
    d.pointerId = null;
    if (!d.active) return;
    d.active = false;
    d.wasDragging = true;

    const bubbleX = Math.max(0, Math.min(d.maxBubbleX, d.startBubbleX + (e.clientX - d.startX)));
    const targetIndex = Math.max(0, Math.min(tabCount - 1, Math.round(bubbleX / d.cellW)));

    if (targetIndex === activeIndex || isSlideInFlight()) {
      parkBubble(true);
      return;
    }
    const direction = targetIndex > activeIndex ? "next" : "prev";
    triggerTabSlide({ direction, targetHref: tabs[targetIndex].href, startOffsetPx: 0, router });
  };

  return (
    <nav
      data-mobile-tab-dock
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex",
        !previewMobile && "md:hidden",
        "border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "pb-[env(safe-area-inset-bottom)]",
      )}
      aria-label={t("nav.mainLabel")}
    >
      <div
        ref={barRef}
        className="relative flex h-14 w-full"
        style={{ touchAction: "pan-y" }}
        onPointerDown={handleBarPointerDown}
        onPointerMove={handleBarPointerMove}
        onPointerUp={handleBarPointerEnd}
        onPointerCancel={handleBarPointerEnd}
      >
        <span
          ref={bubbleRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center"
          style={{
            width: `${100 / tabs.length}%`,
            willChange: "transform",
            opacity: activeIndex < 0 ? 0 : 1,
          }}
        >
          <span className="block h-9 w-12 rounded-full bg-accent" />
        </span>

        {tabs.map(({ href, labelKey, icon: Icon, match }, index) => {
          const active = match(path);
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleTabClick(e, href, index)}
              className={cn(
                "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] font-medium leading-tight",
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
