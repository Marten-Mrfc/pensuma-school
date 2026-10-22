import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { applyHintPenalty, type HintUse } from "@/lib/grading/hint-penalty";
import {
  effectiveScore,
  isBlankResponse,
  type NeutralizationMode,
  neutralizedScores,
  round2,
  scoreMultipleChoice,
} from "@/lib/grading/scoring";
import {
  type CodeGradingResult,
  type CodeHint,
  type GradingResult,
  parseQuestionData,
  type QuestionType,
} from "@/lib/questions/schema";
import { db } from "@/server/db";
import {
  answers,
  attempts,
  questionNeutralizations,
  questions,
} from "@/server/db/schema";
import { gradeCode, gradeCodeBatch } from "@/server/grader";

export { effectiveScore, isBlankResponse, scoreMultipleChoice };

/**
 * Grading orchestration: turns stored answers into scores.
 *
 *  - code             → server grader (all tests, hidden ones included)
 *  - multiple_choice  → automatic (all-or-nothing or partial)
 *  - open             → waits for the teacher (needs_review), unless empty
 *
 * Grading never touches `manualScore` / `feedback`: the teacher's override
 * always wins (see `effectiveScore`).
 *
 * Revealed hints cost points on code questions (`applyHintPenalty`), and a
 * question that "vervalt" for an assignment (`question_neutralization`) keeps
 * its neutralised score on every regrade: drop → max 0, full points →
 * autoScore = points.
 */

type AnswerStatus = "empty" | "saved" | "graded" | "needs_review";

type GradeOutcome = {
  status: AnswerStatus;
  autoScore: number | null;
  result: GradingResult | null;
};

function internalErrorResult(message: string): CodeGradingResult {
  return {
    kind: "code",
    status: "internal_error",
    error: {
      type: "InternalError",
      message,
      line: null,
      traceback: "",
    },
    tests: [],
    checks: [],
    passedWeight: 0,
    totalWeight: 0,
    fraction: 0,
    gradedAt: new Date().toISOString(),
  };
}

/** Code answers: the fraction after the hint penalty, as points. */
function codeScore(
  fraction: number,
  points: number,
  hints: readonly CodeHint[],
  hintsUsed: readonly HintUse[] | null | undefined,
): number {
  return round2(applyHintPenalty(fraction, hints, hintsUsed) * points);
}

async function computeOutcome(
  type: QuestionType,
  rawData: unknown,
  response: unknown,
  points: number,
  hasManualScore: boolean,
  hintsUsed: readonly HintUse[] | null = null,
): Promise<GradeOutcome> {
  const gradedAt = new Date().toISOString();
  const reviewStatus: AnswerStatus = hasManualScore ? "graded" : "needs_review";

  switch (type) {
    case "code": {
      const data = parseQuestionData("code", rawData);
      const code =
        typeof (response as { code?: unknown } | null)?.code === "string"
          ? (response as { code: string }).code
          : "";
      if (isBlankResponse("code", response, data.starterCode)) {
        return { status: "graded", autoScore: 0, result: null };
      }
      try {
        const result = await gradeCode({
          code,
          tests: data.tests,
          checks: data.checks,
          timeLimitMs: data.timeLimitMs,
        });
        if (result.status === "internal_error") {
          return { status: reviewStatus, autoScore: null, result };
        }
        return {
          status: "graded",
          autoScore: codeScore(result.fraction, points, data.hints, hintsUsed),
          result,
        };
      } catch (err) {
        console.error("[grading] gradeCode failed", err);
        const message =
          err instanceof Error ? err.message : "Onbekende fout in de nakijker";
        return {
          status: reviewStatus,
          autoScore: null,
          result: internalErrorResult(message),
        };
      }
    }
    case "multiple_choice": {
      const data = parseQuestionData("multiple_choice", rawData);
      const selected = Array.isArray(
        (response as { selected?: unknown } | null)?.selected,
      )
        ? ((response as { selected: unknown[] }).selected.filter(
            (s) => typeof s === "string",
          ) as string[])
        : [];
      const { correct, fraction } = scoreMultipleChoice(data, selected);
      return {
        status: "graded",
        autoScore: round2(fraction * points),
        result: { kind: "multiple_choice", correct, fraction, gradedAt },
      };
    }
    case "open": {
      if (isBlankResponse("open", response)) {
        return { status: "graded", autoScore: 0, result: null };
      }
      return {
        status: reviewStatus,
        autoScore: null,
        result: { kind: "open", needsReview: true, gradedAt },
      };
    }
  }
}

