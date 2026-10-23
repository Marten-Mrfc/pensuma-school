/**
 * Background grading when the grader is busy or unavailable, and grading
 * that got lost (server restart):
 *  - grader unavailable → nothing stored for code answers, attempt stays
 *    "pending", retried automatically (never internal_error/needs_review);
 *  - gradeAttempt reports incomplete grading, so "Opnieuw nakijken" can say
 *    it failed;
 *  - one student never occupies more than one grader job at a time;
 *  - submitted attempts whose grading was lost are graded by the sweep.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { answers, attempts } from "@/server/db/schema";
import { GraderUnavailableError } from "@/server/grader/errors";
import { regradeStalePendingAttempts } from "@/server/services/attempts";
import {
  gradeAttempt,
  isGradingIncomplete,
  isGradingInFlight,
  markGradingScheduled,
  setGradingRetryDelaysForTests,
} from "@/server/services/grading";
import { callerFor, type TestUser } from "../support/caller";
import { drainGrading, resetDatabase } from "../support/db";
import { createAssignment, createBasicWorld } from "../support/factories";
import { defaultGrade, setFakeGrader } from "../support/fake-grader";
import { settleGrading, waitFor, waitForGrading } from "../support/wait";

beforeEach(resetDatabase);
afterEach(() => setGradingRetryDelaysForTests(null));

type World = Awaited<ReturnType<typeof createBasicWorld>>;

/** Start, answer the code + MC question, submit. Returns the attempt id. */
async function submitCode(
  w: World,
  student: TestUser = w.s1,
  assignmentId = w.assignment.id,
): Promise<string> {
  const caller = callerFor(student);
  const { attemptId } = await caller.portal.startAttempt({ assignmentId });
  await caller.portal.saveAnswer({
    attemptId,
    questionId: w.questions.code.id,
    response: { code: 'print("Hallo")\n' },
  });
  await caller.portal.saveAnswer({
    attemptId,
    questionId: w.questions.mc.id,
    response: { selected: ["a"] },
  });
  await caller.portal.submitAttempt({ attemptId });
  return attemptId;
}

async function codeAnswer(w: World, attemptId: string) {
  const [row] = await db
    .select()
    .from(answers)
    .where(
      and(
        eq(answers.attemptId, attemptId),
        eq(answers.questionId, w.questions.code.id),
      ),
    );
  return row;
}

async function attemptRow(attemptId: string) {
  const [row] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, attemptId));
  return row;
}

describe("grader unavailable", () => {
  test("code answers stay ungraded (pending) and are graded by a retry", async () => {
    setGradingRetryDelaysForTests([150]);
    let available = false;
    setFakeGrader((input) => {
      if (!available)
        throw new GraderUnavailableError("Het nakijken is erg druk.");
      return defaultGrade(input);
    });
    const w = await createBasicWorld();
    const attemptId = await submitCode(w);
    await drainGrading();

    // Not stored as a failure: no internal_error, no needs_review.
    const pending = await codeAnswer(w, attemptId);
    expect(pending.status).toBe("saved");
    expect(pending.result).toBeNull();
    expect(pending.autoScore).toBeNull();
    expect((await attemptRow(attemptId)).gradingStatus).toBe("pending");
    // A retry is scheduled, so sweeps and self-healing leave it alone.
    expect(isGradingInFlight(attemptId)).toBe(true);

    available = true;
    const graded = await waitForGrading(attemptId);
    expect(graded.gradingStatus).toBe("graded");
    expect(graded.score).toBe(w.questions.code.points + w.questions.mc.points);
    const answer = await codeAnswer(w, attemptId);
    expect(answer.status).toBe("graded");
    expect(answer.autoScore).toBe(w.questions.code.points);
    expect(isGradingInFlight(attemptId)).toBe(false);
  });

  test("a regrade of a graded attempt keeps the old scores when the grader is unavailable", async () => {
    const w = await createBasicWorld();
    const attemptId = await submitCode(w);
    await waitForGrading(attemptId);
    setGradingRetryDelaysForTests([60_000]);
    setFakeGrader(() => {
      throw new GraderUnavailableError("druk");
    });
    const err = await gradeAttempt(attemptId, { interactive: true }).catch(
      (e: unknown) => e,
    );
    expect(isGradingIncomplete(err)).toBe(true);
    expect((err as { reason: string }).reason).toBe("grader_unavailable");
    const answer = await codeAnswer(w, attemptId);
    expect(answer.status).toBe("graded");
    expect(answer.autoScore).toBe(w.questions.code.points);
    expect((await attemptRow(attemptId)).gradingStatus).toBe("graded");
  });
});

describe("student output that Postgres can't store", () => {
  test("a NUL character in the output doesn't leave the attempt pending", async () => {
    setFakeGrader((input) => {
      const result = defaultGrade(input);
      return {
        ...result,
        tests: result.tests.map((t) => ({ ...t, actual: "Hal\u0000lo" })),
      };
    });
    const w = await createBasicWorld();
    const attemptId = await submitCode(w);
    const graded = await waitForGrading(attemptId);
    expect(graded.gradingStatus).toBe("graded");
    const answer = await codeAnswer(w, attemptId);
    expect(answer.status).toBe("graded");
    const stored = answer.result as { tests: { actual?: string }[] };
    expect(stored.tests[0].actual).toBe("Hal\uFFFDlo");
  });
});

