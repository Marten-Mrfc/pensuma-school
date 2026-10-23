import "server-only";

import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { after } from "next/server";
import { accommodationMinutes } from "@/lib/accommodations";
import { db } from "@/server/db";
import {
  answers,
  type assignments,
  attemptEvents,
  attempts,
  classMembers,
  questions,
  studentAccommodations,
} from "@/server/db/schema";
import { logServerError } from "@/server/privacy/error-log";
import {
  computeAttemptDeadline,
  DEADLINE_GRACE_MS,
  effectiveAssignmentStatus,
  isPastDeadline,
  parseAssignmentSettings,
} from "@/server/services/assignment-status";
import {
  gradeAttempt,
  gradeAttemptsInBackground,
  isGradingInFlight,
  logGradingFailure,
  markGradingScheduled,
} from "@/server/services/grading";

/**
 * Attempt lifecycle helpers (start, submit, auto-submit at the deadline).
 * Used by the student portal router; the teacher side may use `submitAttempt`
 * (force-submit) and `autoSubmitExpiredAttempts` (sweep) as well.
 *
 * Background sweeps (`startAttemptSweeper`, started from instrumentation):
 * every minute, expired attempts are auto-submitted and submitted attempts
 * whose grading was lost (restart, crash) are graded again, so neither
 * depends on a student or teacher opening a page.
 */

type Assignment = typeof assignments.$inferSelect;
type Attempt = typeof attempts.$inferSelect;

/* --------------------------------- Helpers -------------------------------- */

/** Deterministic PRNG (mulberry32) seeded from a string. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle; deterministic when a seed is given. */
export function shuffled<T>(items: readonly T[], seed?: string): T[] {
  const rand = seed ? seededRandom(seed) : Math.random;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Multiple-choice option order for one student (stable per attempt). */
export function optionOrderFor<T extends { id: string }>(
  attemptId: string,
  questionId: string,
  options: readonly T[],
  shuffle: boolean,
): T[] {
  return shuffle
    ? shuffled(options, `${attemptId}:${questionId}`)
    : [...options];
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function isClassMember(
  userId: string,
  classId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: classMembers.userId })
    .from(classMembers)
    .where(
      and(eq(classMembers.classId, classId), eq(classMembers.userId, userId)),
    )
    .limit(1);
  return !!row;
}

/** Ordered question ids of a test. */
export async function testQuestionIds(testId: string): Promise<string[]> {
  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position), asc(questions.createdAt));
  return rows.map((r) => r.id);
}

/* --------------------------------- Grading -------------------------------- */

/**
 * Grade an attempt without blocking the response: inside a request we use
 * Next's `after()`, elsewhere (scripts) the promise simply runs unawaited.
 */
export function scheduleGrading(attemptId: string): void {
  // Counts as in flight from now on, so sweeps don't grade it twice.
  markGradingScheduled(attemptId);
  const task = () =>
    gradeAttempt(attemptId).catch((err) => logGradingFailure(attemptId, err));
  try {
    after(task);
  } catch {
    void task();
  }
}

/* --------------------------------- Submit --------------------------------- */

/**
 * Submit an in-progress attempt (idempotent: only the first call wins) and
 * schedule grading. Returns true when this call submitted the attempt.
 *
 * `atDeadline`: the attempt is submitted because its deadline passed (a
 * sweep, possibly long after); "ingeleverd op" becomes the deadline when
 * that is earlier than now, since no work was accepted after it.
 */
export async function submitAttempt(
  attemptId: string,
  opts: {
    auto?: boolean;
    by?: "student" | "timer" | "server" | "teacher";
    grade?: boolean;
    atDeadline?: boolean;
  } = {},
): Promise<boolean> {
  const now = new Date();
  const [updated] = await db
    .update(attempts)
    .set({
      status: "submitted",
      submittedAt: opts.atDeadline
        ? sql`least(${now.toISOString()}::timestamptz, ${attempts.deadlineAt})`
        : now,
      autoSubmitted: opts.auto ?? false,
      gradingStatus: "pending",
    })
    .where(and(eq(attempts.id, attemptId), eq(attempts.status, "in_progress")))
    .returning({ id: attempts.id });
  if (!updated) return false;

  await db.insert(attemptEvents).values({
    attemptId,
    type: "submitted",
    details: {
      auto: opts.auto ?? false,
      by: opts.by ?? (opts.auto ? "server" : "student"),
    },
    createdAt: now,
  });
  if (opts.grade !== false) scheduleGrading(attemptId);
  return true;
}