/**
 * Apply a neutralisation ("vraag laten vervallen") to a grading outcome:
 * the grading result is kept for reference, the score follows the mode.
 */
function neutralizeOutcome(
  outcome: GradeOutcome,
  mode: NeutralizationMode | undefined,
  points: number,
): { outcome: GradeOutcome; maxScore: number } {
  const scores = neutralizedScores(mode, points);
  if (!scores) return { outcome, maxScore: points };
  return {
    outcome: {
      status: "graded",
      autoScore: scores.autoScore,
      result: outcome.result,
    },
    maxScore: scores.maxScore,
  };
}

/** Neutralised questions of an assignment: questionId → mode. */
export async function neutralizationModes(
  assignmentId: string,
): Promise<Map<string, NeutralizationMode>> {
  const rows = await db
    .select({
      questionId: questionNeutralizations.questionId,
      mode: questionNeutralizations.mode,
    })
    .from(questionNeutralizations)
    .where(eq(questionNeutralizations.assignmentId, assignmentId));
  return new Map(rows.map((r) => [r.questionId, r.mode]));
}

/** Grade one answer (code → server grader, MC → auto, open → needs review). */
export async function gradeAnswer(answerId: string): Promise<void> {
  const [row] = await db
    .select({
      answer: answers,
      assignmentId: attempts.assignmentId,
      question: {
        type: questions.type,
        data: questions.data,
        points: questions.points,
      },
    })
    .from(answers)
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .innerJoin(attempts, eq(attempts.id, answers.attemptId))
    .where(eq(answers.id, answerId));
  if (!row) throw new Error(`Answer ${answerId} not found`);

  const { answer, question } = row;
  const points = question.points;
  const [neutralization] = await db
    .select({ mode: questionNeutralizations.mode })
    .from(questionNeutralizations)
    .where(
      and(
        eq(questionNeutralizations.assignmentId, row.assignmentId),
        eq(questionNeutralizations.questionId, answer.questionId),
      ),
    );
  const outcome = await computeOutcome(
    question.type,
    question.data,
    answer.response,
    points,
    answer.manualScore != null,
    answer.hintsUsed,
  );
  const applied = neutralizeOutcome(outcome, neutralization?.mode, points);
  await saveOutcome(answerId, applied.outcome, applied.maxScore);
}

/** Recompute attempt.score / maxScore / gradingStatus from its answers. */
export async function recomputeAttemptScore(attemptId: string): Promise<void> {
  const rows = await db
    .select({
      status: answers.status,
      autoScore: answers.autoScore,
      manualScore: answers.manualScore,
      maxScore: answers.maxScore,
      gradedAt: answers.gradedAt,
    })
    .from(answers)
    .where(eq(answers.attemptId, attemptId));

  let score = 0;
  let maxScore = 0;
  let pending = false;
  let needsReview = false;
  for (const a of rows) {
    score += effectiveScore(a);
    maxScore += a.maxScore;
    const ungraded =
      (a.status === "empty" || a.status === "saved") && a.manualScore == null;
    if (ungraded) pending = true;
    if (a.status === "needs_review" && a.manualScore == null)
      needsReview = true;
  }

  await db
    .update(attempts)
    .set({
      score: round2(score),
      maxScore: round2(maxScore),
      gradingStatus: pending
        ? "pending"
        : needsReview
          ? "needs_review"
          : "graded",
    })
    .where(eq(attempts.id, attemptId));
}

/* ----------------------------- Attempt grading ---------------------------- */

const globalForGrading = globalThis as unknown as {
  gradingInFlight?: Map<string, Promise<void>>;
};
/** Attempts currently being graded by this server process. */
const inFlight: Map<string, Promise<void>> = globalForGrading.gradingInFlight ??
new Map();
globalForGrading.gradingInFlight = inFlight;

