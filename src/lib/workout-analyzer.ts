/**
 * Parses swim workout text to extract total meters and meters per set.
 * Recognizes: fly/fl, back/bk, breast/br, free/fr, uw (underwater)
 */

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
  /^(?:warm[- ]?up|warmup)\s*:?/i,
  /^(?:pre[- ]?set\s+activation|pre[- ]?set|pre\s+set|preset)\s*:?/i,
  /^(?:main\s+set)\s*:?/i,
  /^(?:kick\s+set)\s*:?/i,
  /^(?:pull\s+set)\s*:?/i,
  /^(?:speed\s+set|speed)\s*:?/i,
  /^(?:technique\s+set|tech(?:nique)?\s+set|technique|tech)\s*:?/i,
  /^(?:uw\s+set|underwater\s+set)\s*:?/i,
  /^(?:fins\s+set)\s*:?/i,
  /^(?:warm[- ]?down|warmdown)\s*:?/i,
  /^(?:cool[- ]?down|cooldown)\s*:?/i,
  /^(?:drill(?:s)?)\s*:?/i,
  /^(?:kick(?:s)?)\s*:?/i,
  /^(?:pull(?:s)?)\s*:?/i,
  /^(?:sprint(?:s)?)\s*:?/i,
  /^(?:build(?:s)?)\s*:?/i,
  /^(?:easy|recovery)\s*:?/i,
];

const REPEAT_PATTERN = /(\d+)\s*[×xX]\s*(\d+)/g;
// Matches pool distances (multiples of 25 from 25–9975), optionally followed by m/meters or stroke.
// Lookbehind (?<![:\d]) prevents matching numbers inside time formats like "1:25" or "2:50".
const STANDALONE_DISTANCE_PATTERN = /(?<![:\d])\b(25|50|75|[1-9]\d{0,2}(?:00|25|50|75)|[1-9]\d{3})\s*(?:m|meters?|free|fr|fly|fl|back|bk|breast|br|uw|kick|drill|pull|easy|im)?\b/gi;
// Matches "N:" at start of line (e.g. "25: swim @80%") - require 2+ digits to avoid "1:30" time format
const LEADING_DISTANCE_PATTERN = /^\s*(\d{2,})\s*:/gm;

// Remove parenthetical content to avoid double-counting (e.g. "4x50 (25drill 25easy)") and times (e.g. "2:25")
// Use [^)\n]* so we don't match across newlines—unclosed "25 (" would otherwise consume content until the next ")"
function removeParentheticalContent(text: string): string {
  return text.replace(/\([^)\n]*\)/g, " ");
}

function parseMetersInText(text: string): number {
  let total = 0;
  const cleanedText = removeParentheticalContent(text);
  const textWithAsteriskStripped = cleanedText
    .split(/\r?\n/)
    .map((line) => (/^\s*\*/.test(line) ? "" : line.replace(/\*[^*]*/g, " ").trim()))
    .join("\n");
  const lines = textWithAsteriskStripped.split(/\r?\n/);

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
    processedLines.push(removeParentheticalContent(line));
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
  textForStandalone = textForStandalone.replace(/\bon\s+\d+["']?\s*/gi, " ");
  textForStandalone = textForStandalone.replace(/\bc\/\s*[\d']+(?:["']?\s*)?/gi, " ");
  // Remove time/interval formats (e.g. 1'25", 1:25) so "25" in "1'25"" is not counted as 25m
  textForStandalone = textForStandalone.replace(/\d+[\'']\d+[""]?/g, " ");
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

  return total;
}

function findSetName(line: string): string | null {
  const trimmed = line.trim();
  for (const pattern of SET_NAME_PATTERNS) {
    if (pattern.test(trimmed)) {
      // Return the full label (everything before any colon), not just the regex match,
      // so "Warm Up #2" is preserved instead of being truncated to "Warm Up".
      const colonIdx = trimmed.indexOf(":");
      const fullName = (colonIdx >= 0 ? trimmed.slice(0, colonIdx) : trimmed).trim();
      // Normalize "UW Set" abbreviation to its full name in the analysis output.
      return fullName.replace(/\buw\s+set\b/i, "Underwater Set") || null;
    }
  }
  return null;
}

export function analyzeWorkout(content: string): WorkoutAnalysis {
  const sets: WorkoutSet[] = [];
  const lines = content.split(/\r?\n/);

  let currentSetName = "Workout";
  let currentSetLines: string[] = [];

  for (const line of lines) {
    const setName = findSetName(line);
    if (setName) {
      // Save previous set
      if (currentSetLines.length > 0) {
        const setText = currentSetLines.join("\n");
        const meters = parseMetersInText(setText);
        if (meters > 0) {
          sets.push({ name: currentSetName, meters });
        }
      }
      currentSetName = setName;
      const restOfLine = line.replace(/^[^:]*:?\s*/, "").trim();
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