type AssignmentWindow = Pick<Assignment, "status" | "opensAt" | "closesAt">;

/**
 * An in-progress attempt is over when its deadline (+ grace) has passed, or,
 * without a deadline, when the assignment has been closed.
 */
export function isAttemptExpired(
  attempt: Pick<Attempt, "status" | "deadlineAt">,
  assignment?: AssignmentWindow | null,
  now = new Date(),
): boolean {
  if (attempt.status !== "in_progress") return false;
  if (attempt.deadlineAt) return isPastDeadline(attempt.deadlineAt, now);
  return (
    !!assignment && effectiveAssignmentStatus(assignment, now) === "closed"
  );
}

/** Auto-submit an in-progress attempt that is over (see `isAttemptExpired`). */
export async function autoSubmitIfExpired(
  attempt: Pick<Attempt, "id" | "status" | "deadlineAt">,
  assignment?: AssignmentWindow | null,
  now = new Date(),
): Promise<boolean> {
  if (!isAttemptExpired(attempt, assignment, now)) return false;
  return submitAttempt(attempt.id, {
    auto: true,
    by: "server",
    atDeadline: attempt.deadlineAt !== null,
  });
}

/**
 * Sweep: auto-submit every expired in-progress attempt (optionally for one
 * assignment). Returns the submitted attempt ids.
 */
export async function autoSubmitExpiredAttempts(
  filter: { assignmentId?: string } = {},
): Promise<string[]> {
  const cutoff = new Date(Date.now() - DEADLINE_GRACE_MS);
  const rows = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.status, "in_progress"),
        isNotNull(attempts.deadlineAt),
        lt(attempts.deadlineAt, cutoff),
        filter.assignmentId
          ? eq(attempts.assignmentId, filter.assignmentId)
          : undefined,
      ),
    );
  const done: string[] = [];
  for (const { id } of rows) {
    if (await submitAttempt(id, { auto: true, by: "server", atDeadline: true }))
      done.push(id);
  }
  return done;
}

/* --------------------------------- Sweeps --------------------------------- */

/** Grading still "pending" this long after submitting counts as lost. */
export const STALE_PENDING_MS = 2 * 60_000;
/**
 * How often one server re-grades the same lost attempt (with growing gaps:
 * 2, 4, 8, 16 min). An attempt that keeps failing is left for the teacher's
 * "Opnieuw nakijken" instead of running every minute forever.
 */
const MAX_SWEEP_REGRADES = 5;
const SWEEP_FIRST_DELAY_MS = 30_000;
const SWEEP_JITTER_MS = 15_000;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Grade submitted attempts whose grading was lost: still "pending" long
 * after submitting and not being graded (or about to be) by this process.
 * Grading runs in the background (2 at a time); returns the attempt ids.
 */
export async function regradeStalePendingAttempts(
  opts: { olderThanMs?: number; limit?: number } = {},
): Promise<string[]> {
  const cutoff = new Date(Date.now() - (opts.olderThanMs ?? STALE_PENDING_MS));
  const rows = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.status, "submitted"),
        eq(attempts.gradingStatus, "pending"),
        isNotNull(attempts.submittedAt),
        lt(attempts.submittedAt, cutoff),
      ),
    )
    .orderBy(asc(attempts.submittedAt))
    .limit(opts.limit ?? 100);
  const now = Date.now();
  const ids = rows
    .map((r) => r.id)
    .filter((id) => !isGradingInFlight(id) && sweepMayRegrade(id, now));
  for (const id of ids) {
    const count = (sweepRegrades.get(id)?.count ?? 0) + 1;
    sweepRegrades.set(id, {
      count,
      nextAt: now + STALE_PENDING_MS * 2 ** (count - 1),
    });
    if (count === MAX_SWEEP_REGRADES)
      sweepLog({
        level: "warn",
        msg: "attempt_sweep_gave_up",
        attemptId: id,
        sweeps: count,
      });
  }
  if (ids.length > 0) void gradeAttemptsInBackground(ids, 2);
  return ids;
}

type SweepRecord = { count: number; nextAt: number };
const globalForSweeps = globalThis as unknown as {
  pensumaSweepRegrades?: Map<string, SweepRecord>;
};
globalForSweeps.pensumaSweepRegrades ??= new Map();
/** Lost attempts this process already re-graded (attemptId → record). */
const sweepRegrades = globalForSweeps.pensumaSweepRegrades;