/** True while this process is grading the attempt. */
export function isGradingInFlight(attemptId: string): boolean {
  return inFlight.has(attemptId);
}

/** Persist a grading outcome on an answer (`maxScore`: 0 for a dropped question). */
async function saveOutcome(
  answerId: string,
  outcome: GradeOutcome,
  maxScore: number,
) {
  await db
    .update(answers)
    .set({
      status: outcome.status,
      autoScore: outcome.autoScore,
      result: outcome.result,
      maxScore,
      gradedAt: new Date(),
    })
    .where(eq(answers.id, answerId));
}

/**
 * Grade a whole attempt. All code answers of the attempt go to the grader in
 * ONE sandbox job (`gradeCodeBatch`): isolation is needed between students,
 * not between one student's own questions, and one job is ~50x faster than a
 * fresh sandbox per question.
 */
async function gradeAttemptNow(attemptId: string): Promise<void> {
  const [attempt] = await db
    .select({ assignmentId: attempts.assignmentId })
    .from(attempts)
    .where(eq(attempts.id, attemptId));
  if (!attempt) return;
  const [rows, neutralized] = await Promise.all([
    db
      .select({
        answer: {
          id: answers.id,
          questionId: answers.questionId,
          response: answers.response,
          manualScore: answers.manualScore,
          hintsUsed: answers.hintsUsed,
        },
        question: {
          type: questions.type,
          data: questions.data,
          points: questions.points,
        },
      })
      .from(answers)
      .innerJoin(questions, eq(questions.id, answers.questionId))
      .where(eq(answers.attemptId, attemptId)),
    neutralizationModes(attempt.assignmentId),
  ]);

  const codeJobs: Array<{
    answerId: string;
    points: number;
    mode: NeutralizationMode | undefined;
    hints: CodeHint[];
    hintsUsed: HintUse[];
    reviewStatus: AnswerStatus;
    input: Parameters<typeof gradeCodeBatch>[0][number];
  }> = [];

  for (const { answer, question } of rows) {
    const mode = neutralized.get(answer.questionId);
    try {
      if (question.type === "code") {
        const data = parseQuestionData("code", question.data);
        if (!isBlankResponse("code", answer.response, data.starterCode)) {
          codeJobs.push({
            answerId: answer.id,
            points: question.points,
            mode,
            hints: data.hints,
            hintsUsed: answer.hintsUsed ?? [],
            reviewStatus:
              answer.manualScore != null ? "graded" : "needs_review",
            input: {
              code: (answer.response as { code: string }).code,
              tests: data.tests,
              checks: data.checks,
              timeLimitMs: data.timeLimitMs,
            },
          });
          continue;
        }
      }
      const outcome = await computeOutcome(
        question.type,
        question.data,
        answer.response,
        question.points,
        answer.manualScore != null,
        answer.hintsUsed,
      );
      const applied = neutralizeOutcome(outcome, mode, question.points);
      await saveOutcome(answer.id, applied.outcome, applied.maxScore);
    } catch (err) {
      console.error(`[grading] answer ${answer.id} failed`, err);
      const applied = neutralizeOutcome(
        {
          status: "needs_review",
          autoScore: null,
          result: internalErrorResult(
            err instanceof Error ? err.message : String(err),
          ),
        },
        mode,
        question.points,
      );
      await saveOutcome(answer.id, applied.outcome, applied.maxScore).catch(
        () => {},
      );
    }
  }

  if (codeJobs.length > 0) {
    let results: CodeGradingResult[] | null = null;
    let failure: string | null = null;
    try {
      results = await gradeCodeBatch(codeJobs.map((j) => j.input));
    } catch (err) {
      console.error(`[grading] batch for attempt ${attemptId} failed`, err);
      failure =
        err instanceof Error ? err.message : "Onbekende fout in de nakijker";
    }
    await Promise.all(
      codeJobs.map((job, i) => {
        const result = results?.[i];
        const outcome: GradeOutcome =
          !result || result.status === "internal_error"
            ? {
                status: job.reviewStatus,
                autoScore: null,
                result:
                  result ??
                  internalErrorResult(
                    failure ?? "Geen resultaat van de nakijker",
                  ),
              }
            : {
                status: "graded",
                autoScore: codeScore(
                  result.fraction,
                  job.points,
                  job.hints,
                  job.hintsUsed,
                ),
                result,
              };
        const applied = neutralizeOutcome(outcome, job.mode, job.points);
        return saveOutcome(
          job.answerId,
          applied.outcome,
          applied.maxScore,
        ).catch((err) =>
          console.error(`[grading] saving answer ${job.answerId} failed`, err),
        );
      }),
    );
  }

  await recomputeAttemptScore(attemptId);
}

