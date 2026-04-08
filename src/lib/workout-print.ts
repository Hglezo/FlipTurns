import { parseISO } from "date-fns";
import { jsPDF } from "jspdf";
import type { Workout, SwimmerProfile, SwimmerGroup } from "./types";
import {
  assignmentLabel,
  assignedToNames,
  assignedToCaptionRedundantForWorkout,
  workoutAssigneesAllWithoutTrainingGroup,
} from "./workouts";
import { analyzeWorkout, lineIsWorkoutSetHeader } from "./workout-analyzer";
import { stripWorkoutInlineMarkers } from "./workout-inline-format";
import {
  GROUP_KEYS,
  getCategoryLabel,
  getPoolLabel,
  getSetNameLabel,
  formatPdfWorkoutHeaderDate,
  formatAnalysisDurationMinutes,
  type Locale,
  type TranslationKey,
} from "./i18n";

/** Parsed volume summary for PDF layout (aligned rows, typography). */
export type PdfWorkoutAnalysisBlock = {
  volumeLine: string;
  sets: { label: string; meters: number }[];
  unit: string;
  durationText: string | null;
  numberLocale: string;
};

export type WorkoutPrintSection = {
  headerLine1: string;
  assigneeLine: string;
  categoryPoolLine: string;
  assignedLine: string | null;
  content: string;
  pdfAnalysis: PdfWorkoutAnalysisBlock | null;
};

type T = (key: TranslationKey, params?: Record<string, string>) => string;

export type BuildWorkoutPdfContext = {
  locale: Locale;
  appTitle: string;
  brandName: string | null | undefined;
  viewerRole: "coach" | "swimmer";
  viewerTrainingGroup: SwimmerGroup | null;
};

function pdfHeaderBrand(ctx: BuildWorkoutPdfContext, workout: Workout, swimmers: SwimmerProfile[]): string {
  const fallback = ctx.appTitle;
  const brand = ctx.brandName?.trim();
  if (!brand) return fallback;
  if (ctx.viewerRole === "swimmer") {
    return ctx.viewerTrainingGroup != null ? brand : fallback;
  }
  if (workoutAssigneesAllWithoutTrainingGroup(workout, swimmers)) return fallback;
  return brand;
}

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

  return withContent.map((w, i) => {
    const raw = assignmentLabel(w, swimmers);
    const label = raw && raw in GROUP_KEYS ? t(GROUP_KEYS[raw]) : raw;
    const assigneeLine =
      (label && String(label).trim()) ||
      (multi ? t("main.workoutN", { n: String(i + 1) }) : "");

    const when = formatPdfWorkoutHeaderDate(workoutDate(w), w.session, ctx.locale, t);
    const headerLine1 = `${pdfHeaderBrand(ctx, w, swimmers)} — ${when}`;

    const poolPart = w.pool_size ? getPoolLabel(w.pool_size, t) : "";
    const categoryPart = w.workout_category?.trim() ? getCategoryLabel(w.workout_category.trim(), t) : "";
    const categoryPoolLine =
      ctx.locale === "es-ES"
        ? [categoryPart, poolPart].filter(Boolean).join(" ")
        : [poolPart, categoryPart].filter(Boolean).join(" ");

    const assigned = assignedToNames(w, swimmers);
    const assignedLine =
      assigned && !assignedToCaptionRedundantForWorkout(w, swimmers) ? `${t("main.assignedTo")} ${assigned}` : null;

    const pdfAnalysis = buildPdfAnalysisBlock(w.content.trim(), w.pool_size, t, ctx.locale);

    return {
      headerLine1,
      assigneeLine,
      categoryPoolLine,
      assignedLine,
      content: w.content.trim(),
      pdfAnalysis,
    };
  });
}

