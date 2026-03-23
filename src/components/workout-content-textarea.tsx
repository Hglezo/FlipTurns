"use client";

import { useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { lineIsWorkoutSetHeader } from "@/lib/workout-analyzer";

const LINE_CLASS =
  "field-sizing-content w-full min-h-[1.25em] resize-none border-0 bg-transparent px-3 py-0.5 text-[15px] leading-relaxed text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:ring-0 md:text-[15px] " +
  "pl-[calc(0.75rem+1.75em)] -indent-[1.75em] [overflow-wrap:anywhere] whitespace-pre-wrap disabled:cursor-not-allowed disabled:opacity-50";

const SET_TITLE_LINE_CLASS = "underline underline-offset-[3px] decoration-foreground/75";

function newId() {
  return crypto.randomUUID();
}

export type WorkoutContentTextareaProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  /** Min height of the whole editor (default matches previous single textarea). */
  minHeightClassName?: string;
  disabled?: boolean;
};

/** Workout body editor: same wrap-indent as read-only display (1.75em indent on soft-wrapped lines per logical line). */
export function WorkoutContentTextarea({
  value,
  onChange,
  placeholder,
  className,
  minHeightClassName = "min-h-[200px]",
  disabled,
}: WorkoutContentTextareaProps) {
  const lines = value.length === 0 ? [""] : value.split(/\r?\n/);
  const lineIdsRef = useRef<string[]>([]);
  const lineRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  if (lineIdsRef.current.length !== lines.length) {
    lineIdsRef.current = lines.map(() => newId());
  }

  const setLineRef = useCallback((i: number, el: HTMLTextAreaElement | null) => {
    lineRefs.current[i] = el;
  }, []);

  const flush = useCallback(
    (nextLines: string[]) => {
      onChange(nextLines.join("\n"));
    },
    [onChange],
  );

  useEffect(() => {
    lineRefs.current.length = lines.length;
  }, [lines.length]);

  const onLineKeyDown = useCallback(
    (i: number, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const line = lines[i] ?? "";
        const before = line.slice(0, start);
        const after = line.slice(end);
        const nextLines = [...lines.slice(0, i), before, after, ...lines.slice(i + 1)];
        const ids = lineIdsRef.current;
        lineIdsRef.current = [...ids.slice(0, i + 1), newId(), ...ids.slice(i + 1)];
        flush(nextLines);
        requestAnimationFrame(() => {
          const next = lineRefs.current[i + 1];
          if (next) {
            next.focus();
            next.setSelectionRange(0, 0);
          }
        });
        return;
      }

      if (e.key === "Backspace" && !e.nativeEvent.isComposing) {
        const ta = e.currentTarget;
        if (ta.selectionStart !== 0 || ta.selectionEnd !== 0 || i <= 0) return;
        e.preventDefault();
        const prev = lines[i - 1] ?? "";
        const cur = lines[i] ?? "";
        const merged = prev + cur;
        const nextLines = [...lines.slice(0, i - 1), merged, ...lines.slice(i + 1)];
        const ids = [...lineIdsRef.current];
        ids.splice(i, 1);
        lineIdsRef.current = ids;
        flush(nextLines);
        const caret = prev.length;
        requestAnimationFrame(() => {
          const el = lineRefs.current[i - 1];
          if (el) {
            el.focus();
            el.setSelectionRange(caret, caret);
          }
        });
      }
    },
    [lines, flush],
  );

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col rounded-md border border-input bg-transparent font-sans shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
        minHeightClassName,
        className,
      )}
    >
      {lines.map((line, i) => (
        <textarea
          key={lineIdsRef.current[i]}
          ref={(el) => setLineRef(i, el)}
          value={line}
          disabled={disabled}
          placeholder={i === 0 ? placeholder : undefined}
          className={cn(
            LINE_CLASS,
            lineIsWorkoutSetHeader(line) && SET_TITLE_LINE_CLASS,
            i === 0 && "pt-2",
            i === lines.length - 1 && "pb-2",
          )}
          onChange={(e) => {
            const v = e.target.value;
            if (!v.includes("\n") && !v.includes("\r")) {
              const next = [...lines];
              next[i] = v;
              flush(next);
              return;
            }
            const parts = v.split(/\r?\n/);
            const next = [...lines.slice(0, i), ...parts, ...lines.slice(i + 1)];
            const ids = [...lineIdsRef.current];
            ids.splice(i, 1, ...parts.map(() => newId()));
            lineIdsRef.current = ids;
            flush(next);
            requestAnimationFrame(() => {
              const focusIdx = i + parts.length - 1;
              const el = lineRefs.current[focusIdx];
              if (el) {
                el.focus();
                const len = el.value.length;
                el.setSelectionRange(len, len);
              }
            });
          }}
          onKeyDown={(e) => onLineKeyDown(i, e)}
          rows={1}
          spellCheck
        />
      ))}
    </div>
  );
}
