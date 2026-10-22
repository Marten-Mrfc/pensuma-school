import "server-only";

/**
 * Grading orchestration: turns stored answers into scores.
 * STUB: implemented by the student-portal workstream; used by the
 * assignments/results workstream for regrading and manual overrides.
 */

/** Grade one answer (code → server grader, MC → auto, open → needs review). */
export async function gradeAnswer(_answerId: string): Promise<void> {
  throw new Error("gradeAnswer is not implemented yet");
}

/** Grade every answer of an attempt, then recompute its total score. */
export async function gradeAttempt(_attemptId: string): Promise<void> {
  throw new Error("gradeAttempt is not implemented yet");
}

/** Recompute attempt.score / maxScore / gradingStatus from its answers. */
export async function recomputeAttemptScore(_attemptId: string): Promise<void> {
  throw new Error("recomputeAttemptScore is not implemented yet");
}

/** Score that counts: the teacher's override wins over the automatic score. */
export function effectiveScore(answer: {
  autoScore: number | null;
  manualScore: number | null;
}): number {
  return answer.manualScore ?? answer.autoScore ?? 0;
}
