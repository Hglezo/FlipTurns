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
}

const SET_NAME_PATTERNS = [
  /^(?:warm[- ]?up|warmup)\s*:?/i,
  /^(?:pre[- ]?set\s+activation|pre[- ]?set|pre\s+set|preset)\s*:?/i,
  /^(?:main\s+set)\s*:?/i,
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
// Matches pool distances, optionally followed by m/meters or stroke (free, fly, back, etc.)
// Matches pool distances 25–999 and 1000–9999 (e.g. 2500, 1650)
const STANDALONE_DISTANCE_PATTERN = /\b(25|50|75|100|125|150|175|200|250|300|400|500|800|(?:1[0-9]|2[0-9]|[3-9][0-9])\d{2})\s*(?:m|meters?|free|fr|fly|fl|back|bk|breast|br|uw|kick|drill|pull|easy|im)?\b/gi;
// Matches "N:" at start of line (e.g. "25: swim @80%") - require 2+ digits to avoid "1:30" time format
const LEADING_DISTANCE_PATTERN = /^\s*(\d{2,})\s*:/gm;

// Remove parenthetical content to avoid double-counting (e.g. "4x50 (25drill 25easy)") and times (e.g. "2:25")
function removeParentheticalContent(text: string): string {
  return text.replace(/\([^)]*\)/g, " ");
}

function parseMetersInText(text: string): number {
  let total = 0;
  const cleanedText = removeParentheticalContent(text);
  const lines = cleanedText.split(/\r?\n/);

  // First: handle "Nx" block multipliers (e.g. "2x" followed by block of content)
  const processedLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Match "2x" or "2x[" at start of line (block multiplier)
    const blockMatch = line.match(/^\s*(\d+)\s*[xX]\s*(\[)?\s*$/);
    if (blockMatch) {
      const multiplier = parseInt(blockMatch[1], 10);
      const useBracket = !!blockMatch[2];
      const blockLines: string[] = [];
      i++;
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
  // Exclude numbers after "word:" (e.g. "odds: 25 swim" - the 25 is descriptive, not a distance)
  const textLines = textWithoutRepeats.split(/\r?\n/);
  const linesForStandalone = textLines.filter((line) => !/^\s*\*/.test(line));
  let textForStandalone = linesForStandalone.join("\n");
  // Remove "word: number" patterns to avoid counting descriptive numbers (e.g. "odds: 25 swim, evens: 35 swim")
  textForStandalone = textForStandalone.replace(/\b[a-zA-Z]+\s*:\s*\d+/g, " ");

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
    const match = trimmed.match(pattern);
    if (match) {
      return match[0].replace(/:\s*$/, "").trim();
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
    } else if (line.trim()) {
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

  return { totalMeters, sets };
}
