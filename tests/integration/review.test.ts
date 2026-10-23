/** Nakijken: manual scores, regrading and the CSV export. */
import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { answers, assignments, attempts } from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  addToClass,
  createBasicWorld,
  insertStudent,
} from "../support/factories";
import { gradeCalls, setFakeGrader } from "../support/fake-grader";
import { settleGrading, waitForGrading } from "../support/wait";

beforeEach(resetDatabase);

async function submittedWorld(settings: Record<string, unknown> = {}) {
  const w = await createBasicWorld({
    settings: { showResults: "immediately", maxAttempts: 3, ...settings },
  });
  const s1 = callerFor(w.s1);
  const { attemptId } = await s1.portal.startAttempt({
    assignmentId: w.assignment.id,
  });
  await s1.portal.saveAnswer({
    attemptId,
    questionId: w.questions.code.id,
    response: { code: 'print("Hallo")\n' },
  });
  await s1.portal.saveAnswer({
    attemptId,
    questionId: w.questions.mc.id,
    response: { selected: ["b"] },
  });
  await s1.portal.saveAnswer({
    attemptId,
    questionId: w.questions.open.id,
    response: { text: "Mijn uitleg" },
  });
  await s1.portal.submitAttempt({ attemptId });
  await waitForGrading(attemptId);
  const rows = await db
    .select()
    .from(answers)
    .where(eq(answers.attemptId, attemptId));
  const answerFor = (questionId: string) => {
    const row = rows.find((r) => r.questionId === questionId);
    if (!row) throw new Error("answer missing");
    return row;
  };
  return { w, attemptId, answerFor };
}

