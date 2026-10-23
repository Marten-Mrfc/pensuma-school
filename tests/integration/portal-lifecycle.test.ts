/**
 * Student side of the attempt lifecycle: results and right answers wait
 * for classmates with verlengde tijd, a late time extension beats the
 * page's timer, a question deleted mid-exam, and reviews of answers that
 * change after a reopen.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  assignments,
  attemptEvents,
  attempts,
  studentAccommodations,
} from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { drainGrading, resetDatabase } from "../support/db";
import { createBasicWorld } from "../support/factories";
import { waitForGrading } from "../support/wait";

beforeEach(resetDatabase);

async function attemptRow(id: string) {
  const [row] = await db.select().from(attempts).where(eq(attempts.id, id));
  if (!row) throw new Error("attempt missing");
  return row;
}

/**
 * An exam (60 min, one attempt) where s1 hands in and s2, with 50%
 * verlengde tijd, is still working when the teacher closes it.
 */
async function closedWithExtraTime(
  showResults: "after_close" | "immediately" = "after_close",
) {
  const w = await createBasicWorld({
    mode: "exam",
    timeLimitMinutes: 60,
    settings: { showResults, maxAttempts: 1 },
  });
  await db
    .insert(studentAccommodations)
    .values({ userId: w.s2.id, extraTimePercent: 50 });
  const s1 = callerFor(w.s1);
  const s2 = callerFor(w.s2);
  const { attemptId: a1 } = await s1.portal.startAttempt({
    assignmentId: w.assignment.id,
  });
  await s1.portal.saveAnswer({
    attemptId: a1,
    questionId: w.questions.mc.id,
    response: { selected: ["b"] },
  });
  await s1.portal.submitAttempt({ attemptId: a1 });
  const { attemptId: a2 } = await s2.portal.startAttempt({
    assignmentId: w.assignment.id,
  });
  await waitForGrading(a1);
  return { ...w, s1c: s1, s2c: s2, a1, a2 };
}

