/**
 * Pure scoring helpers shared by the grading service (server) and tests.
 * No database or server imports.
 */
import type { MultipleChoiceData, QuestionType } from "@/lib/questions/schema";

/** Round to two decimals (scores are stored with at most two decimals). */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Score that counts: the teacher's override wins over the automatic score. */
export function effectiveScore(answer: {
  autoScore: number | null;
  manualScore: number | null;
}): number {
  return answer.manualScore ?? answer.autoScore ?? 0;
}

/** Is this response blank for its question type? */
export function isBlankResponse(
  type: QuestionType,
  response: unknown,
  starterCode = "",
): boolean {
  const r = (response ?? {}) as Record<string, unknown>;
  switch (type) {
    case "code": {
      const code = typeof r.code === "string" ? r.code : "";
      return code.trim() === "" || code.trim() === starterCode.trim();
    }
    case "multiple_choice":
      return !Array.isArray(r.selected) || r.selected.length === 0;
    case "open":
      return typeof r.text !== "string" || r.text.trim() === "";
  }
}

/** Pure multiple-choice scoring (exported for tests and previews). */
export function scoreMultipleChoice(
  data: Pick<MultipleChoiceData, "options" | "multiple" | "scoring">,
  selectedIds: readonly string[],
): { correct: boolean; fraction: number } {
  const validIds = new Set(data.options.map((o) => o.id));
  const selected = new Set(selectedIds.filter((id) => validIds.has(id)));
  const correctIds = new Set(
    data.options.filter((o) => o.correct).map((o) => o.id),
  );
  const exact =
    selected.size === correctIds.size &&
    [...selected].every((id) => correctIds.has(id));

  if (!data.multiple || data.scoring === "all_or_nothing") {
    return { correct: exact, fraction: exact ? 1 : 0 };
  }
  if (correctIds.size === 0) {
    return { correct: exact, fraction: exact ? 1 : 0 };
  }
  let right = 0;
  let wrong = 0;
  for (const id of selected) {
    if (correctIds.has(id)) right++;
    else wrong++;
  }
  const fraction = Math.max(0, Math.min(1, (right - wrong) / correctIds.size));
  return { correct: exact, fraction };
}

/** How a neutralised question ("vraag laten vervallen") counts. */
export type NeutralizationMode = "full_points" | "drop";

/**
 * Scores of a neutralised question: drop → it no longer counts (max 0,
 * score 0); full points → everybody gets the points. Null when the question
 * is not neutralised.
 */
export function neutralizedScores(
  mode: NeutralizationMode | null | undefined,
  points: number,
): { maxScore: number; autoScore: number } | null {
  if (mode === "drop") return { maxScore: 0, autoScore: 0 };
  if (mode === "full_points") return { maxScore: points, autoScore: points };
  return null;
}
