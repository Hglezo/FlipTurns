/**
 * Module-level singleton carrying "pending slide" intent across a Next.js route
 * navigation. Read from the new page's first layout effect to play the matching
 * incoming animation. Not React state — must survive the route swap and not
 * trigger re-renders when set.
 */

export type SlideFromSide = "left" | "right";

interface PendingSlide {
  from: SlideFromSide;
  target: string;
  startOffsetPx: number;
  durationMs: number;
  easing: string;
}

let pending: PendingSlide | null = null;

export function setPendingSlide(slide: PendingSlide): void {
  pending = slide;
}

/** Atomically reads and clears the pending slide if it matches `currentPath`. */
export function consumePendingSlide(currentPath: string): PendingSlide | null {
  if (!pending) return null;
  if (pending.target !== currentPath) return null;
  const slide = pending;
  pending = null;
  return slide;
}

export function clearPendingSlide(): void {
  pending = null;
}