describe("setManualScore", () => {
  test("scores between 0 and the maximum; the attempt is recomputed", async () => {
    const { w, attemptId, answerFor } = await submittedWorld();
    const t = callerFor(w.teacher);
    const open = answerFor(w.questions.open.id);
    const [before] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(before.gradingStatus).toBe("needs_review");

    await expect(
      t.review.setManualScore({ answerId: open.id, manualScore: -1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      t.review.setManualScore({
        answerId: open.id,
        manualScore: open.maxScore + 0.5,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `De score mag hoogstens ${open.maxScore} zijn.`,
    });

    const out = await t.review.setManualScore({
      answerId: open.id,
      manualScore: 1.5,
      feedback: "Goed uitgelegd, maar noem ook een voorbeeld.",
    });
    expect(out).toMatchObject({ manualScore: 1.5, status: "graded" });
    const [row] = await db
      .select()
      .from(answers)
      .where(eq(answers.id, open.id));
    expect(row).toMatchObject({
      manualScore: 1.5,
      feedback: "Goed uitgelegd, maar noem ook een voorbeeld.",
      reviewedById: w.teacher.id,
    });
    const [after] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(after.gradingStatus).toBe("graded");
    // code 2 (fake grader passes) + mc 0 (wrong option) + open 1.5
    expect(after.score).toBe(3.5);
  });

  test("an override wins over the automatic score, also 0", async () => {
    const { w, attemptId, answerFor } = await submittedWorld();
    const code = answerFor(w.questions.code.id);
    expect(code.autoScore).toBe(w.questions.code.points);
    await callerFor(w.teacher).review.setManualScore({
      answerId: code.id,
      manualScore: 0,
    });
    const [after] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(after.score).toBe(0);
  });

  test("an attempt in progress cannot be scored", async () => {
    const w = await createBasicWorld();
    const { attemptId } = await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const [row] = await db
      .select()
      .from(answers)
      .where(
        and(
          eq(answers.attemptId, attemptId),
          eq(answers.questionId, w.questions.open.id),
        ),
      );
    await expect(
      callerFor(w.teacher).review.setManualScore({
        answerId: row.id,
        manualScore: 1,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("regrading", () => {
  test("regrade updates automatic scores but never the teacher's", async () => {
    const { w, attemptId, answerFor } = await submittedWorld();
    const t = callerFor(w.teacher);
    const code = answerFor(w.questions.code.id);
    const mc = answerFor(w.questions.mc.id);
    await t.review.setManualScore({ answerId: mc.id, manualScore: 0.5 });

    // The grader now fails everything (e.g. the teacher fixed a test).
    setFakeGrader((input) => ({
      kind: "code",
      status: "ok",
      error: null,
      tests: input.tests.map((x) => ({
        testId: x.id,
        name: x.name ?? "",
        kind: x.kind,
        hidden: x.hidden ?? false,
        weight: x.weight ?? 1,
        passed: false,
        timedOut: false,
        durationMs: 1,
      })),
      checks: [],
      passedWeight: 0,
      totalWeight: input.tests.length,
      fraction: 0,
      gradedAt: new Date().toISOString(),
    }));
    gradeCalls.length = 0;
    await t.review.regradeAttempt({ attemptId });
    expect(gradeCalls).toHaveLength(1);

    const rows = await db
      .select()
      .from(answers)
      .where(eq(answers.attemptId, attemptId));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(code.id)?.autoScore).toBe(0);
    expect(byId.get(mc.id)?.manualScore).toBe(0.5);
  });

  test("regradeAssignment regrades every submitted attempt", async () => {
    const { w } = await submittedWorld();
    gradeCalls.length = 0;
    const out = await callerFor(w.teacher).review.regradeAssignment({
      assignmentId: w.assignment.id,
    });
    // Returns at once; the grading itself runs in the background.
    expect(out).toMatchObject({ total: 1, scheduled: 1, skippedRestricted: 0 });
    await settleGrading();
    expect(gradeCalls).toHaveLength(1);
  });

  test("gradingQueue lists answers that wait for the teacher", async () => {
    const { w } = await submittedWorld();
    const queue = await callerFor(w.teacher).review.gradingQueue({
      assignmentId: w.assignment.id,
    });
    expect(JSON.stringify(queue)).toContain(w.questions.open.id);
  });
});

describe("exportCsv", () => {
  test("Dutch Excel format, formula injection neutralised, no focus column by default", async () => {
    const { w } = await submittedWorld({ logFocusEvents: true });
    const evil = await insertStudent({
      name: '=HYPERLINK("http://evil.example","klik")',
    });
    await addToClass(w.klas.id, evil.id);

    const { csv, filename, includeFocus } = await callerFor(
      w.teacher,
    ).review.exportCsv({ assignmentId: w.assignment.id });
    expect(filename).toMatch(/\.csv$/);
    expect(includeFocus).toBe(false);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    const header = lines[0];
    expect(header.startsWith("Leerlingnummer;Naam;Status;")).toBe(true);
    expect(header).toContain(";Totaal;Max;Cijfer;Ingeleverd op");
    expect(header).not.toContain("Focusverlies");
    // 2 + 0 + (open not yet reviewed) → "2"; grade with a decimal comma.
    const s1Line = lines.find((l) => l.startsWith(w.s1.username ?? "?"));
    expect(s1Line).toBeDefined();
    expect(s1Line).toMatch(/;\d+,\d;/);
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).not.toMatch(/(^|;)"?=HYPERLINK/m);
  });

  test("the focus column only appears on request for an afname that logged it", async () => {
    const { w } = await submittedWorld({ logFocusEvents: true });
    const out = await callerFor(w.teacher).review.exportCsv({
      assignmentId: w.assignment.id,
      includeFocus: true,
    });
    expect(out.includeFocus).toBe(true);
    expect(out.csv).toContain("Focusverlies");

    await db
      .update(assignments)
      .set({
        settings: { ...w.assignment.settings, logFocusEvents: false },
      })
      .where(eq(assignments.id, w.assignment.id));
    const off = await callerFor(w.teacher).review.exportCsv({
      assignmentId: w.assignment.id,
      includeFocus: true,
    });
    expect(off.csv).not.toContain("Focusverlies");
  });
});
