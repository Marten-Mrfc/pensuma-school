import "server-only";

import { eq } from "drizzle-orm";
import {
  type CodeGradingResult,
  type GradingResult,
  type MultipleChoiceData,
  parseQuestionData,
  type QuestionType,
} from "@/lib/questions/schema";
import { db } from "@/server/db";
import { answers, attempts, questions } from "@/server/db/schema";
import { gradeCode } from "@/server/grader";

/**
 * Grading orchestration: turns stored answers into scores.
 *
 *  - code             → server grader (all tests, hidden ones included)
 *  - multiple_choice  → automatic (all-or-nothing or partial)
 *  - open             → waits for the teacher (needs_review), unless empty
 *
 * Grading never touches `manualScore` / `feedback`: the teacher's override
 * always wins (see `effectiveScore`).
 */

/** How many answers of one attempt are graded at the same time. */
const GRADE_CONCURRENCY = 3;

/** Score that counts: the teacher's override wins over the automatic score. */
export function effectiveScore(answer: {
  autoScore: number | null;
  manualScore: number | null;
}): number {
  return answer.manualScore ?? answer.autoScore ?? 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type AnswerStatus = "empty" | "saved" | "graded" | "needs_review";

type GradeOutcome = {
  status: AnswerStatus;
  autoScore: number | null;
  result: GradingResult | null;
};

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
  data: MultipleChoiceData,
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

async function computeOutcome(
  type: QuestionType,
  rawData: unknown,
  response: unknown,
  points: number,
  hasManualScore: boolean,
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
          autoScore: round2(result.fraction * points),
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

/** Grade one answer (code → server grader, MC → auto, open → needs review). */
export async function gradeAnswer(answerId: string): Promise<void> {
  const [row] = await db
    .select({
      answer: answers,
      question: {
        type: questions.type,
        data: questions.data,
        points: questions.points,
      },
    })
    .from(answers)
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(eq(answers.id, answerId));
  if (!row) throw new Error(`Answer ${answerId} not found`);

  const { answer, question } = row;
  const points = question.points;
  const outcome = await computeOutcome(
    question.type,
    question.data,
    answer.response,
    points,
    answer.manualScore != null,
  );

  await db
    .update(answers)
    .set({
      status: outcome.status,
      autoScore: outcome.autoScore,
      result: outcome.result,
      maxScore: points,
      gradedAt: new Date(),
    })
    .where(eq(answers.id, answerId));
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

async function runWithLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++];
        await fn(item);
      }
    },
  );
  await Promise.all(workers);
}

async function gradeAttemptNow(attemptId: string): Promise<void> {
  const rows = await db
    .select({ id: answers.id })
    .from(answers)
    .where(eq(answers.attemptId, attemptId));

  await runWithLimit(rows, GRADE_CONCURRENCY, async ({ id }) => {
    try {
      await gradeAnswer(id);
    } catch (err) {
      console.error(`[grading] answer ${id} failed`, err);
      // Make sure the attempt doesn't stay "pending" forever.
      await db
        .update(answers)
        .set({
          status: "needs_review",
          autoScore: null,
          result: internalErrorResult(
            err instanceof Error ? err.message : String(err),
          ),
          gradedAt: new Date(),
        })
        .where(eq(answers.id, id))
        .catch(() => {});
    }
  });
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
