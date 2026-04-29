/** Parses workout text for meters per set (strokes, repeats, out/in, ida/vuelta, etc.). */

import { stripWorkoutInlineMarkers } from "./workout-inline-format";

export interface WorkoutSet {
  name: string;
  meters: number;
}

export interface WorkoutAnalysis {
  totalMeters: number;
  sets: WorkoutSet[];
  estimatedDurationMinutes: number;
}

const SET_NAME_PATTERNS = [
  /^(?:set|serie)\s*#\s*\d+\s*:?/i,
  /^(?:superset)\b(?:\s+[^:\n]+)?\s*:?/i,
  /^(?:warm[- ]?up|warmup|calentamiento)\s*:?/i,
  /^(?:pre[- ]?set\s+activation|pre[- ]?set|pre\s+set|preset)\s*:?/i,
  /^(?:main\s+set|set\s+principal|activation\s+set)\s*:?/i,
  /^(?:kick\s+set)\s*:?/i,
  /^(?:pull\s+set)\s*:?/i,
  /^(?:speed\s+set)\s*:?/i,
  /^(?:technique\s+set|tech(?:nique)?\s+set|technique|tech)\s*:?/i,
  /^(?:uw\s+set|underwater\s+set)\s*:?/i,
  /^(?:fins\s+set)\s*:?/i,
  /^(?:warm[- ]?down|warmdown)\s*:?/i,
  /^(?:cool[- ]?down|cooldown|suave|vuelta\s+a\s+la\s+calma)\s*:?/i,
  /^(?:drill(?:s)?)\s*:?/i,
  /^(?:sprint(?:s)?)\s*:?/i,
  /^(?:build(?:s)?)\s*:?/i,
  /^(?:easy|recovery)\s*:?/i,
  /^(?:set\b(?:\s+[^:\n]+)?|serie\b(?:\s+[^:\n]+)?)\s*:?/i,
];

const LONE_STAR = /(?<!\*)\*(?!\*)/;

function parseSetHeadLine(trimmed: string): { name: string; titleEnd: number } | null {
  if (!trimmed) return null;
  const i = trimmed.search(LONE_STAR);
  const head = (i < 0 ? trimmed : trimmed.slice(0, i)).trimEnd();
  const repeatM = head.match(/^(\d+\s*[x×]\s+)/i);
  const repeatPrefix = repeatM ? repeatM[1] : "";
  const headForPattern = repeatPrefix ? head.slice(repeatPrefix.length) : head;
  if (!headForPattern) return null;

  for (const pattern of SET_NAME_PATTERNS) {
    if (!pattern.test(headForPattern)) continue;
    const colonIdx = headForPattern.indexOf(":");
    const innerTitleEnd = colonIdx >= 0 ? colonIdx : headForPattern.length;
    const titleEnd = repeatPrefix.length + innerTitleEnd;
    const nameRaw = head.slice(0, titleEnd).trim();
    if (!nameRaw) continue;
    return { name: nameRaw.replace(/\buw\s+set\b/i, "Underwater Set"), titleEnd };
  }
  return null;
}

const REPEAT_PATTERN = /(\d+)\s*[×xX]\s*(\d+)/g;

// Out/in (ida/vuelta): 30m/rep, round to nearest 25m.
function outInMetersForCount(n: number): number {
  return Math.round((n * 30) / 25) * 25;
}
// Same phrase shapes as English out/in; "ida y vuelta" is common written without a slash.
const OUT_IN_PHRASE = String.raw`(?:out\s*\/\s*in\s*s?|ida\s*\/\s*vueltas?|ida\s+y\s+vueltas?)`;
// (?![0-9]) so "400 out/in" is not a rep count.
const OUT_IN_WITH_COUNT = new RegExp(String.raw`\b((?:10|[1-9])(?![0-9]))\s*[xX]?\s*${OUT_IN_PHRASE}`, "gi");
const OUT_IN_STANDALONE = new RegExp(String.raw`(?<!\d)\b${OUT_IN_PHRASE}\b`, "gi");

function parseOutInMeters(text: string): number {
  let meters = 0;
  let remaining = text;
  for (const m of text.matchAll(OUT_IN_WITH_COUNT)) {
    meters += outInMetersForCount(parseInt(m[1], 10));
    remaining = remaining.replace(m[0], " ");
  }
  const standalone = remaining.match(OUT_IN_STANDALONE);
  if (standalone) meters += outInMetersForCount(standalone.length);
  return meters;
}
// Pool distances (25–9975); optional stroke only — not `m`/`meters` (pace targets like p160, 50m, 100y are stripped earlier).
// (?<![:\d]) avoids times like "1:25" / "2:50".
const STANDALONE_DISTANCE_PATTERN = /(?<![:\d])\b(25|50|75|[1-9]\d{0,2}(?:00|25|50|75)|[1-9]\d{3})\s*(?:free|fr|fly|fl|back|bk|breast|br|uw|kick|drill|pull|easy|im)?\b/gi;
// Matches "N:" at start of line (e.g. "25: swim @80%") - require 2+ digits to avoid "1:30" time format
const LEADING_DISTANCE_PATTERN = /^\s*(\d{2,})\s*:/gm;

