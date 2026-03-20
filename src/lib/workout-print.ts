import { parseISO } from "date-fns";
import { jsPDF } from "jspdf";
import type { Workout, SwimmerProfile } from "./types";
import { assignmentLabel, assignedToNames } from "./workouts";
import {
  GROUP_KEYS,
  getCategoryLabel,
  getPoolLabel,
  formatPdfWorkoutHeaderDate,
  type Locale,
  type TranslationKey,
} from "./i18n";

export type WorkoutPrintSection = {
  headerLine1: string;
  assigneeLine: string;
  categoryPoolLine: string;
  assignedLine: string | null;
  content: string;
};

type T = (key: TranslationKey, params?: Record<string, string>) => string;

export type BuildWorkoutPdfContext = {
  locale: Locale;
  teamName: string | null | undefined;
  appTitle: string;
};

function workoutDate(w: Workout): Date {
  const d = w.date?.slice(0, 10);
  if (!d) return new Date();
  const parsed = parseISO(`${d}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function buildWorkoutPrintSections(
  workouts: Workout[],
  swimmers: SwimmerProfile[],
  t: T,
  ctx: BuildWorkoutPdfContext,
): WorkoutPrintSection[] {
  const withContent = workouts.filter((w) => w.content?.trim());
  const multi = withContent.length > 1;
  const teamOrApp = ctx.teamName?.trim() || ctx.appTitle;

  return withContent.map((w, i) => {
    const raw = assignmentLabel(w, swimmers);
    const label = raw && raw in GROUP_KEYS ? t(GROUP_KEYS[raw]) : raw;
    const assigneeLine =
      (label && String(label).trim()) ||
      (multi ? t("main.workoutN", { n: String(i + 1) }) : "");

    const when = formatPdfWorkoutHeaderDate(workoutDate(w), w.session, ctx.locale, t);
    const headerLine1 = `${teamOrApp} — ${when}`;

    const parts: string[] = [];
    if (w.workout_category?.trim()) parts.push(getCategoryLabel(w.workout_category.trim(), t));
    if (w.pool_size) {
      const pl = getPoolLabel(w.pool_size, t);
      if (pl) parts.push(pl);
    }
    const categoryPoolLine = parts.join(" ");

    const assigned = assignedToNames(w, swimmers);
    const assignedLine = assigned ? `${t("main.assignedTo")} ${assigned}` : null;

    return {
      headerLine1,
      assigneeLine,
      categoryPoolLine,
      assignedLine,
      content: w.content.trim(),
    };
  });
}

function sanitizeFilenameBase(s: string): string {
  const cleaned = s.replace(/[^\w\-.\s\u00C0-\u024F]/gi, "").replace(/\s+/g, "-").trim();
  return cleaned.slice(0, 80) || "workout";
}

const PDF_SIZES = {
  line1: 16,
  line1Leading: 6.8,
  assignee: 11.5,
  assigneeLeading: 5.1,
  meta: 8.5,
  metaLeading: 3.9,
  body: 9,
  bodyLeading: 4.1,
} as const;

const META_RGB: [number, number, number] = [45, 45, 45];

export function downloadWorkoutsPdf(options: {
  sections: WorkoutPrintSection[];
  filenameBase?: string;
}): void {
  const { sections } = options;
  if (sections.length === 0) return;

  const margin = 18;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;

  let y = margin;
  const pageBottom = pageH - margin;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageBottom) {
      doc.addPage();
      y = margin;
    }
  };

  const writeWrapped = (
    text: string,
    fontSize: number,
    font: "helvetica" | "courier" | "times",
    style: "normal" | "bold",
    lineGapMm: number,
    align: "left" | "right" = "left",
  ) => {
    doc.setFont(font, style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxW);
    const x = align === "right" ? pageW - margin : margin;
    for (const line of lines) {
      ensureSpace(lineGapMm);
      doc.text(line, x, y, { baseline: "top", align });
      y += lineGapMm;
    }
  };

  sections.forEach((s, i) => {
    if (i > 0) {
      y += 5;
      ensureSpace(10);
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 10;
    }

    doc.setTextColor(0, 0, 0);
    writeWrapped(s.headerLine1, PDF_SIZES.line1, "helvetica", "bold", PDF_SIZES.line1Leading);
    y += 5;

    if (s.assigneeLine.trim()) {
      writeWrapped(s.assigneeLine.trim(), PDF_SIZES.assignee, "helvetica", "normal", PDF_SIZES.assigneeLeading);
      y += 2;
    }

    doc.setTextColor(...META_RGB);
    if (s.categoryPoolLine.trim()) writeWrapped(s.categoryPoolLine.trim(), PDF_SIZES.meta, "helvetica", "normal", PDF_SIZES.metaLeading);
    if (s.assignedLine?.trim()) writeWrapped(s.assignedLine.trim(), PDF_SIZES.meta, "helvetica", "normal", PDF_SIZES.metaLeading, "right");
    doc.setTextColor(0, 0, 0);
    y += 5;

    for (const para of s.content.split(/\r?\n/)) {
      if (para === "") {
        y += 3;
        ensureSpace(3);
      } else {
        writeWrapped(para, PDF_SIZES.body, "courier", "normal", PDF_SIZES.bodyLeading);
        y += 1;
      }
    }
  });

  doc.save(`${sanitizeFilenameBase(options.filenameBase ?? "workout")}.pdf`);
}
