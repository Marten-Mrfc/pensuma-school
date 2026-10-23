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
import {
  type GradeBatchOptions,
  gradeCode,
  gradeCodeBatch,
} from "@/server/grader";
import { isGraderUnavailable } from "@/server/grader/errors";
import { logServerError } from "@/server/privacy/error-log";

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
 * When the grader itself is unavailable (no free slot in time, sandboxes
 * that don't start) nothing is stored for the code answers: they stay
 * ungraded, the attempt stays "pending" and grading is retried later. Only
 * problems with one specific answer become "internal_error" / needs_review.
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
        const result = await gradeCode(
          {
            code,
            tests: data.tests,
            checks: data.checks,
            timeLimitMs: data.timeLimitMs,
          },
          { throwWhenUnavailable: true },
        );
        if (result.status === "internal_error") {
          return { status: reviewStatus, autoScore: null, result };
        }
        return {
          status: "graded",
          autoScore: codeScore(result.fraction, points, data.hints, hintsUsed),
          result,
        };
      } catch (err) {
        // Not this answer's fault: the caller keeps the previous state.
        if (isGraderUnavailable(err)) throw err;
        logServerError("grading.grade_code_failed", err);
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

/**
 * Grade one answer (code → server grader, MC → auto, open → needs review).
 * Throws (and stores nothing) when the grader is unavailable.
 */
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

/**
 * Background grading (after a hand-in, sweeps, retries): wait for a grader
 * slot as long as needed, behind interactive runs, and defer instead of
 * storing "internal_error" when the grader is unavailable.
 */
const BACKGROUND_GRADING: GradeBatchOptions = {
  queueTimeoutMs: null,
  priority: "background",
  throwWhenUnavailable: true,
};
/** Someone waits for the result (teacher regrade): normal queue timeout. */
const INTERACTIVE_GRADING: GradeBatchOptions = { throwWhenUnavailable: true };

/** Waits before retrying deferred grading; the last one repeats. */
const DEFAULT_RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000];
/** A "scheduled" mark older than this is ignored (its task never started). */
const SCHEDULED_MARK_TTL_MS = 15 * 60_000;

type RetryState = {
  count: number;
  timer: ReturnType<typeof setTimeout> | null;
};

// Process-wide state on globalThis: it survives dev hot reloads and is
// shared by every bundle (instrumentation and routes load their own copy of
// this module).
const globalForGrading = globalThis as unknown as {
  gradingInFlight?: Map<string, Promise<void>>;
  gradingScheduled?: Map<string, number>;
  gradingRetries?: Map<string, RetryState>;
  gradingUserChains?: Map<string, Promise<void>>;
  gradingRetryDelaysMs?: number[];
};
globalForGrading.gradingInFlight ??= new Map();
globalForGrading.gradingScheduled ??= new Map();
globalForGrading.gradingRetries ??= new Map();
globalForGrading.gradingUserChains ??= new Map();
/** Attempts currently being graded by this server process. */
const inFlight = globalForGrading.gradingInFlight;
/** Attempts whose grading will start soon (attemptId → since, ms). */
const scheduled = globalForGrading.gradingScheduled;
/** Attempts whose grading was deferred and waits for a retry. */
const retries = globalForGrading.gradingRetries;
/** Per student: the tail of their grading jobs (one sandbox job at a time). */
const userChains = globalForGrading.gradingUserChains;

/**
 * True while this process grades the attempt, is about to (scheduled), or
 * waits to retry it. Sweeps and self-healing leave such attempts alone.
 */
export function isGradingInFlight(attemptId: string): boolean {
  if (inFlight.has(attemptId)) return true;
  if (retries.get(attemptId)?.timer) return true;
  const since = scheduled.get(attemptId);
  if (since === undefined) return false;
  if (Date.now() - since < SCHEDULED_MARK_TTL_MS) return true;
  scheduled.delete(attemptId);
  return false;
}

/** Note that grading of the attempt starts soon (e.g. in `after()`). */
export function markGradingScheduled(attemptId: string): void {
  scheduled.set(attemptId, Date.now());
}

/** Tests only: shorter retry delays (`null` restores the defaults). */
export function setGradingRetryDelaysForTests(delaysMs: number[] | null): void {
  globalForGrading.gradingRetryDelaysMs = delaysMs ?? undefined;
}

/**
 * Thrown by `gradeAttempt` when the attempt could not be graded completely:
 *  - "grader_unavailable": nothing was stored for the code answers, the
 *    attempt stays "pending" and a retry is scheduled;
 *  - "internal_error": some answers ended with an internal error and wait
 *    for the teacher (needs_review).
 * Use `isGradingIncomplete` (works across module copies) to recognise it.
 */