describe("results wait for classmates with verlengde tijd (after_close)", () => {
  test("hidden while one is still working, shown once they hand in", async () => {
    const w = await closedWithExtraTime();
    const closed = await callerFor(w.teacher).assignment.close({
      id: w.assignment.id,
    });
    expect(closed).toMatchObject({ autoSubmitted: 0, stillWorking: 1 });

    const hidden = await w.s1c.portal.getResult({ attemptId: w.a1 });
    expect(hidden.visible).toBe(false);
    if (hidden.visible) throw new Error("unreachable");
    expect(hidden.message).toContain("iedereen klaar");
    expect(JSON.stringify(hidden)).not.toContain('"correct":true');

    const view = await w.s1c.portal.getAttempt({ attemptId: w.a1 });
    expect(view.contentHidden).toBe(true);
    expect(view.questions).toEqual([]);

    const dash = await w.s1c.portal.dashboard();
    const item = dash.finished.find((i) => i.id === w.assignment.id);
    expect(item?.lastAttempt?.resultsVisible).toBe(false);
    expect(item?.lastAttempt?.score).toBeNull();
    const mine = await w.s1c.portal.myResults();
    expect(mine.find((r) => r.attemptId === w.a1)).toMatchObject({
      visible: false,
      score: null,
    });

    // The classmate can still save…
    await expect(
      w.s2c.portal.saveAnswer({
        attemptId: w.a2,
        questionId: w.questions.mc.id,
        response: { selected: ["a"] },
      }),
    ).resolves.toMatchObject({ status: "saved" });
    // …and once they hand in, everyone sees results and right answers.
    await w.s2c.portal.submitAttempt({ attemptId: w.a2 });
    await waitForGrading(w.a2);

    const shown = await w.s1c.portal.getResult({ attemptId: w.a1 });
    if (!shown.visible) throw new Error("result should be visible");
    expect(shown.answersHidden).toBe(false);
    const mc = shown.questions.find((x) => x.id === w.questions.mc.id);
    expect(mc?.choice?.options.find((o) => o.id === "a")?.correct).toBe(true);
    expect(
      (await w.s1c.portal.getAttempt({ attemptId: w.a1 })).contentHidden,
    ).toBe(false);
    expect(
      (await w.s1c.portal.myResults()).find((r) => r.attemptId === w.a1)
        ?.visible,
    ).toBe(true);
    await drainGrading();
  });

  test("an attempt past its deadline (not yet auto-submitted) holds nothing back", async () => {
    const w = await closedWithExtraTime();
    await callerFor(w.teacher).assignment.close({ id: w.assignment.id });
    // The personal deadline passed more than the grace period ago, but no
    // request has auto-submitted the attempt yet.
    await db
      .update(attempts)
      .set({ deadlineAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(attempts.id, w.a2));
    const result = await w.s1c.portal.getResult({ attemptId: w.a1 });
    expect(result.visible).toBe(true);
    await drainGrading();
  });

  test("results the teacher released explicitly stay visible", async () => {
    const w = await closedWithExtraTime();
    const t = callerFor(w.teacher);
    await t.assignment.close({ id: w.assignment.id });
    await t.assignment.setResultsReleased({
      id: w.assignment.id,
      released: true,
    });
    const result = await w.s1c.portal.getResult({ attemptId: w.a1 });
    if (!result.visible) throw new Error("result should be visible");
    expect(result.answersHidden).toBe(false);
    await drainGrading();
  });

  test("showResults immediately: the score shows, the right answers wait", async () => {
    const w = await closedWithExtraTime("immediately");
    const result = await w.s1c.portal.getResult({ attemptId: w.a1 });
    if (!result.visible) throw new Error("result should be visible");
    expect(result.score).not.toBeNull();
    expect(result.answersHidden).toBe(true);
    expect(result.answersHiddenMessage).toContain("iedereen klaar");
    const mc = result.questions.find((x) => x.id === w.questions.mc.id);
    expect(mc?.choice?.options.every((o) => o.correct === null)).toBe(true);
    const code = result.questions.find((x) => x.id === w.questions.code.id);
    for (const t of code?.codeResult?.tests ?? []) {
      expect(t.expected).toBeUndefined();
    }

    await w.s2c.portal.submitAttempt({ attemptId: w.a2 });
    const after = await w.s1c.portal.getResult({ attemptId: w.a1 });
    if (!after.visible) throw new Error("result should be visible");
    expect(after.answersHidden).toBe(false);
    await drainGrading();
  });
});

describe("a late time extension beats the page's timer", () => {
  test("an auto hand-in before the (new) deadline is refused with the deadline", async () => {
    const w = await createBasicWorld({ mode: "exam", timeLimitMinutes: 1 });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    // The teacher adds 5 minutes 15 s before the end; the page still
    // counts down to the old deadline and hands in when it reaches zero.
    const ext = await callerFor(w.teacher).assignment.extendTime({
      attemptId,
      minutes: 5,
    });
    const res = await s1.portal.submitAttempt({ attemptId, auto: true });
    expect(res.notYet).toBe(true);
    if (!res.notYet) throw new Error("unreachable");
    expect(res.deadlineAt.getTime()).toBe(ext.deadlineAt.getTime());
    expect((await attemptRow(attemptId)).status).toBe("in_progress");

    // At the real deadline the auto hand-in is accepted, as the timer's.
    await db
      .update(attempts)
      .set({ deadlineAt: new Date(Date.now() + 2_000) })
      .where(eq(attempts.id, attemptId));
    const done = await s1.portal.submitAttempt({ attemptId, auto: true });
    expect(done).toMatchObject({ notYet: false, alreadySubmitted: false });
    const row = await attemptRow(attemptId);
    expect(row.status).toBe("submitted");
    expect(row.autoSubmitted).toBe(true);
    const [event] = await db
      .select()
      .from(attemptEvents)
      .where(
        and(
          eq(attemptEvents.attemptId, attemptId),
          eq(attemptEvents.type, "submitted"),
        ),
      );
    expect(event?.details).toMatchObject({ auto: true, by: "timer" });
    await drainGrading();
  });

  test("a manual hand-in is accepted at any time", async () => {
    const w = await createBasicWorld({ mode: "exam", timeLimitMinutes: 30 });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const res = await s1.portal.submitAttempt({ attemptId });
    expect(res).toMatchObject({ notYet: false, alreadySubmitted: false });
    expect((await attemptRow(attemptId)).autoSubmitted).toBe(false);
    await drainGrading();
  });
});

describe("a question deleted during the exam", () => {
  test("saving it says 'removed'; the attempt and the other questions go on", async () => {
    const w = await createBasicWorld({ mode: "exam" });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await callerFor(w.teacher).question.delete({
      id: w.questions.open.id,
      force: true,
    });
    await expect(
      s1.portal.saveAnswer({
        attemptId,
        questionId: w.questions.open.id,
        response: { text: "Mijn uitleg" },
      }),
    ).resolves.toMatchObject({ status: "removed" });
    expect((await attemptRow(attemptId)).status).toBe("in_progress");
    await expect(
      s1.portal.saveAnswer({
        attemptId,
        questionId: w.questions.mc.id,
        response: { selected: ["a"] },
      }),
    ).resolves.toMatchObject({ status: "saved" });
    const view = await s1.portal.getAttempt({ attemptId });
    expect(view.questions.map((x) => x.id)).not.toContain(w.questions.open.id);
    expect(view.questions).toHaveLength(2);
    // A question that never belonged to the attempt is still refused.
    await expect(
      s1.portal.saveAnswer({
        attemptId,
        questionId: crypto.randomUUID(),
        response: { selected: ["a"] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("a reopened attempt with reviewed answers", () => {
  test("a changed answer loses the old review and goes back to the queue", async () => {
    const w = await createBasicWorld({
      mode: "exam",
      settings: { showResults: "immediately", maxAttempts: 1 },
    });
    const s1 = callerFor(w.s1);
    const t = callerFor(w.teacher);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await s1.portal.saveAnswer({
      attemptId,
      questionId: w.questions.open.id,
      response: { text: "weet ik niet" },
    });
    await s1.portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    const [open] = await db
      .select()
      .from(answers)
      .where(
        and(
          eq(answers.attemptId, attemptId),
          eq(answers.questionId, w.questions.open.id),
        ),
      );
    await t.review.setManualScore({
      answerId: open.id,
      manualScore: 0,
      feedback: "Geen uitleg gegeven.",
    });

    const reopened = await t.assignment.reopenAttempt({
      attemptId,
      minutes: 10,
    });
    expect(reopened.reviewedAnswers).toBe(1);

    // An autosave of the same text keeps the review…
    await s1.portal.saveAnswer({
      attemptId,
      questionId: w.questions.open.id,
      response: { text: "weet ik niet" },
    });
    let [row] = await db.select().from(answers).where(eq(answers.id, open.id));
    expect(row.manualScore).toBe(0);
    expect(row.feedback).toBe("Geen uitleg gegeven.");

    // …a new answer clears it.
    await s1.portal.saveAnswer({
      attemptId,
      questionId: w.questions.open.id,
      response: { text: "Een for-lus gebruik je als je weet hoe vaak." },
    });
    [row] = await db.select().from(answers).where(eq(answers.id, open.id));
    expect(row.manualScore).toBeNull();
    expect(row.feedback).toBeNull();
    expect(row.reviewedAt).toBeNull();
    expect(row.reviewedById).toBeNull();
    expect(row.rubricChecked).toBeNull();

    await s1.portal.submitAttempt({ attemptId });
    const graded = await waitForGrading(attemptId);
    expect(graded.gradingStatus).toBe("needs_review");
    const queue = await t.review.gradingQueue({
      assignmentId: w.assignment.id,
      questionId: w.questions.open.id,
    });
    expect(
      queue.questions.find((x) => x.id === w.questions.open.id)?.needsReview,
    ).toBe(1);
    const result = await s1.portal.getResult({ attemptId });
    if (!result.visible) throw new Error("result should be visible");
    const q = result.questions.find((x) => x.id === w.questions.open.id);
    expect(q?.feedback).toBeNull();
    expect(q?.reviewed).toBe(false);
    await drainGrading();
  });
});

describe("the afname row itself", () => {
  test("a closed afname without extra time shows results at once", async () => {
    const w = await createBasicWorld({
      mode: "exam",
      settings: { showResults: "after_close", maxAttempts: 1 },
    });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await s1.portal.submitAttempt({ attemptId });
    await db
      .update(assignments)
      .set({ status: "closed", closesAt: new Date() })
      .where(eq(assignments.id, w.assignment.id));
    expect((await s1.portal.getResult({ attemptId })).visible).toBe(true);
    await drainGrading();
  });
});
