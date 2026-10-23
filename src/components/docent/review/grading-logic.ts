/**
 * Pure helpers for the Nakijken and Resultaten views (no React, no DOM), so
 * the rules are unit-tested in grading-logic.test.ts.
 */

/**
 * Answers that still wait for the teacher, over every submitted attempt of
 * the afname (practice afnames can have several per student). This is the
 * number the Nakijken tab, its question tabs and the teacher dashboard show,
 * so the Resultaten tab uses it too instead of counting only the attempt it
 * shows per student.
 */
export function pendingReviewTotal(
  questions: readonly { needsReview: number }[],
): number {
  return questions.reduce((sum, q) => sum + q.needsReview, 0);
}

/** Per question: how many answers still wait for the teacher. */
export function pendingReviewByQuestion(
  questions: readonly { id: string; needsReview: number }[],
): Map<string, number> {
  return new Map(questions.map((q) => [q.id, q.needsReview]));
}

/**
 * How many handed-in attempts "Opnieuw nakijken" will regrade, as far as the
 * Resultaten page knows: it only has the attempt shown per student, so the
 * number is exact only when nobody started more than once. `null` otherwise
 * (the dialog then says "alle ingeleverde pogingen" without a number).
 */
export function regradeCount(
  rows: readonly { attemptCount: number }[],
  submitted: number,
): number | null {
  return rows.every((r) => r.attemptCount <= 1) ? submitted : null;
}

export type IdenticalAnswers = {
  /** Identical answers without a manual score: a bulk save may grade these. */
  ungraded: string[];
  /** Identical answers the teacher already scored: never overwritten in bulk. */
  graded: string[];
};

/**
 * The other answers to this question with exactly the same content as the
 * current one ("Ook toepassen op N gelijke antwoorden"). Answers that already
 * have a manual score are kept apart, so grading a group never silently
 * replaces a score the teacher gave earlier.
 */
export function identicalAnswers(
  items: readonly { answerId: string; manualScore: number | null }[],
  currentId: string | undefined,
  keyOf: (answerId: string) => string,
): IdenticalAnswers {
  const out: IdenticalAnswers = { ungraded: [], graded: [] };
  if (!currentId) return out;
  const key = keyOf(currentId);
  if (!key) return out;
  for (const item of items) {
    if (item.answerId === currentId || keyOf(item.answerId) !== key) continue;
    (item.manualScore == null ? out.ungraded : out.graded).push(item.answerId);
  }
  return out;
}

/**
 * After moving to another student:
 * - "always" (after saving, or with Alt+↑/↓): focus the new student's name,
 *   so a screen reader announces who is next and the shortcuts keep working.
 * - "if-lost" (the Vorige/Volgende buttons): only when the focused control
 *   disappeared or became disabled; otherwise focus stays on the button, so
 *   the teacher can press it again.
 */
export type FocusRequest = "always" | "if-lost";

/** Duck-typed so the rule is testable without a DOM. */
type FocusedElement = {
  isConnected: boolean;
  matches?: (selector: string) => boolean;
};

/** True when keyboard focus fell back to the page (or a disabled control). */
export function focusWasLost(
  active: FocusedElement | null | undefined,
  body: unknown,
): boolean {
  if (!active || active === body || !active.isConnected) return true;
  return active.matches?.(":disabled") ?? false;
}

export function shouldMoveFocus(
  request: FocusRequest | null,
  active: FocusedElement | null | undefined,
  body: unknown,
): boolean {
  if (!request) return false;
  return request === "always" || focusWasLost(active, body);
}

/** The index to go to, kept within 0 … `length` (`length` = the done panel). */
export function clampIndex(next: number, length: number): number {
  return Math.max(0, Math.min(next, length));
}
