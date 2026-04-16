/** Left-to-right order of the bottom tab bar, mirrored from the bar component. */

export type TabRole = "coach" | "swimmer";

const COACH_TAB_HREFS = ["/", "/weights", "/team-management", "/analytics"] as const;
const SWIMMER_TAB_HREFS = ["/", "/weights", "/analytics"] as const;

export function getTabHrefsForRole(role: TabRole): readonly string[] {
  return role === "coach" ? COACH_TAB_HREFS : SWIMMER_TAB_HREFS;
}

/** Tab index only for exact top-level href matches; sub-paths return -1. */
export function findExactTabIndex(path: string, hrefs: readonly string[]): number {
  return hrefs.indexOf(path);
}

export function getNeighborHref(
  hrefs: readonly string[],
  index: number,
  direction: "prev" | "next",
): string | null {
  const target = direction === "prev" ? index - 1 : index + 1;
  if (target < 0 || target >= hrefs.length) return null;
  return hrefs[target];
}
