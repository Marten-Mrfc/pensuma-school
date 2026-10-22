/**
 * Score → Dutch grade (1,0 – 10,0) with a configurable scale.
 * Pure module: used by the server (results, exports) and the UI (previews).
 *
 *  - linear  1 + 9 × score/max (the classic formula)
 *  - cesuur  passPercentage % of the points gives a 5,5; linear on both sides
 *  - nterm   the CvTE formula 9 × score/max + N with its bounds
 */
import type { AssignmentSettings } from "@/lib/questions/schema";

export type GradingScale = AssignmentSettings["grading"];

export const LINEAR_SCALE: GradingScale = {
  method: "linear",
  passPercentage: 55,
  nTerm: 1,
};

/**
 * Same rounding as the original `dutchGrade` (one decimal, half up on the
 * floating-point value), so existing grades do not change.
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Grade for `score` out of `max`; null when there is no maximum. */
export function computeGrade(
  score: number,
  max: number,
  scale: GradingScale = LINEAR_SCALE,
): number | null {
  if (!(max > 0)) return null;
  const raw = score / max;
  const r = Number.isFinite(raw) ? clamp(raw, 0, 1) : 0;
  let grade: number;
  switch (scale.method) {
    case "cesuur": {
      const p = clamp(scale.passPercentage / 100, 0.01, 0.99);
      grade = r < p ? 1 + (4.5 * r) / p : 5.5 + (4.5 * (r - p)) / (1 - p);
      break;
    }
    case "nterm": {
      const n = scale.nTerm;
      grade = 9 * r + n;
      if (n > 1) grade = Math.min(grade, 1 + 18 * r, 10 - 4.5 * (1 - r));
      if (n < 1) grade = Math.max(grade, 1 + 4.5 * r, 10 - 18 * (1 - r));
      break;
    }
    default:
      grade = 1 + 9 * r;
  }
  return clamp(round1(grade), 1, 10);
}

const decimal = (value: number, minimumFractionDigits = 0) =>
  new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);

/** Short Dutch description, e.g. "Cesuur: 55% van de punten = 5,5". */
export function describeScale(scale: GradingScale): string {
  switch (scale.method) {
    case "cesuur":
      return `Cesuur: ${decimal(scale.passPercentage)}% van de punten = 5,5`;
    case "nterm":
      return `N-term: ${decimal(scale.nTerm, 1)}`;
    default:
      return "Lineair: 1 + 9 × score/max";
  }
}

/**
 * Grades at a few percentages of the maximum score, for a preview table.
 * The default includes the cesuur percentage; duplicates are removed.
 */
export function gradeTable(
  scale: GradingScale,
  percentages: number[] = [0, 25, 50, scale.passPercentage, 75, 100],
): { percentage: number; grade: number }[] {
  const unique = [...new Set(percentages)].sort((a, b) => a - b);
  return unique.map((percentage) => ({
    percentage,
    grade: computeGrade(percentage, 100, scale) ?? 1,
  }));
}
