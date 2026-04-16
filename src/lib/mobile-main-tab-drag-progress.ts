/**
 * Pub/sub singleton for live swipe-drag progress. Subscribers mutate DOM
 * directly — no React re-renders during a drag. `null` = drag ended/cancelled.
 */

export interface TabDragProgress {
  /** Effective horizontal drag offset in px (rubber-band damped at edges). */
  dx: number;
}

type Listener = (progress: TabDragProgress | null) => void;

const listeners = new Set<Listener>();

export function subscribeTabDragProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishTabDragProgress(progress: TabDragProgress | null): void {
  for (const listener of listeners) listener(progress);
}
