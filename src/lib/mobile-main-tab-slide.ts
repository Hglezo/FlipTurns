/**
 * Shared slide machinery for the mobile tab bar: used by both the swipe shell
 * (drag-to-navigate) and the tab bar (tap/bar-drag-to-navigate) so every entry
 * point produces the same animation.
 */

import type { useRouter } from "next/navigation";
import { setPendingSlide } from "./mobile-main-tab-slide-pending";

type AppRouter = ReturnType<typeof useRouter>;

export const SLIDE_DURATION_MS = 280;
export const SLIDE_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

export const SWIPE_WRAPPER_SELECTOR = ".mobile-tab-swipe-wrapper";
export const SWIPE_GHOST_SELECTOR = ".mobile-tab-swipe-ghost";

let inFlight = false;
export function isSlideInFlight(): boolean {
  return inFlight;
}
export function setSlideInFlight(value: boolean): void {
  inFlight = value;
}

/**
 * Clones the wrapper's children into the ghost overlay at `currentDx` so the
 * snapshot lines up with what the user was just looking at.
 *
 * Caveat: `cloneNode` doesn't capture canvas pixel data and re-loads iframes.
 * Neither is used on the four main tab pages today.
 */
export function snapshotIntoGhost(
  wrapper: HTMLElement,
  ghost: HTMLElement,
  currentDx: number,
): void {
  while (ghost.firstChild) ghost.removeChild(ghost.firstChild);

  const inner = document.createElement("div");
  inner.style.position = "absolute";
  inner.style.top = `${-window.scrollY}px`;
  inner.style.left = "0";
  inner.style.right = "0";
  for (const child of Array.from(wrapper.children)) {
    inner.appendChild(child.cloneNode(true));
  }
  ghost.appendChild(inner);

  ghost.style.willChange = "transform";
  ghost.style.transition = "none";
  ghost.style.transform = `translate3d(${currentDx}px, 0, 0)`;
  ghost.style.visibility = "visible";
}

export function hideGhost(ghost: HTMLElement | null): void {
  if (!ghost) return;
  ghost.style.visibility = "hidden";
  ghost.style.transition = "none";
  ghost.style.transform = "";
  ghost.style.willChange = "";
  while (ghost.firstChild) ghost.removeChild(ghost.firstChild);
}

interface TriggerSlideArgs {
  direction: "prev" | "next";
  targetHref: string;
  /** Wrapper's horizontal offset at commit (0 for taps, finger-dx for swipes). */
  startOffsetPx: number;
  router: AppRouter;
}

/** Returns false if the swipe shell hasn't mounted — falls back to `router.push`. */
export function triggerTabSlide({
  direction,
  targetHref,
  startOffsetPx,
  router,
}: TriggerSlideArgs): boolean {
  if (typeof document === "undefined") {
    router.push(targetHref);
    return false;
  }
  const wrapper = document.querySelector<HTMLElement>(SWIPE_WRAPPER_SELECTOR);
  const ghost = document.querySelector<HTMLElement>(SWIPE_GHOST_SELECTOR);
  if (!wrapper || !ghost) {
    router.push(targetHref);
    return false;
  }

  setSlideInFlight(true);
  snapshotIntoGhost(wrapper, ghost, startOffsetPx);

  const vw = window.innerWidth;
  const ghostTarget = direction === "prev" ? vw : -vw;
  // Force layout flush so the next assignment animates instead of jumping.
  void ghost.offsetWidth;
  ghost.style.transition = `transform ${SLIDE_DURATION_MS}ms ${SLIDE_EASING}`;
  ghost.style.transform = `translate3d(${ghostTarget}px, 0, 0)`;

  // Hide the wrapper across the route swap so we don't paint stale/empty
  // content where the ghost just vacated — the new page's layout effect restores it.
  wrapper.style.transition = "none";
  wrapper.style.transform = "";
  wrapper.style.visibility = "hidden";

  setPendingSlide({
    from: direction === "prev" ? "left" : "right",
    target: targetHref,
    startOffsetPx,
    durationMs: SLIDE_DURATION_MS,
    easing: SLIDE_EASING,
  });

  router.push(targetHref);
  return true;
}
