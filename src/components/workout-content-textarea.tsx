"use client";

import { useRef, type KeyboardEvent } from "react";
import { WorkoutTextWithWrapIndent } from "@/components/workout-text-with-wrap-indent";
import { cn } from "@/lib/utils";

const TEXTAREA_CLASS =
  "field-sizing-content col-start-1 row-start-1 z-10 w-full min-w-0 min-h-[1.25em] resize-none border-0 bg-transparent px-3 py-2 text-[15px] leading-relaxed text-transparent shadow-none outline-none ring-0 caret-foreground focus-visible:ring-0 " +
  "[overflow-wrap:anywhere] whitespace-pre-wrap [tab-size:2] placeholder:text-muted-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const MIRROR_CLASS =
  "col-start-1 row-start-1 z-0 min-w-0 px-3 py-2 text-[15px] leading-relaxed text-foreground/90 [overflow-wrap:anywhere] whitespace-pre-wrap select-none [tab-size:2]";

export type WorkoutContentTextareaProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClassName?: string;
  disabled?: boolean;
};

function indentLinePrefix(line: string): string {
  return `\t${line}`;
}

function outdentLinePrefix(line: string): string {
  if (line.startsWith("\t")) return line.slice(1);
  if (line.startsWith("  ")) return line.slice(2);
  return line;
}

export function WorkoutContentTextarea({
  value,
  onChange,
  placeholder,
  className,
  minHeightClassName = "min-h-[200px]",
  disabled,
}: WorkoutContentTextareaProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || disabled) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const v = value;

    const apply = (newV: string, selStart: number, selEnd: number) => {
      onChange(newV);
      queueMicrotask(() => taRef.current?.setSelectionRange(selStart, selEnd));
    };

    if (start === end) {
      const lineStart = v.lastIndexOf("\n", start - 1) + 1;
      const lineEndIdx = v.indexOf("\n", start);
      const lineEnd = lineEndIdx === -1 ? v.length : lineEndIdx;
      const line = v.slice(lineStart, lineEnd);
      if (e.shiftKey) {
        const out = outdentLinePrefix(line);
        if (out === line) return;
        const newV = v.slice(0, lineStart) + out + v.slice(lineEnd);
        const removed = line.length - out.length;
        apply(newV, Math.max(lineStart, start - removed), Math.max(lineStart, start - removed));
        return;
      }
      const insert = "\t";
      apply(v.slice(0, start) + insert + v.slice(end), start + insert.length, start + insert.length);
      return;
    }

    const before = v.slice(0, start);
    const sel = v.slice(start, end);
    const after = v.slice(end);
    const lines = sel.split("\n");
    if (e.shiftKey) {
      const next = lines.map((ln) => outdentLinePrefix(ln)).join("\n");
      if (next === sel) return;
      apply(before + next + after, start, start + next.length);
      return;
    }
    const next = lines.map((ln) => indentLinePrefix(ln)).join("\n");
    apply(before + next + after, start, start + next.length);
  };

  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-transparent font-sans shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
        className,
      )}
    >
      <div className={cn("grid min-w-0 grid-cols-1", minHeightClassName)}>
        <div className={cn(MIRROR_CLASS, disabled && "opacity-50")} aria-hidden>
          <WorkoutTextWithWrapIndent content={value} formatInlineMarkers={false} />
        </div>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className={TEXTAREA_CLASS}
          rows={1}
          spellCheck
        />
      </div>
    </div>
  );
}