export class GradingIncompleteError extends Error {
  readonly gradingIncomplete = true as const;

  constructor(
    readonly attemptId: string,
    readonly reason: "grader_unavailable" | "internal_error",
    detail: string,
    /** internal_error: how many answers now wait for the teacher. */
    readonly answerCount?: number,
  ) {
    super(`grading of attempt ${attemptId} incomplete (${reason}): ${detail}`);
    this.name = "GradingIncompleteError";
  }
}

export function isGradingIncomplete(
  err: unknown,
): err is GradingIncompleteError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { gradingIncomplete?: unknown }).gradingIncomplete === true
  );
}

/**
 * Log a failed background grading run: an expected incomplete run (grader
 * busy, internal error) as one warning line, anything else as an error
 * line without the error's database parameters (see error-log.ts).
 */
export function logGradingFailure(attemptId: string, err: unknown): void {
  if (isGradingIncomplete(err)) {
    console.warn(
      JSON.stringify({
        level: "warn",
        ts: new Date().toISOString(),
        event: "grading.incomplete",
        attemptId,
        reason: err.reason,
        ...(err.answerCount ? { answers: err.answerCount } : {}),
      }),
    );
  } else {
    logServerError("grading.attempt_failed", err, { attemptId });
  }
}

/**
 * Postgres jsonb can't store U+0000, and a student's program may print it:
 * replace it in every string, or the result could never be saved.
 */
function jsonbSafe<T>(value: T): T {
  if (typeof value === "string")
    return (
      value.includes("\u0000") ? value.replaceAll("\u0000", "\uFFFD") : value
    ) as T;
  if (Array.isArray(value)) return value.map(jsonbSafe) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, jsonbSafe(v)]),
    ) as T;
  return value;
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
      result: outcome.result ? jsonbSafe(outcome.result) : null,
      maxScore,
      gradedAt: new Date(),
    })
    .where(eq(answers.id, answerId));
}

/**
 * `saveOutcome` with one retry. If both fail the answer stays ungraded, so
 * the attempt stays "pending" and the stale-pending sweep grades it again.
 */
async function saveOutcomeWithRetry(
  answerId: string,
  outcome: GradeOutcome,
  maxScore: number,
): Promise<void> {
  try {
    await saveOutcome(answerId, outcome, maxScore);
  } catch (first) {
    // The query parameters hold the student's output: never log them.
    logServerError("grading.save_answer_retry", first, { answerId });
    await saveOutcome(answerId, outcome, maxScore).catch((err) =>
      logServerError("grading.save_answer_failed", err, { answerId }),
    );
  }
}

/**
 * Run `fn` when the student has no other grading job running: one student
 * can never occupy more than one grader slot (several practice attempts,
 * code that never ends), so the rest of the class keeps getting graded.
 */
async function oneJobPerStudent<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = userChains.get(userId) ?? Promise.resolve();
  let release = () => {};
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => done);
  userChains.set(userId, tail);
  try {
    await previous;
    return await fn();
  } finally {
    release();
    if (userChains.get(userId) === tail) userChains.delete(userId);
  }
}

type AttemptGradingSummary = {
  /** Set when the grader was unavailable: why grading was deferred. */
  deferred: string | null;
  /** Answers that ended with an internal error and wait for the teacher. */
  internalErrors: number;
};

/**
 * Grade a whole attempt. All code answers of the attempt go to the grader in
 * ONE sandbox job (`gradeCodeBatch`): isolation is needed between students,
 * not between one student's own questions, and one job is ~50x faster than a
 * fresh sandbox per question.
 */
