"use client";

import { formatWorkoutInlineText } from "@/components/workout-inline-formatted";
import { splitWorkoutSetTitleLine } from "@/lib/workout-analyzer";
import { cn } from "@/lib/utils";

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
  const fmt = (s: string) => (formatInlineMarkers ? formatWorkoutInlineText(s) : s);
  const segments = content.split(/\r?\n/);
  return (
    <>
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
    </>
  );
}