function sweepMayRegrade(attemptId: string, now: number): boolean {
  const record = sweepRegrades.get(attemptId);
  if (!record) return true;
  return record.count < MAX_SWEEP_REGRADES && now >= record.nextAt;
}

/**
 * One sweep: auto-submit expired attempts, then re-grade lost ones. A
 * Postgres advisory lock makes sure only one server (replica) sweeps at a
 * time; returns null when another one holds it.
 */
export async function runAttemptSweep(): Promise<{
  autoSubmitted: string[];
  regrading: string[];
} | null> {
  return db.transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext('pensuma:attempt-sweep')) as locked`,
    );
    if (lock.rows[0]?.locked !== true) return null;
    const autoSubmitted = await autoSubmitExpiredAttempts();
    const regrading = await regradeStalePendingAttempts();
    return { autoSubmitted, regrading };
  });
}

function sweepLog(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  if (entry.level === "warn") console.warn(line);
  else console.log(line);
}

type SweeperState = { timer: ReturnType<typeof setTimeout> | null };
const globalForSweeper = globalThis as unknown as {
  pensumaAttemptSweeper?: SweeperState;
};

/**
 * Run `runAttemptSweep` every minute (first run 30–45 s after start), once
 * per process. Timers are unref()'d; errors are logged, never thrown.
 */
export function startAttemptSweeper(): void {
  if (globalForSweeper.pensumaAttemptSweeper) return;
  const state: SweeperState = { timer: null };
  globalForSweeper.pensumaAttemptSweeper = state;
  const tick = async () => {
    try {
      const result = await runAttemptSweep();
      if (result && (result.autoSubmitted.length || result.regrading.length)) {
        sweepLog({
          level: "info",
          msg: "attempt_sweep",
          autoSubmitted: result.autoSubmitted.length,
          regrading: result.regrading.length,
        });
      }
    } catch (error) {
      // Never the raw message: a failed query quotes its parameters.
      logServerError("attempt_sweep_failed", error);
    }
  };
  const schedule = (delayMs: number) => {
    state.timer = setTimeout(() => {
      void tick().finally(() => schedule(SWEEP_INTERVAL_MS));
    }, delayMs);
    state.timer.unref?.();
  };
  schedule(SWEEP_FIRST_DELAY_MS + Math.floor(Math.random() * SWEEP_JITTER_MS));
  sweepLog({
    level: "info",
    msg: "attempt_sweeper_started",
    intervalMs: SWEEP_INTERVAL_MS,
  });
}

/* ---------------------------------- Start --------------------------------- */

async function findInProgressAttempt(assignmentId: string, userId: string) {
  const [row] = await db
    .select({
      id: attempts.id,
      deadlineAt: attempts.deadlineAt,
      status: attempts.status,
    })
    .from(attempts)
    .where(
      and(
        eq(attempts.assignmentId, assignmentId),
        eq(attempts.userId, userId),
        eq(attempts.status, "in_progress"),
      ),
    )
    .limit(1);
  return row;
}

/**
 * The student's in-progress attempt for an assignment, if it can still be
 * continued. An expired one is auto-submitted first (and not returned).
 */
export async function findResumableAttempt(
  assignment: Pick<Assignment, "id"> & AssignmentWindow,
  userId: string,
): Promise<{ id: string; deadlineAt: Date | null } | null> {
  const row = await findInProgressAttempt(assignment.id, userId);
  if (!row) return null;
  if (await autoSubmitIfExpired(row, assignment)) return null;
  return { id: row.id, deadlineAt: row.deadlineAt };
}

export class AttemptStartError extends Error {
  constructor(
    public reason: "no_questions" | "no_attempts_left" | "cooldown",
    message: string,
  ) {
    super(message);
  }
}

/**
 * A new attempt may start this long after the previous one at the
 * earliest (stops scripted start/submit loops that harvest answers).
 */
export const NEW_ATTEMPT_COOLDOWN_MS = 30_000;

/** Whether a new attempt is still blocked by the cooldown. */
export function isInCooldown(
  previousStarts: readonly Date[],
  now: Date,
  cooldownMs = NEW_ATTEMPT_COOLDOWN_MS,
): boolean {
  const last = previousStarts.reduce(
    (max, d) => Math.max(max, d.getTime()),
    Number.NEGATIVE_INFINITY,
  );
  return now.getTime() - last < cooldownMs;
}

/**
 * Create a new attempt (with empty answer rows) for a student, or return the
 * in-progress one when it already exists (double-click / two tabs).
 * Assumes the caller checked membership, status and access code.
 *
 * Verlengde tijd: the student's extra-time percentage is turned into
 * minutes once, at the start (`accommodationMinutes`); later changes to the
 * accommodation never alter a running attempt.
 */
export async function createOrResumeAttempt(
  assignment: Pick<
    Assignment,
    | "id"
    | "testId"
    | "timeLimitMinutes"
    | "status"
    | "opensAt"
    | "closesAt"
    | "settings"
  >,
  userId: string,
): Promise<{ attemptId: string; resumed: boolean }> {
  const settings = parseAssignmentSettings(assignment.settings);

  const existing = await findResumableAttempt(assignment, userId);
  if (existing) {
    await logServerEvent(existing.id, "resumed");
    return { attemptId: existing.id, resumed: true };
  }

  const questionIds = await testQuestionIds(assignment.testId);
  if (questionIds.length === 0) {
    throw new AttemptStartError(
      "no_questions",
      "Deze toets heeft nog geen vragen.",
    );
  }
  const points = await db
    .select({ id: questions.id, points: questions.points })
    .from(questions)
    .where(inArray(questions.id, questionIds));
  const pointsById = new Map(points.map((p) => [p.id, p.points]));

  const previous = await db
    .select({
      attemptNumber: attempts.attemptNumber,
      startedAt: attempts.startedAt,
      status: attempts.status,
    })
    .from(attempts)
    .where(
      and(
        eq(attempts.assignmentId, assignment.id),
        eq(attempts.userId, userId),
      ),
    );
  // A concurrent request (double click, second tab) may have created the
  // attempt after our resume check: resume it instead of failing on the
  // attempt limit or the cooldown.
  if (previous.some((p) => p.status === "in_progress")) {
    const running = await findResumableAttempt(assignment, userId);
    if (running) return { attemptId: running.id, resumed: true };
  }
  if (previous.length >= settings.maxAttempts) {
    throw new AttemptStartError(
      "no_attempts_left",
      settings.maxAttempts === 1
        ? "Je hebt deze toets al gemaakt."
        : `Je hebt al je ${settings.maxAttempts} pogingen gebruikt.`,
    );
  }
  const startedAt = new Date();
  if (
    previous.length &&
    isInCooldown(
      previous.map((p) => p.startedAt),
      startedAt,
    )
  ) {
    throw new AttemptStartError(
      "cooldown",
      "Je bent net nog begonnen. Wacht een halve minuut voordat je opnieuw begint.",
    );
  }
  const attemptNumber =
    previous.reduce((max, p) => Math.max(max, p.attemptNumber), 0) + 1;

  const [accommodation] = await db
    .select({ extraTimePercent: studentAccommodations.extraTimePercent })
    .from(studentAccommodations)
    .where(eq(studentAccommodations.userId, userId))
    .limit(1);
  const accMinutes = accommodationMinutes(
    assignment,
    startedAt,
    accommodation?.extraTimePercent ?? 0,
  );
  const order = settings.shuffleQuestions ? shuffled(questionIds) : questionIds;

  try {
    const attemptId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(attempts)
        .values({
          assignmentId: assignment.id,
          userId,
          attemptNumber,
          status: "in_progress",
          startedAt,
          accommodationMinutes: accMinutes,
          deadlineAt: computeAttemptDeadline(assignment, startedAt, accMinutes),
          questionOrder: order,
          lastSeenAt: startedAt,
        })
        .returning({ id: attempts.id });
      await tx.insert(answers).values(
        order.map((questionId) => ({
          attemptId: created.id,
          questionId,
          status: "empty" as const,
          maxScore: pointsById.get(questionId) ?? 0,
        })),
      );
      await tx.insert(attemptEvents).values({
        attemptId: created.id,
        type: "started",
        details: { attemptNumber, accommodationMinutes: accMinutes },
        createdAt: startedAt,
      });
      return created.id;
    });
    return { attemptId, resumed: false };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Another request (double click, second tab) created it first.
      const winner = await findInProgressAttempt(assignment.id, userId);
      if (winner) return { attemptId: winner.id, resumed: true };
    }
    throw err;
  }
}

export async function logServerEvent(
  attemptId: string,
  type: "started" | "resumed" | "submitted",
  details?: Record<string, unknown>,
) {
  await db.insert(attemptEvents).values({ attemptId, type, details });
}