describe("incomplete grading is reported", () => {
  test("gradeAttempt rejects when an answer ended with an internal error", async () => {
    const w = await createBasicWorld();
    const attemptId = await submitCode(w);
    await waitForGrading(attemptId);
    setFakeGrader((input) => ({
      ...defaultGrade(input),
      status: "internal_error",
      fraction: 0,
      passedWeight: 0,
    }));
    const err = await gradeAttempt(attemptId).catch((e: unknown) => e);
    expect(isGradingIncomplete(err)).toBe(true);
    expect((err as { reason: string }).reason).toBe("internal_error");
    expect((await codeAnswer(w, attemptId)).status).toBe("needs_review");

    // The teacher's "Alles opnieuw nakijken" runs in the background; the
    // answer that could not be graded waits for the teacher again.
    const summary = await callerFor(w.teacher).review.regradeAssignment({
      assignmentId: w.assignment.id,
    });
    expect(summary).toMatchObject({ total: 1, scheduled: 1 });
    await settleGrading();
    expect((await codeAnswer(w, attemptId)).status).toBe("needs_review");
    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(attempt.gradingStatus).toBe("needs_review");
  });
});

describe("one grader job per student", () => {
  async function trackConcurrency() {
    const state = { active: 0, max: 0 };
    setFakeGrader(async (input) => {
      state.active++;
      state.max = Math.max(state.max, state.active);
      await new Promise((r) => setTimeout(r, 80));
      state.active--;
      return defaultGrade(input);
    });
    return state;
  }

  test("two submissions of the same student are graded one after the other", async () => {
    const w = await createBasicWorld();
    const second = await createAssignment({
      testId: w.test.id,
      classId: w.klas.id,
      settings: { showResults: "immediately", maxAttempts: 3 },
    });
    const state = await trackConcurrency();
    const [a, b] = await Promise.all([
      submitCode(w, w.s1),
      submitCode(w, w.s1, second.id),
    ]);
    await Promise.all([waitForGrading(a), waitForGrading(b)]);
    expect(state.max).toBe(1);
  });

  test("submissions of different students are graded side by side", async () => {
    const w = await createBasicWorld();
    const state = await trackConcurrency();
    const [a, b] = await Promise.all([
      submitCode(w, w.s1),
      submitCode(w, w.s2),
    ]);
    await Promise.all([waitForGrading(a), waitForGrading(b)]);
    expect(state.max).toBe(2);
  });
});

describe("lost grading (e.g. a server restart)", () => {
  /** A submitted attempt whose grading never ran. */
  async function lostAttempt(w: World, student: TestUser, ageMs: number) {
    const caller = callerFor(student);
    const { attemptId } = await caller.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await caller.portal.saveAnswer({
      attemptId,
      questionId: w.questions.code.id,
      response: { code: 'print("Hallo")\n' },
    });
    await db
      .update(attempts)
      .set({
        status: "submitted",
        submittedAt: new Date(Date.now() - ageMs),
        gradingStatus: "pending",
      })
      .where(eq(attempts.id, attemptId));
    return attemptId;
  }

  test("the sweep grades stale pending attempts, but not fresh or in-flight ones", async () => {
    const w = await createBasicWorld();
    const stale = await lostAttempt(w, w.s1, 10 * 60_000);
    const fresh = await lostAttempt(w, w.s2, 5_000);
    const picked = await regradeStalePendingAttempts();
    expect(picked).toEqual([stale]);
    const graded = await waitForGrading(stale);
    expect(graded.gradingStatus).toBe("graded");
    expect((await attemptRow(fresh)).gradingStatus).toBe("pending");
  });

  test("the sweep doesn't re-grade the same attempt every minute", async () => {
    const w = await createBasicWorld();
    const stale = await lostAttempt(w, w.s1, 10 * 60_000);
    expect(await regradeStalePendingAttempts()).toEqual([stale]);
    await waitForGrading(stale);
    // Suppose it ended up pending again (e.g. saving failed): the next
    // sweep a minute later leaves it alone for a while.
    await db
      .update(attempts)
      .set({ gradingStatus: "pending" })
      .where(eq(attempts.id, stale));
    expect(await regradeStalePendingAttempts()).toEqual([]);
  });

  test("attempts whose grading is scheduled are left alone", async () => {
    const w = await createBasicWorld();
    const stale = await lostAttempt(w, w.s1, 10 * 60_000);
    markGradingScheduled(stale);
    expect(isGradingInFlight(stale)).toBe(true);
    expect(await regradeStalePendingAttempts()).toEqual([]);
    // Clean up: grading the attempt clears the mark.
    await gradeAttempt(stale);
    expect(isGradingInFlight(stale)).toBe(false);
    await waitFor(
      async () => (await attemptRow(stale)).gradingStatus !== "pending",
    );
  });
});
