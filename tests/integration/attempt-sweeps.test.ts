/**
 * The background attempt sweep (started from instrumentation): expired
 * attempts are auto-submitted and graded even when nobody opens a page, with
 * the deadline as "ingeleverd op"; only one server sweeps at a time.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { attemptEvents, attempts } from "@/server/db/schema";
import { runAttemptSweep } from "@/server/services/attempts";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import { createBasicWorld } from "../support/factories";
import { waitForGrading } from "../support/wait";

beforeEach(resetDatabase);

describe("runAttemptSweep", () => {
  test("auto-submits and grades an attempt whose deadline passed while the student was away", async () => {
    const w = await createBasicWorld({ timeLimitMinutes: 30, mode: "exam" });
    const away = callerFor(w.s1);
    const { attemptId } = await away.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await away.portal.saveAnswer({
      attemptId,
      questionId: w.questions.mc.id,
      response: { selected: ["a"] },
    });
    const running = await callerFor(w.s2).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    // The student closed the laptop; the deadline passed an hour ago.
    const deadline = new Date(Date.now() - 60 * 60_000);
    deadline.setMilliseconds(0);
    await db
      .update(attempts)
      .set({ deadlineAt: deadline })
      .where(eq(attempts.id, attemptId));

    const result = await runAttemptSweep();
    expect(result?.autoSubmitted).toEqual([attemptId]);

    const graded = await waitForGrading(attemptId);
    expect(graded).toMatchObject({
      status: "submitted",
      autoSubmitted: true,
      gradingStatus: "graded",
      score: w.questions.mc.points,
    });
    // "Ingeleverd op" is the deadline, not the moment of the sweep.
    expect(graded.submittedAt?.getTime()).toBe(deadline.getTime());
    const events = await db
      .select()
      .from(attemptEvents)
      .where(eq(attemptEvents.attemptId, attemptId));
    expect(events.some((e) => e.type === "submitted")).toBe(true);

    const [other] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, running.attemptId));
    expect(other.status).toBe("in_progress");
  });

  test("a student submitting on time keeps the real hand-in time", async () => {
    const w = await createBasicWorld({ timeLimitMinutes: 30 });
    const caller = callerFor(w.s1);
    const { attemptId } = await caller.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const before = Date.now();
    await caller.portal.submitAttempt({ attemptId });
    const row = await waitForGrading(attemptId);
    expect(row.submittedAt?.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(row.autoSubmitted).toBe(false);
  });

  test("only one server sweeps at a time", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('pensuma:attempt-sweep'))`,
      );
      expect(await runAttemptSweep()).toBeNull();
    });
    expect(await runAttemptSweep()).toEqual({
      autoSubmitted: [],
      regrading: [],
    });
  });
});
