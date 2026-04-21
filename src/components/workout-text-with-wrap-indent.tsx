"use client";

import { formatWorkoutInlineText } from "@/components/workout-inline-formatted";
import { splitWorkoutSetTitleLine } from "@/lib/workout-analyzer";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/components/preferences-provider";
import { WORKOUT_DISPLAY_FONTS, type WorkoutDisplayFont } from "@/lib/preferences";

const WK_FONT: Record<WorkoutDisplayFont, string> = {
  sans: "font-sans",
  serif: "font-serif",
  mono: "font-mono",
  pacifico: "font-wk-pacifico",
  atkinson: "font-wk-atkinson",
};

const SET_TITLE_UNDERLINE = "underline underline-offset-[3px] decoration-foreground/75";

export function WorkoutTextWithWrapIndent({
  content,
  segmentClassName,
  formatInlineMarkers = true,
}: {
  content: string;
  segmentClassName?: string;
  formatInlineMarkers?: boolean;
}) {
  const prefs = usePreferences();
  const raw = prefs?.preferences.workoutDisplayFont;
  const key = WORKOUT_DISPLAY_FONTS.includes(raw as WorkoutDisplayFont) ? (raw as WorkoutDisplayFont) : "sans";
  const fontCls = WK_FONT[key];
  const fmt = (s: string) => (formatInlineMarkers ? formatWorkoutInlineText(s) : s);
  const segments = content.split(/\r?\n/);
  return (
    <div className={cn("min-w-0", fontCls)}>
      {segments.map((segment, i) => {
        const split = segment === "" ? null : splitWorkoutSetTitleLine(segment);
        return (
          <div
            key={i}
            className={cn(
              "min-w-0 break-words whitespace-pre-wrap [tab-size:2] pl-[1.75em] -indent-[1.75em]",
              segment === "" && "min-h-[1lh]",
              segmentClassName,
            )}
          >
            {segment === "" ? (
              "\u00a0"
            ) : split ? (
              <>
                {split.leading}
                <span className={SET_TITLE_UNDERLINE}>{fmt(split.title)}</span>
                {fmt(split.rest)}
              </>
            ) : (
              fmt(segment)
            )}
          </div>
        );
      })}
    </div>
  );
}
