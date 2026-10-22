/**
 * Scoring with rubric criteria ("beoordelingscriteria") of open questions.
 * Pure module, shared by the score box and the feedback router.
 */

export type RubricCriterion = { id: string; label: string; points: number };

/** Round to two decimals (scores are stored like that). */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The score for the ticked criteria: the sum of their points, clamped to
 * 0..max. Unknown ids are ignored, each criterion counts once.
 */
export function rubricScore(
  items: readonly RubricCriterion[],
  checked: readonly string[],
  max: number,
): number {
  const ticked = new Set(checked);
  let sum = 0;
  for (const item of items) {
    if (ticked.has(item.id) && Number.isFinite(item.points)) sum += item.points;
  }
  const upper = Number.isFinite(max) && max > 0 ? max : 0;
  return round2(Math.min(Math.max(sum, 0), upper));
}

/** Ids in `checked` that are not criteria of this question. */
export function unknownRubricIds(
  items: readonly { id: string }[],
  checked: readonly string[],
): string[] {
  const known = new Set(items.map((i) => i.id));
  return [...new Set(checked)].filter((id) => !known.has(id));
}

/**
 * “✓ Juiste uitleg (1 pt)” / “✗ Voorbeeld (1 pt)” lines for the feedback,
 * in the order of the criteria.
 */
export function rubricFeedbackLines(
  items: readonly RubricCriterion[],
  checked: readonly string[],
  formatPoints: (n: number) => string = (n) =>
    n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }),
): string {
  const ticked = new Set(checked);
  return items
    .map(
      (item) =>
        `${ticked.has(item.id) ? "✓" : "✗"} ${item.label.trim() || "Criterium"} (${formatPoints(item.points)} pt)`,
    )
    .join("\n");
}

/**
 * Put the criteria lines at the top of the feedback, replacing a block of
 * ✓/✗ lines that an earlier click put there.
 */
export function prependRubricFeedback(feedback: string, lines: string): string {
  const all = feedback.split("\n");
  let start = 0;
  while (start < all.length && /^[✓✗] /.test(all[start])) start++;
  if (start > 0 && all[start] === "") start++;
  const rest = all.slice(start).join("\n");
  if (!lines) return rest;
  return rest.trim() ? `${lines}\n\n${rest}` : lines;
}
