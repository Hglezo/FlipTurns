/**
 * Inline workout text markers (plain text, stored in DB):
 * - **bold**
 * - __underline__
 * - ~~strikethrough~~
 *
 * Markers must not span newlines (one line / logical row only).
 */

export function stripWorkoutInlineMarkers(text: string): string {
  return text
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/~~([^~]*)~~/g, "$1")
    .replace(/__([^_]*)__/g, "$1");
}
