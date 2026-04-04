"use client";

import { useLayoutEffect, useRef, useCallback, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { splitWorkoutSetTitleLine } from "@/lib/workout-analyzer";

const SET_TITLE_UNDERLINE = "underline underline-offset-[3px] decoration-foreground/75";

const LINE_CLASS =
  "workout-line min-w-0 break-words px-3 py-0 text-[15px] leading-relaxed text-foreground/90 outline-none [overflow-wrap:anywhere] whitespace-pre-wrap [tab-size:2] pl-[1.75em] -indent-[1.75em]";

const ROOT_CLASS =
  "relative z-10 min-w-0 cursor-text px-0 py-2 outline-none focus-visible:outline-none [&:empty]:min-h-[1lh]";

export type WorkoutContentTextareaProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClassName?: string;
  disabled?: boolean;
};

function getLineElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll(":scope > .workout-line")] as HTMLElement[];
}

function serializeLineFromEl(line: HTMLElement): string {
  const raw = line.textContent ?? "";
  if (raw === "\u00a0") return "";
  return raw;
}

function logicalLineLength(line: HTMLElement): number {
  return serializeLineFromEl(line).length;
}

function serialize(root: HTMLElement): string {
  const els = getLineElements(root);
  if (els.length === 0) return "";
  return els.map(serializeLineFromEl).join("\n");
}

function fillRootDecorated(root: HTMLDivElement, value: string) {
  const lines = value === "" ? [""] : value.split(/\r?\n/);
  root.replaceChildren();
  for (const text of lines) {
    const d = document.createElement("div");
    d.className = cn(LINE_CLASS, text === "" && "min-h-[1lh]");
    if (text === "") {
      d.appendChild(document.createTextNode("\u00a0"));
    } else {
      const split = splitWorkoutSetTitleLine(text);
      if (split) {
        if (split.leading) d.appendChild(document.createTextNode(split.leading));
        const span = document.createElement("span");
        span.className = SET_TITLE_UNDERLINE;
        span.appendChild(document.createTextNode(split.title));
        d.appendChild(span);
        if (split.rest) d.appendChild(document.createTextNode(split.rest));
      } else {
        d.appendChild(document.createTextNode(text));
      }
    }
    root.appendChild(d);
  }
}

function offsetWithinLine(line: HTMLElement, node: Node, offset: number): number {
  if (serializeLineFromEl(line) === "") return 0;
  if (line === node && node.nodeType === Node.ELEMENT_NODE) {
    let sum = 0;
    for (let i = 0; i < offset && i < line.childNodes.length; i++) {
      sum += line.childNodes[i]!.textContent?.length ?? 0;
    }
    return sum;
  }
  if (node.nodeType !== Node.TEXT_NODE) return 0;
  let sum = 0;
  const tw = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let n = tw.nextNode();
  while (n) {
    if (n === node) return sum + offset;
    sum += (n as Text).length;
    n = tw.nextNode();
  }
  return sum;
}

function nodeOffsetToGlobal(root: HTMLElement, node: Node, offset: number): number {
  const lines = getLineElements(root);
  let g = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === node || line.contains(node)) {
      return g + offsetWithinLine(line, node, offset);
    }
    g += logicalLineLength(line) + (i < lines.length - 1 ? 1 : 0);
  }
  return g;
}

function getSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer)) return null;
  const a = nodeOffsetToGlobal(root, r.startContainer, r.startOffset);
  const b = nodeOffsetToGlobal(root, r.endContainer, r.endOffset);
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

function offsetInLineToNode(line: HTMLElement, within: number): { node: Node; offset: number } {
  const texts: Text[] = [];
  const collect = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) texts.push(n as Text);
    else n.childNodes.forEach(collect);
  };
  collect(line);
  if (texts.length === 0) {
    const t = document.createTextNode("");
    line.appendChild(t);
    return { node: t, offset: 0 };
  }
  let w = Math.max(0, within);
  for (const t of texts) {
    if (w <= t.length) return { node: t, offset: w };
    w -= t.length;
  }
  const last = texts[texts.length - 1]!;
  return { node: last, offset: last.length };
}