// Strip parens per line, innermost first, so nested "(a (25-25) / b)" does not leak counts into the rest of the line.
function removeParentheticalContent(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      let prev: string;
      let s = line;
      do {
        prev = s;
        s = s.replace(/\([^()]*\)/g, " ");
      } while (s !== prev);
      return s;
    })
    .join("\n");
}

function stripLineBracketNotes(line: string): string {
  if (/^\s*\d+\s*[xX]\s*\[/.test(line)) return line;
  return line.replace(/\[[^\]\n]*\]/g, " ");
}

function isWorkoutStarCommentLine(line: string): boolean {
  return /^\s*\*/.test(line);
}

function isQuotedCommentLine(line: string): boolean {
  const t = line.trim();
  return t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("\u201c") && t.endsWith("\u201d")));
}

function isBlankWorkoutLine(line: string): boolean {
  return line.trim() === "";
}

function isStructuralCommentOrBlankLine(line: string): boolean {
  return isBlankWorkoutLine(line) || isWorkoutStarCommentLine(line) || isQuotedCommentLine(line);
}

// Blank lines end unbracketed N× blocks; drop blank+* / blank+full-line-"…" runs between two work lines so refetches do not split the block.
function collapseCommentGapsBetweenContent(rawLines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    if (isStructuralCommentOrBlankLine(line)) {
      const start = i;
      while (i < rawLines.length && isStructuralCommentOrBlankLine(rawLines[i])) {
        i++;
      }
      const hasFollowingContent = i < rawLines.length && !isStructuralCommentOrBlankLine(rawLines[i]);
      const hasPrecedingContent = out.length > 0;
      const gapHadComment =
        rawLines.slice(start, i).some((ln) => isWorkoutStarCommentLine(ln) || isQuotedCommentLine(ln));
      if (hasPrecedingContent && hasFollowingContent && gapHadComment) {
        continue;
      }
      for (let k = start; k < i; k++) {
        if (!isWorkoutStarCommentLine(rawLines[k]) && !isQuotedCommentLine(rawLines[k])) {
          out.push(rawLines[k]);
        }
      }
    } else {
      out.push(line);
      i++;
    }
  }
  return out;
}