/**
 * Grade every answer of an attempt, then recompute its total score.
 * Safe to call more than once: calls for the same attempt are serialised and
 * every run overwrites the previous automatic scores.
 */
export async function gradeAttempt(attemptId: string): Promise<void> {
  const previous = inFlight.get(attemptId);
  const run = (previous ?? Promise.resolve())
    .catch(() => {})
    .then(() => gradeAttemptNow(attemptId));
  inFlight.set(attemptId, run);
  try {
    await run;
  } finally {
    if (inFlight.get(attemptId) === run) inFlight.delete(attemptId);
  }
}

/* ------------------------------ Quick rescoring ---------------------------- */

/**
 * Recompute the automatic scores of submitted answers from what is already
 * stored, without running the sandbox again: code answers reuse their stored
 * grading result (the code cannot change after submitting), multiple choice
 * and open questions are cheap anyway. Answers without a usable code result
 * fall back to `gradeAnswer`. Applies hint penalties and neutralisations.
 * Does not recompute the attempts' totals (call `recomputeAttemptScore`).
 */
export async function rescoreAnswers(
  answerIds: readonly string[],
): Promise<{ rescored: number; regraded: number; attemptIds: string[] }> {
  if (answerIds.length === 0)
    return { rescored: 0, regraded: 0, attemptIds: [] };
  const rows = await db
    .select({
      answer: {
        id: answers.id,
        questionId: answers.questionId,
        response: answers.response,
        manualScore: answers.manualScore,
        hintsUsed: answers.hintsUsed,
        result: answers.result,
      },
      attempt: {
        id: attempts.id,
        status: attempts.status,
        assignmentId: attempts.assignmentId,
      },
      question: {
        type: questions.type,
        data: questions.data,
        points: questions.points,
      },
    })
    .from(answers)
    .innerJoin(attempts, eq(attempts.id, answers.attemptId))
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(inArray(answers.id, [...answerIds]));

  const modesByAssignment = new Map<string, Map<string, NeutralizationMode>>();
  for (const id of new Set(rows.map((r) => r.attempt.assignmentId))) {
    modesByAssignment.set(id, await neutralizationModes(id));
  }

  let rescored = 0;
  const fallback: string[] = [];
  for (const { answer, attempt, question } of rows) {
    if (attempt.status !== "submitted") continue;
    const mode = modesByAssignment
      .get(attempt.assignmentId)
      ?.get(answer.questionId);
    let outcome: GradeOutcome;
    if (question.type === "code") {
      const data = parseQuestionData("code", question.data);
      const stored = answer.result;
      if (isBlankResponse("code", answer.response, data.starterCode)) {
        outcome = { status: "graded", autoScore: 0, result: null };
      } else if (
        stored?.kind === "code" &&
        stored.status !== "internal_error"
      ) {
        outcome = {
          status: "graded",
          autoScore: codeScore(
            stored.fraction,
            question.points,
            data.hints,
            answer.hintsUsed,
          ),
          result: stored,
        };
      } else {
        fallback.push(answer.id);
        continue;
      }
    } else {
      outcome = await computeOutcome(
        question.type,
        question.data,
        answer.response,
        question.points,
        answer.manualScore != null,
        answer.hintsUsed,
      );
    }
    const applied = neutralizeOutcome(outcome, mode, question.points);
    await saveOutcome(answer.id, applied.outcome, applied.maxScore);
    rescored++;
  }
  for (const id of fallback) {
    try {
      await gradeAnswer(id);
    } catch (err) {
      console.error(`[grading] regrading answer ${id} failed`, err);
    }
  }
  return {
    rescored,
    regraded: fallback.length,
    attemptIds: [...new Set(rows.map((r) => r.attempt.id))],
  };
}