async function gradeAttemptNow(
  attemptId: string,
  grading: GradeBatchOptions,
): Promise<AttemptGradingSummary> {
  const [attempt] = await db
    .select({ assignmentId: attempts.assignmentId, userId: attempts.userId })
    .from(attempts)
    .where(eq(attempts.id, attemptId));
  if (!attempt) return { deferred: null, internalErrors: 0 };
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

  let internalErrors = 0;
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
      logServerError("grading.answer_failed", err, {
        attemptId,
        answerId: answer.id,
      });
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
      if (applied.outcome.status === "needs_review") internalErrors++;
      await saveOutcome(answer.id, applied.outcome, applied.maxScore).catch(
        () => {},
      );
    }
  }

  if (codeJobs.length > 0) {
    let results: CodeGradingResult[] | null = null;
    let failure: string | null = null;
    try {
      results = await oneJobPerStudent(attempt.userId, () =>
        gradeCodeBatch(
          codeJobs.map((j) => j.input),
          grading,
        ),
      );
    } catch (err) {
      if (isGraderUnavailable(err)) {
        // Not the student's fault: store nothing for the code answers (they
        // stay ungraded, the attempt stays "pending") and try again later.
        await recomputeAttemptScore(attemptId);
        return { deferred: err.message, internalErrors };
      }
      logServerError("grading.batch_failed", err, { attemptId });
      failure =
        err instanceof Error ? err.message : "Onbekende fout in de nakijker";
    }
    await Promise.all(
      codeJobs.map((job, i) => {
        const result = results?.[i];
        const failed = !result || result.status === "internal_error";
        const outcome: GradeOutcome = failed
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
        // Counts when it waits for the teacher (not dropped, no manual score).
        if (failed && applied.outcome.status === "needs_review")
          internalErrors++;
        return saveOutcomeWithRetry(
          job.answerId,
          applied.outcome,
          applied.maxScore,
        );
      }),
    );
  }

  await recomputeAttemptScore(attemptId);
  return { deferred: null, internalErrors };
}

function clearRetry(attemptId: string): void {
  const state = retries.get(attemptId);
  if (state?.timer) clearTimeout(state.timer);
  retries.delete(attemptId);
}

/** Try a deferred attempt again later (backoff; the last delay repeats). */
function scheduleRetry(attemptId: string): void {
  const delays =
    globalForGrading.gradingRetryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const state = retries.get(attemptId) ?? { count: 0, timer: null };
  if (state.timer) clearTimeout(state.timer);
  const delay = delays[Math.min(state.count, delays.length - 1)];
  state.count++;
  state.timer = setTimeout(() => {
    state.timer = null;
    void retryDeferred(attemptId);
  }, delay);
  state.timer.unref?.();
  retries.set(attemptId, state);
}

async function retryDeferred(attemptId: string): Promise<void> {
  try {
    const [row] = await db
      .select({ status: attempts.status })
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    if (row?.status !== "submitted") {
      clearRetry(attemptId);
      return;
    }
    await gradeAttempt(attemptId);
  } catch (err) {
    logGradingFailure(attemptId, err);
  }
}

/**
 * Grade every answer of an attempt, then recompute its total score.
 * Safe to call more than once: calls for the same attempt are serialised and
 * every run overwrites the previous automatic scores.
 *
 * Runs in the background by default (waits for a free grader slot as long
 * as needed); `interactive` is for a teacher waiting on the result.
 * Rejects with GradingIncompleteError when grading had to be deferred (a
 * retry is scheduled) or some answers ended with an internal error.
 */
export async function gradeAttempt(
  attemptId: string,
  options: { interactive?: boolean } = {},
): Promise<void> {
  scheduled.delete(attemptId);
  const grading = options.interactive
    ? INTERACTIVE_GRADING
    : BACKGROUND_GRADING;
  let summary: AttemptGradingSummary | undefined;
  const previous = inFlight.get(attemptId);
  const run = (previous ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      summary = await gradeAttemptNow(attemptId, grading);
    });
  inFlight.set(attemptId, run);
  try {
    await run;
  } finally {
    if (inFlight.get(attemptId) === run) inFlight.delete(attemptId);
  }
  if (summary?.deferred) {
    scheduleRetry(attemptId);
    throw new GradingIncompleteError(
      attemptId,
      "grader_unavailable",
      `${summary.deferred} (retry scheduled)`,
    );
  }
  clearRetry(attemptId);
  if (summary && summary.internalErrors > 0) {
    throw new GradingIncompleteError(
      attemptId,
      "internal_error",
      `${summary.internalErrors} answer(s) could not be graded automatically`,
      summary.internalErrors,
    );
  }
}

/**
 * Grade attempts in the background, `concurrency` at a time. They count as
 * in flight (`isGradingInFlight`) right away. Never throws.
 */
export async function gradeAttemptsInBackground(
  attemptIds: readonly string[],
  concurrency = 2,
): Promise<{ graded: string[]; failed: string[] }> {
  const queue = [...new Set(attemptIds)];
  for (const id of queue) markGradingScheduled(id);
  const graded: string[] = [];
  const failed: string[] = [];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        await gradeAttempt(id);
        graded.push(id);
      } catch (err) {
        failed.push(id);
        logGradingFailure(id, err);
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, queue.length)) },
      worker,
    ),
  );
  return { graded, failed };
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
      logServerError("grading.regrade_answer_failed", err, { answerId: id });
    }
  }
  return {
    rescored,
    regraded: fallback.length,
    attemptIds: [...new Set(rows.map((r) => r.attempt.id))],
  };
}