function parseMetersInText(text: string): number {
  let total = 0;
  const cleanedText = removeParentheticalContent(text);
  const rawLines = collapseCommentGapsBetweenContent(cleanedText.split(/\r?\n/));
  const lines: string[] = [];
  for (const line of rawLines) {
    if (isWorkoutStarCommentLine(line)) continue;
    if (isQuotedCommentLine(line)) continue;
    let s = line;
    if (s.includes("*") && s.includes("+")) s = s.slice(0, s.indexOf("+"));
    lines.push(s.replace(/\*[^*]*/g, " ").trim());
  }

  // First: handle "Nx" block multipliers (e.g. "2x" followed by block of content)
  const processedLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Match "2x" or "2x[" at start of line (block multiplier)
    const blockStartStrict = line.match(/^\s*(\d+)\s*[xX]\s*(\[)?\s*$/);
    if (blockStartStrict) {
      const multiplier = parseInt(blockStartStrict[1], 10);
      let useBracket = !!blockStartStrict[2];
      const blockLines: string[] = [];
      i++;
      // If "2x" without bracket, check if next non-empty line is "[" (bracket on own line)
      if (!useBracket && i < lines.length) {
        let peek = i;
        while (peek < lines.length && lines[peek].trim() === "") peek++;
        if (peek < lines.length && /^\s*\[\s*$/.test(lines[peek])) {
          useBracket = true;
          i = peek + 1; // skip the "[" line
        }
      }
      while (i < lines.length) {
        const blockLine = lines[i];
        if (useBracket && blockLine.includes("]")) {
          blockLines.push(blockLine.replace(/\].*$/, "").replace(/^\s*\]/, "").trim());
          i++;
          break;
        }
        if (!useBracket && blockLine.trim() === "") break;
        if (blockLine.trim() !== "") {
          blockLines.push(blockLine);
        }
        i++;
      }
      const blockMeters = parseMetersInText(blockLines.join("\n"));
      total += blockMeters * multiplier;
      continue;
    }
    // Match "2x[" with content on same line (e.g. "2x[ 50 dive")
    const blockWithContent = line.match(/^\s*(\d+)\s*[xX]\s*\[\s*(.*)$/);
    if (blockWithContent) {
      const multiplier = parseInt(blockWithContent[1], 10);
      const blockLines: string[] = [];
      const restOfLine = blockWithContent[2].trim();
      if (restOfLine) blockLines.push(restOfLine);
      i++;
      while (i < lines.length) {
        const blockLine = lines[i];
        if (blockLine.includes("]")) {
          blockLines.push(blockLine.replace(/\].*$/, "").replace(/^\s*\]/, "").trim());
          i++;
          break;
        }
        if (blockLine.trim() !== "") {
          blockLines.push(blockLine);
        }
        i++;
      }
      const blockMeters = parseMetersInText(blockLines.join("\n"));
      total += blockMeters * multiplier;
      continue;
    }
    processedLines.push(stripLineBracketNotes(removeParentheticalContent(line)));
    i++;
  }

  const remainingText = processedLines.join("\n");

  // Second: extract "N×M" patterns (e.g. 8×100, 4×50, 2x100)
  const repeatMatches = [...remainingText.matchAll(REPEAT_PATTERN)];
  for (const m of repeatMatches) {
    total += parseInt(m[1], 10) * parseInt(m[2], 10);
  }

  let textWithoutRepeats = remainingText.replace(REPEAT_PATTERN, " ");

  // Use text with repeats removed for standalone - so "200 free 2x100" gives us "200 free " to parse
  // Exclude lines starting with * (notes/instructions like "*100 better than warm up")
  const textLines = textWithoutRepeats.split(/\r?\n/);
  const linesForStandalone = textLines.filter((line) => !/^\s*\*/.test(line));
  let textForStandalone = linesForStandalone.join("\n");
  // Remove "word: number" patterns to avoid counting descriptive numbers (e.g. "odds: 25 swim, evens: 35 swim")
  textForStandalone = textForStandalone.replace(/\b[a-zA-Z]+\s*:\s*\d+/g, " ");
  textForStandalone = textForStandalone.replace(/\bp\d+(?:\/\d+)?\b/gi, " ");
  textForStandalone = textForStandalone.replace(/\b\d+p\b/gi, " ");
  textForStandalone = textForStandalone.replace(/\b\d+\s*meters?\b/gi, " ");
  textForStandalone = textForStandalone.replace(/\b\d+\s*[my]\b/gi, " ");
  textForStandalone = textForStandalone.replace(/@[^\n]*|\d+(?=[\u2018\u2019\u201c\u201d'"])|(?<=[\u2018\u2019\u201c\u201d'"])\d+/g, " ");
  textForStandalone = textForStandalone.replace(/\bon\s+\d+["']?\s*/gi, " ");
  /* Same-line only: \s* must not match \n or "c/\n100" eats the next line's distance. */
  textForStandalone = textForStandalone.replace(/\bc\/[ \t]*\S+/gi, " ");
  textForStandalone = textForStandalone.replace(/\d+:\d{2}(?:\d)?/g, " ");

  // Third: extract "N:" at start of line (e.g. "25: swim @80%")
  const leadingMatches = [...textForStandalone.matchAll(LEADING_DISTANCE_PATTERN)];
  for (const m of leadingMatches) {
    total += parseInt(m[1], 10);
  }
  let textAfterLeading = textForStandalone.replace(LEADING_DISTANCE_PATTERN, " ");

  // Fourth: extract standalone distances (e.g. 200 free, 400, 25 easy)
  const standaloneMatches = [...textAfterLeading.matchAll(STANDALONE_DISTANCE_PATTERN)];
  for (const m of standaloneMatches) {
    total += parseInt(m[1], 10);
  }

  // Fifth: add meters from out/in or ida/vuelta
  total += parseOutInMeters(remainingText);

  return total;
}

export function lineIsWorkoutSetHeader(line: string): boolean {
  return findSetName(line) !== null;
}

export function splitWorkoutSetTitleLine(line: string): { leading: string; title: string; rest: string } | null {
  const trimmedFull = line.trim();
  const parsed = parseSetHeadLine(trimmedFull);
  if (!parsed) return null;
  return {
    leading: line.match(/^\s*/)![0],
    title: trimmedFull.slice(0, parsed.titleEnd),
    rest: trimmedFull.slice(parsed.titleEnd),
  };
}

function findSetName(line: string): string | null {
  return parseSetHeadLine(line.trim())?.name ?? null;
}

export function analyzeWorkout(content: string): WorkoutAnalysis {
  const sets: WorkoutSet[] = [];
  const normalized = stripWorkoutInlineMarkers(content);
  const lines = normalized.split(/\r?\n/);

  let currentSetName = "Workout";
  let currentSetLines: string[] = [];

  for (const line of lines) {
    const head = parseSetHeadLine(line.trim());
    if (head) {
      // Save previous set
      if (currentSetLines.length > 0) {
        const setText = currentSetLines.join("\n");
        const meters = parseMetersInText(setText);
        if (meters > 0) {
          sets.push({ name: currentSetName, meters });
        }
      }
      currentSetName = head.name;
      const restOfLine = line.trim().slice(head.titleEnd).replace(/^\s*:\s*/, "").trim();
      currentSetLines = restOfLine ? [restOfLine] : [];
    } else {
      // Include empty lines so parseMetersInText can use them (e.g. "2x" breaks on empty line)
      currentSetLines.push(line);
    }
  }

  // Save last set
  if (currentSetLines.length > 0) {
    const setText = currentSetLines.join("\n");
    const meters = parseMetersInText(setText);
    if (meters > 0) {
      sets.push({ name: currentSetName, meters });
    }
  }

  const totalMeters = sets.reduce((sum, s) => sum + s.meters, 0);
  const estimatedDurationMinutes = totalMeters > 0 ? Math.round(totalMeters / 50) : 0;

  return { totalMeters, sets, estimatedDurationMinutes };
}