function resolveGlobalOffset(root: HTMLElement, globalPos: number): { node: Node; offset: number } {
  const lines = getLineElements(root);
  if (lines.length === 0) {
    fillRootDecorated(root as HTMLDivElement, "");
    return resolveGlobalOffset(root, globalPos);
  }
  let base = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const len = logicalLineLength(line);
    const endExclusive = base + len;
    if (globalPos <= endExclusive) {
      return offsetInLineToNode(line, globalPos - base);
    }
    base = endExclusive + (i < lines.length - 1 ? 1 : 0);
  }
  const last = lines[lines.length - 1]!;
  return offsetInLineToNode(last, logicalLineLength(last));
}

function setGlobalSelection(root: HTMLElement, start: number, end: number) {
  const a = resolveGlobalOffset(root, start);
  const b = resolveGlobalOffset(root, end);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

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
  const rootRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string | undefined>(undefined);
  const composingRef = useRef(false);

  const pushChange = useCallback(
    (next: string, selStart: number, selEnd: number) => {
      const root = rootRef.current;
      if (!root) return;
      fillRootDecorated(root, next);
      lastEmittedRef.current = next;
      onChange(next);
      queueMicrotask(() => {
        if (rootRef.current !== root) return;
        setGlobalSelection(root, selStart, selEnd);
      });
    },
    [onChange],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cur = serialize(root);
    if (value === cur) {
      lastEmittedRef.current = value;
      return;
    }
    fillRootDecorated(root, value);
    lastEmittedRef.current = value;
  }, [value]);

  const flushInput = useCallback(() => {
    if (composingRef.current) return;
    const root = rootRef.current;
    if (!root) return;
    const s = serialize(root);
    if (s === lastEmittedRef.current) return;
    const off = getSelectionOffsets(root);
    fillRootDecorated(root, s);
    lastEmittedRef.current = s;
    onChange(s);
    if (off) {
      const max = s.length;
      queueMicrotask(() => {
        if (rootRef.current !== root) return;
        setGlobalSelection(root, Math.min(off.start, max), Math.min(off.end, max));
      });
    }
  }, [onChange]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const root = rootRef.current;
    if (!root) return;

    if (e.key === "Tab") {
      e.preventDefault();
      const off = getSelectionOffsets(root);
      if (!off) return;
      const v = serialize(root);
      const { start, end } = off;
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
      pushChange(newV, start, start + nextMid.length);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const off = getSelectionOffsets(root) ?? { start: 0, end: 0 };
      const { start, end } = off;
      const v = serialize(root);
      const left = v.slice(0, start);
      const right = v.slice(end);
      const newV = left + "\n" + right;
      const focusAt = left === "" && right !== "" ? start : start + 1;
      pushChange(newV, focusAt, focusAt);
      return;
    }

    if (e.key === "Backspace") {
      const off = getSelectionOffsets(root);
      if (!off || off.start !== off.end) return;
      if (off.start === 0) {
        e.preventDefault();
        return;
      }
      const v = serialize(root);
      if (v[off.start - 1] !== "\n") return;
      e.preventDefault();
      const newV = v.slice(0, off.start - 1) + v.slice(off.start);
      const pos = off.start - 1;
      pushChange(newV, pos, pos);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const text = e.clipboardData.getData("text/plain").replace(/\r\n/g, "\n");
    const off = getSelectionOffsets(root);
    if (!off) return;
    const v = serialize(root);
    const newV = v.slice(0, off.start) + text + v.slice(off.end);
    const pos = off.start + text.length;
    pushChange(newV, pos, pos);
  };

  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-transparent font-sans shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <div className={cn("relative min-w-0", minHeightClassName)}>
        {value === "" && placeholder ? (
          <div className="pointer-events-none absolute top-2 left-3 z-0 text-[15px] text-muted-foreground select-none">{placeholder}</div>
        ) : null}
        <div
          ref={rootRef}
          role="textbox"
          aria-multiline
          aria-placeholder={placeholder}
          contentEditable={!disabled}
          suppressHydrationWarning
          spellCheck
          className={ROOT_CLASS}
          onInput={flushInput}
          onBlur={flushInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            flushInput();
          }}
        />
      </div>
    </div>
  );
}