function buildPdfAnalysisBlock(
  content: string,
  poolSize: Workout["pool_size"],
  t: T,
  locale: Locale,
): PdfWorkoutAnalysisBlock | null {
  const analysis = analyzeWorkout(content);
  if (analysis.totalMeters <= 0) return null;
  const unit = poolSize === "SCY" ? "yd" : "m";
  const numberLocale = locale === "es-ES" ? "es-ES" : "en-US";
  const volWord = t("feedback.volume").toUpperCase();
  const volumeLine = `${volWord}: ${analysis.totalMeters.toLocaleString(numberLocale)} ${unit}`;
  const sets = analysis.sets.map((s) => ({
    label: getSetNameLabel(s.name, t),
    meters: s.meters,
  }));
  let durationText: string | null = null;
  if (analysis.estimatedDurationMinutes > 0) {
    durationText = `${t("feedback.duration")}: ${formatAnalysisDurationMinutes(analysis.estimatedDurationMinutes, t)}`;
  }
  return { volumeLine, sets, unit, durationText, numberLocale };
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
  analysis: 7,
  analysisLeading: 3.35,
  analysisPad: 2.8,
  /** Blank band after volume line and before duration */
  analysisSectionGap: 3.6,
  analysisDuration: 5.5,
  analysisDurationLeading: 2.65,
  /** Gap after set name before distance (~4–5 character spaces at analysis font size) */
  analysisInlineNumberGapMm: 5,
  /** Hanging indent for soft-wrapped lines in courier body. */
  bodyWrapIndentEm: 3.5,
} as const;

const META_RGB: [number, number, number] = [45, 45, 45];

