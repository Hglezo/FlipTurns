import type { Workout } from "./types";

const STORAGE_KEY = "flipturns:workout-edit-draft:v1";
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type WorkoutEditScope = "coach" | "swimmer";

export type WorkoutEditDraft = {
  scope: WorkoutEditScope;
  userId: string;
  dateKey: string;
  workoutId: string | null;
  workout: Workout;
  updatedAt: number;
};

function isValidDraft(d: unknown): d is WorkoutEditDraft {
  if (!d || typeof d !== "object") return false;
  const x = d as Record<string, unknown>;
  if (x.scope !== "coach" && x.scope !== "swimmer") return false;
  if (typeof x.userId !== "string" || x.userId.length === 0) return false;
  if (typeof x.dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.dateKey)) return false;
  if (typeof x.workoutId !== "string" && x.workoutId !== null) return false;
  if (typeof x.updatedAt !== "number") return false;
  const w = x.workout;
  if (!w || typeof w !== "object") return false;
  const wx = w as Record<string, unknown>;
  return typeof wx.content === "string" && typeof wx.id === "string" && typeof wx.date === "string";
}

function readAll(): WorkoutEditDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr: unknown[] = Array.isArray(parsed) ? parsed : [];
    const now = Date.now();
    return arr.filter((d): d is WorkoutEditDraft => isValidDraft(d) && now - d.updatedAt < DRAFT_TTL_MS);
  } catch {
    return [];
  }
}

function writeAll(drafts: WorkoutEditDraft[]) {
  if (typeof window === "undefined") return;
  try {
    if (drafts.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {}
}

function matches(d: WorkoutEditDraft, userId: string, scope: WorkoutEditScope) {
  return d.userId === userId && d.scope === scope;
}

export function loadWorkoutEditDraft(userId: string | null | undefined, scope: WorkoutEditScope): WorkoutEditDraft | null {
  if (!userId) return null;
  return readAll().find((d) => matches(d, userId, scope)) ?? null;
}

export function saveWorkoutEditDraft(input: Omit<WorkoutEditDraft, "updatedAt">) {
  if (!input.userId) return;
  const next = readAll().filter((d) => !matches(d, input.userId, input.scope));
  next.push({ ...input, updatedAt: Date.now() });
  writeAll(next);
}

export function clearWorkoutEditDraft(userId: string | null | undefined, scope: WorkoutEditScope) {
  if (!userId) return;
  const next = readAll().filter((d) => !matches(d, userId, scope));
  writeAll(next);
}
