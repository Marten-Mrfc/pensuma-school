/**
 * Score penalty for revealed hints (code questions). Pure module, used by
 * the grading service and by previews.
 *
 * Each hint has a `penalty`: the fraction (0..1) of the question's points
 * that revealing it costs. The penalties of the revealed hints add up (at
 * most 1) and are subtracted from the earned fraction, never below 0.
 */
import type { CodeHint } from "@/lib/questions/schema";

export type HintUse = { id: string; at?: string };

/** Sum of the penalties of the revealed hints (each hint counts once), max 1. */
export function hintPenaltyFraction(
  hints: readonly Pick<CodeHint, "id" | "penalty">[],
  hintsUsed: readonly HintUse[] | null | undefined,
): number {
  if (!hintsUsed?.length || !hints.length) return 0;
  const used = new Set(hintsUsed.map((h) => h.id));
  let total = 0;
  for (const hint of hints) {
    if (!used.has(hint.id)) continue;
    const p = Number.isFinite(hint.penalty) ? hint.penalty : 0;
    total += Math.min(1, Math.max(0, p));
  }
  return Math.min(1, total);
}

/**
 * The fraction after the hint penalty:
 * max(0, fraction − min(1, Σ penalties of the used hints)).
 * Example: all tests pass (1.0) with one 25% hint → 0.75.
 */
export function applyHintPenalty(
  fraction: number,
  hints: readonly Pick<CodeHint, "id" | "penalty">[],
  hintsUsed: readonly HintUse[] | null | undefined,
): number {
  const base = Number.isFinite(fraction)
    ? Math.min(1, Math.max(0, fraction))
    : 0;
  const adjusted = base - hintPenaltyFraction(hints, hintsUsed);
  // Avoid floating-point noise such as 0.7500000000000001.
  return Math.max(0, Math.round(adjusted * 1e9) / 1e9);
}
