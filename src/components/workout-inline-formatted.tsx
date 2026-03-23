"use client";

import type { ReactNode } from "react";

/**
 * Renders **bold**, __underline__, ~~strike~~ (markers cannot nest across different types in one pass — inner recursion handles nesting same/different).
 */
export function formatWorkoutInlineText(text: string): ReactNode[] {
  let k = 0;
  function parse(s: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    let i = 0;
    while (i < s.length) {
      const iStar = s.indexOf("**", i);
      const iTilde = s.indexOf("~~", i);
      const iUnder = s.indexOf("__", i);
      const candidates = [iStar, iTilde, iUnder].filter((x) => x >= 0);
      const next = candidates.length === 0 ? -1 : Math.min(...candidates);

      if (next < 0) {
        if (i < s.length) nodes.push(s.slice(i));
        break;
      }
      if (next > i) nodes.push(s.slice(i, next));

      if (s.startsWith("**", next)) {
        const end = s.indexOf("**", next + 2);
        if (end < 0) {
          nodes.push(s.slice(next));
          break;
        }
        const inner = s.slice(next + 2, end);
        nodes.push(
          <strong key={`w${++k}`} className="font-semibold">
            {parse(inner)}
          </strong>,
        );
        i = end + 2;
      } else if (s.startsWith("~~", next)) {
        const end = s.indexOf("~~", next + 2);
        if (end < 0) {
          nodes.push(s.slice(next));
          break;
        }
        const inner = s.slice(next + 2, end);
        nodes.push(
          <del key={`w${++k}`} className="line-through opacity-90">
            {parse(inner)}
          </del>,
        );
        i = end + 2;
      } else if (s.startsWith("__", next)) {
        const end = s.indexOf("__", next + 2);
        if (end < 0) {
          nodes.push(s.slice(next));
          break;
        }
        const inner = s.slice(next + 2, end);
        nodes.push(
          <u key={`w${++k}`} className="underline underline-offset-2">
            {parse(inner)}
          </u>,
        );
        i = end + 2;
      } else {
        nodes.push(s[next]);
        i = next + 1;
      }
    }
    return nodes;
  }
  return parse(text);
}
