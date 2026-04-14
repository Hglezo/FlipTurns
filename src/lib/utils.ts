import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** PostgREST RPCs that `returns uuid` should come back as a string; normalize defensively so callers never skip follow-up writes. */
export function coerceUuidFromRpc(data: unknown): string | null {
  if (data == null) return null;
  if (Array.isArray(data) && data.length === 1) return coerceUuidFromRpc(data[0]);
  if (typeof data === "string") {
    const t = data.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}
