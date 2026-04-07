"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

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
  const pendingSelRef = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const el = taRef.current;
    const p = pendingSelRef.current;
    if (!el || !p) return;
    pendingSelRef.current = null;
    const max = value.length;
    el.setSelectionRange(Math.min(p.start, max), Math.min(p.end, max));
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (disabled || e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const v = value;
    const before = v.slice(0, start);
    const mid = v.slice(start, end);
    const after = v.slice(end);
    const parts = mid.split("\n");
    let nextMid: string;
    if (e.shiftKey) {
      nextMid = parts.map((ln) => outdentLinePrefix(ln)).join("\n");
      if (nextMid === mid) return;
    } else {
      nextMid = parts.map((ln) => indentLinePrefix(ln)).join("\n");
    }
    const newV = before + nextMid + after;
    const pos = start + nextMid.length;
    pendingSelRef.current = { start: pos, end: pos };
    onChange(newV);
  }

  return (
    <Textarea
      ref={taRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "w-full min-w-0 resize-y font-sans text-[15px] leading-relaxed text-foreground/90 [tab-size:2]",
        minHeightClassName,
        className,
      )}
    />
  );
}