/** Shared label wrap + one right edge for all set distances (aligned column, small gap after longest last line). */
function computeAnalysisSetLayout(
  doc: jsPDF,
  block: PdfWorkoutAnalysisBlock,
  innerW: number,
  leftX: number,
  fs: number,
  gapMm: number,
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fs);
  const fmtNum = (m: number) => `${m.toLocaleString(block.numberLocale)}${block.unit}`;
  let maxNumW = 10;
  for (const s of block.sets) {
    maxNumW = Math.max(maxNumW, doc.getTextWidth(fmtNum(s.meters)));
  }
  const labelMaxW = Math.max(20, innerW - maxNumW - gapMm);
  let maxLastLineW = 0;
  for (const s of block.sets) {
    const lines = doc.splitTextToSize(s.label, labelMaxW) as string[];
    const last = lines[lines.length - 1] ?? "";
    maxLastLineW = Math.max(maxLastLineW, doc.getTextWidth(last));
  }
  const numRightX = leftX + maxLastLineW + gapMm + maxNumW;
  return { fmtNum, labelMaxW, numRightX };
}

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

  const writeBodyParagraph = (para: string) => {
    const underline = lineIsWorkoutSetHeader(para);
    doc.setFont("courier", "normal");
    doc.setFontSize(PDF_SIZES.body);
    doc.setTextColor(0, 0, 0);
    /** Hanging indent: first line full width; soft-wrapped continuations indented (see split_text_to_size.js textIndent + lineIndent). */
    const wrapIndentMm = doc.getTextWidth("M") * PDF_SIZES.bodyWrapIndentEm;
    const spaceMm = doc.getTextWidth(" ");
    const nSpaces = Math.max(1, Math.round(wrapIndentMm / spaceMm));
    const lineIndentOpt = nSpaces + 1;
    const segments = doc.splitTextToSize(para, maxW, {
      textIndent: -wrapIndentMm,
      lineIndent: lineIndentOpt,
    }) as string[];
    for (const segment of segments) {
      ensureSpace(PDF_SIZES.bodyLeading);
      doc.text(segment, margin, y, { baseline: "top", align: "left" });
      if (underline) {
        const tw = doc.getTextWidth(segment);
        doc.setDrawColor(55, 55, 55);
        doc.setLineWidth(0.12);
        const uy = y + PDF_SIZES.bodyLeading * 0.68;
        doc.line(margin, uy, margin + tw, uy);
      }
      y += PDF_SIZES.bodyLeading;
    }
    y += 1;
  };

  const measurePdfAnalysisBox = (block: PdfWorkoutAnalysisBlock): number => {
    const pad = PDF_SIZES.analysisPad;
    const innerW = maxW - pad * 2;
    const fs = PDF_SIZES.analysis;
    const lead = PDF_SIZES.analysisLeading;
    const gap = PDF_SIZES.analysisSectionGap;
    const dfs = PDF_SIZES.analysisDuration;
    const dlead = PDF_SIZES.analysisDurationLeading;
    const gapMm = PDF_SIZES.analysisInlineNumberGapMm;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(fs);
    const volRows = (doc.splitTextToSize(block.volumeLine, innerW) as string[]).length;
    let contentH = volRows * lead + gap;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fs);
    const leftXM = margin + pad;
    const lay = computeAnalysisSetLayout(doc, block, innerW, leftXM, fs, gapMm);
    for (const s of block.sets) {
      const labelLines = doc.splitTextToSize(s.label, lay.labelMaxW) as string[];
      contentH += labelLines.length * lead;
    }

    if (block.durationText) {
      contentH += gap;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(dfs);
      const dRows = (doc.splitTextToSize(block.durationText, innerW) as string[]).length;
      contentH += dRows * dlead;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fs);
    return contentH + pad * 2;
  };

  const drawPdfAnalysisBox = (block: PdfWorkoutAnalysisBlock) => {
    const boxH = measurePdfAnalysisBox(block);
    if (y + boxH > pageBottom) {
      doc.addPage();
      y = margin;
    }
    const pad = PDF_SIZES.analysisPad;
    const innerW = maxW - pad * 2;
    const leftX = margin + pad;
    const fs = PDF_SIZES.analysis;
    const lead = PDF_SIZES.analysisLeading;
    const gap = PDF_SIZES.analysisSectionGap;
    const dfs = PDF_SIZES.analysisDuration;
    const dlead = PDF_SIZES.analysisDurationLeading;
    const gapMm = PDF_SIZES.analysisInlineNumberGapMm;

    doc.setDrawColor(110, 110, 110);
    doc.setFillColor(248, 248, 248);
    doc.setLineWidth(0.28);
    doc.rect(margin, y, maxW, boxH, "FD");

    let ty = y + pad;
    doc.setTextColor(...META_RGB);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(fs);
    for (const row of doc.splitTextToSize(block.volumeLine, innerW) as string[]) {
      doc.text(row, leftX, ty, { baseline: "top" });
      ty += lead;
    }

    ty += gap;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fs);
    const lay = computeAnalysisSetLayout(doc, block, innerW, leftX, fs, gapMm);

    for (const s of block.sets) {
      const numText = lay.fmtNum(s.meters);
      const labelLines = doc.splitTextToSize(s.label, lay.labelMaxW) as string[];
      for (let li = 0; li < labelLines.length; li++) {
        const line = labelLines[li]!;
        const isLast = li === labelLines.length - 1;
        doc.text(line, leftX, ty, { baseline: "top" });
        if (isLast) {
          doc.text(numText, lay.numRightX, ty, { baseline: "top", align: "right" });
        }
        ty += lead;
      }
    }

    if (block.durationText) {
      ty += gap;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(dfs);
      for (const row of doc.splitTextToSize(block.durationText, innerW) as string[]) {
        doc.text(row, leftX, ty, { baseline: "top" });
        ty += dlead;
      }
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fs);
    doc.setTextColor(0, 0, 0);
    y += boxH + 4;
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
    if (s.assignedLine?.trim()) writeWrapped(s.assignedLine.trim(), PDF_SIZES.meta, "helvetica", "normal", PDF_SIZES.metaLeading);
    doc.setTextColor(0, 0, 0);
    y += 5;

    for (const para of stripWorkoutInlineMarkers(s.content).split(/\r?\n/)) {
      if (para === "") {
        y += 3;
        ensureSpace(3);
      } else {
        writeBodyParagraph(para);
      }
    }

    if (s.pdfAnalysis) {
      drawPdfAnalysisBox(s.pdfAnalysis);
    }
  });

  doc.save(`${sanitizeFilenameBase(options.filenameBase ?? "workout")}.pdf`);
}
