"use client";

/**
 * Wraps `{children}` and turns horizontal swipes into navigations between the
 * bottom tab bar's top-level routes. Shares snapshot/ghost machinery with
 * tab-tap and bar-drag navigations (see `mobile-main-tab-slide.ts`).
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  findExactTabIndex,
  getNeighborHref,
  getTabHrefsForRole,
  type TabRole,
} from "@/lib/mobile-main-tab-order";
import { consumePendingSlide } from "@/lib/mobile-main-tab-slide-pending";
import {
  hideGhost,
  setSlideInFlight,
  SLIDE_DURATION_MS,
  SLIDE_EASING,
  triggerTabSlide,
} from "@/lib/mobile-main-tab-slide";
import { publishTabDragProgress } from "@/lib/mobile-main-tab-drag-progress";

// Cumulative-motion threshold before axis lock — single-sample decisions on
// noisy touch data misclassify a swipe as vertical scroll.
const AXIS_LOCK_MIN_PX = 12;
const AXIS_LOCK_RATIO = 1.0;
const COMMIT_DISTANCE_RATIO = 0.25;
const COMMIT_VELOCITY_PX_PER_MS = 0.5;
const RUBBER_BAND = 0.3;
const MOBILE_BREAKPOINT_PX = 767;

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.closest('[contenteditable=""], [contenteditable="true"], [data-no-swipe]')) return true;
  return false;
}

export function MobileMainTabSwipeShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { user, role, loading } = useAuth();

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const dragRef = useRef({
    pointerId: null as number | null,
    active: false,
    locked: null as "horizontal" | "vertical" | null,
    startX: 0,
    startY: 0,
    startTime: 0,
    dx: 0,
    rafId: 0,
  });

  const enabled = !loading && !!user && (role === "coach" || role === "swimmer");
  const tabRole = (role ?? "swimmer") as TabRole;
  const hrefs = getTabHrefsForRole(tabRole);
  const activeIndex = enabled ? findExactTabIndex(pathname, hrefs) : -1;
  const swipeEnabled = enabled && activeIndex >= 0;

  // Prefetch neighbor routes so the incoming page is hot when committed.
  useEffect(() => {
    if (!swipeEnabled) return;
    const prev = getNeighborHref(hrefs, activeIndex, "prev");
    const next = getNeighborHref(hrefs, activeIndex, "next");
    if (prev) router.prefetch(prev);
    if (next) router.prefetch(next);
  }, [swipeEnabled, activeIndex, hrefs, router]);

  // Play the incoming animation for a pending slide (from swipe/tap/bar-drag).
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const slide = consumePendingSlide(pathname);
    if (!slide) {
      wrapper.style.transition = "";
      wrapper.style.transform = "";
      wrapper.style.visibility = "";
      wrapper.style.willChange = "";
      hideGhost(ghostRef.current);
      setSlideInFlight(false);
      return;
    }

    const vw = window.innerWidth;
    const initial =
      slide.from === "right" ? vw + slide.startOffsetPx : -vw + slide.startOffsetPx;

    wrapper.style.willChange = "transform";
    wrapper.style.transition = "none";
    wrapper.style.transform = `translate3d(${initial}px, 0, 0)`;
    wrapper.style.visibility = "";
    void wrapper.offsetWidth;
    wrapper.style.transition = `transform ${slide.durationMs}ms ${slide.easing}`;
    wrapper.style.transform = "translate3d(0, 0, 0)";

    let cleaned = false;
    const finish = () => {
      if (cleaned) return;
      cleaned = true;
      wrapper.removeEventListener("transitionend", finish);
      window.clearTimeout(safetyId);
      wrapper.style.transition = "";
      wrapper.style.transform = "";
      wrapper.style.visibility = "";
      wrapper.style.willChange = "";
      hideGhost(ghostRef.current);
      setSlideInFlight(false);
    };
    wrapper.addEventListener("transitionend", finish);
    const safetyId = window.setTimeout(finish, slide.durationMs + 100);
  }, [pathname]);

  useEffect(() => {
    if (!swipeEnabled) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const flushTransform = () => {
      const d = dragRef.current;
      d.rafId = 0;
      if (!d.active || d.locked !== "horizontal") return;
      wrapper.style.transform = `translate3d(${d.dx}px, 0, 0)`;
      publishTabDragProgress({ dx: d.dx });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (window.innerWidth > MOBILE_BREAKPOINT_PX) return;
      if (e.pointerType === "mouse") return;
      if (e.isPrimary === false) return;
      if (isInteractiveTarget(e.target)) return;
      const d = dragRef.current;
      d.pointerId = e.pointerId;
      d.active = true;
      d.locked = null;
      d.startX = e.clientX;
      d.startY = e.clientY;
      d.startTime = e.timeStamp;
      d.dx = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      if (d.locked === null) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx < AXIS_LOCK_MIN_PX && ady < AXIS_LOCK_MIN_PX) return;
        if (adx > AXIS_LOCK_RATIO * ady && adx >= AXIS_LOCK_MIN_PX) {
          d.locked = "horizontal";
          wrapper.style.transition = "none";
          wrapper.style.willChange = "transform";
        } else {
          d.locked = "vertical";
          d.active = false;
          publishTabDragProgress(null);
          return;
        }
      }
      if (d.locked !== "horizontal") return;

      // Rubber-band damping when there's no neighbor in the swipe direction.
      let effective = dx;
      if (dx > 0 && getNeighborHref(hrefs, activeIndex, "prev") === null) {
        effective = dx * RUBBER_BAND;
      } else if (dx < 0 && getNeighborHref(hrefs, activeIndex, "next") === null) {
        effective = dx * RUBBER_BAND;
      }
      d.dx = effective;

      if (d.rafId === 0) d.rafId = requestAnimationFrame(flushTransform);
    };

    const snapBack = () => {
      wrapper.style.transition = `transform ${SLIDE_DURATION_MS}ms ${SLIDE_EASING}`;
      wrapper.style.transform = "translate3d(0, 0, 0)";
      const cleanup = () => {
        wrapper.removeEventListener("transitionend", cleanup);
        wrapper.style.transition = "";
        wrapper.style.transform = "";
        wrapper.style.willChange = "";
      };
      wrapper.addEventListener("transitionend", cleanup, { once: true });
    };

    const onPointerEnd = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d.pointerId !== e.pointerId && d.pointerId !== null) return;
      const wasHorizontal = d.locked === "horizontal";
      const dx = d.dx;
      const elapsed = e.timeStamp - d.startTime;
      const velocity = elapsed > 0 ? dx / elapsed : 0;

      d.active = false;
      d.locked = null;
      d.pointerId = null;
      if (d.rafId !== 0) {
        cancelAnimationFrame(d.rafId);
        d.rafId = 0;
      }
      if (!wasHorizontal) return;

      const vw = window.innerWidth;
      const direction: "prev" | "next" | null =
        dx > 0 ? "prev" : dx < 0 ? "next" : null;

      let target: string | null = null;
      if (direction) {
        const candidate = getNeighborHref(hrefs, activeIndex, direction);
        if (candidate) {
          const pastDistance = Math.abs(dx) > vw * COMMIT_DISTANCE_RATIO;
          const fastFlick =
            Math.abs(velocity) > COMMIT_VELOCITY_PX_PER_MS &&
            (direction === "prev" ? velocity > 0 : velocity < 0);
          if (pastDistance || fastFlick) target = candidate;
        }
      }

      if (target && direction) {
        // Leave the bubble at its last drag offset so the bar's activeIndex
        // change animates smoothly to the new resting slot; publishing null
        // here would jitter it back to the old slot first.
        triggerTabSlide({ direction, targetHref: target, startOffsetPx: dx, router });
      } else {
        publishTabDragProgress(null);
        snapBack();
      }
    };

    // Capture-phase so we own the gesture before any descendant handler
    // (Recharts SVG, Radix popovers, etc.) can consume it.
    wrapper.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true, capture: true });
    window.addEventListener("pointerup", onPointerEnd, { capture: true });
    window.addEventListener("pointercancel", onPointerEnd, { capture: true });
    return () => {
      wrapper.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointermove", onPointerMove, { capture: true });
      window.removeEventListener("pointerup", onPointerEnd, { capture: true });
      window.removeEventListener("pointercancel", onPointerEnd, { capture: true });
      const d = dragRef.current;
      if (d.rafId !== 0) {
        cancelAnimationFrame(d.rafId);
        d.rafId = 0;
      }
    };
  }, [swipeEnabled, activeIndex, hrefs, router]);

  return (
    <>
      <div className="mobile-tab-swipe-clip">
        <div
          ref={wrapperRef}
          className="mobile-tab-swipe-wrapper"
          style={swipeEnabled ? { touchAction: "pan-y" } : undefined}
        >
          {children}
        </div>
      </div>
      <div ref={ghostRef} className="mobile-tab-swipe-ghost" aria-hidden="true" />
    </>
  );
}
