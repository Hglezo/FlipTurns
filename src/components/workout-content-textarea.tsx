"use client";

import { cn } from "@/lib/utils";

const TEXTAREA_CLASS =
  "field-sizing-content w-full min-h-[1.25em] resize-none border-0 bg-transparent px-3 py-2 text-[15px] leading-relaxed text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:ring-0 " +
  "[overflow-wrap:anywhere] whitespace-pre-wrap disabled:cursor-not-allowed disabled:opacity-50 " +
  "[text-indent:1.75em_hanging_each-line]";

export type WorkoutContentTextareaProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClassName?: string;
  disabled?: boolean;
};

export function WorkoutContentTextarea({
  value,
  onChange,
  placeholder,
  className,
  minHeightClassName = "min-h-[200px]",
  disabled,
}: WorkoutContentTextareaProps) {
  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-transparent font-sans shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
        minHeightClassName,
        className,
      )}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={TEXTAREA_CLASS}
        rows={1}
        spellCheck
      />
    </div>
  );
}
