/**
 * Student portal hardening (P4): monitoring enforcement, access-code
 * lockout, practice cooldown, targeted afnames, verlengde tijd, hints,
 * model solutions and exam confidentiality.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  assignmentStudents,
  assignments,
  attemptEvents,
  attempts,
  auditLog,
  studentAccommodations,
} from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  addToClass,
  createAssignment,
  createBasicWorld,
  createTest,
  insertStudent,
  q,
} from "../support/factories";
import { waitForGrading } from "../support/wait";

beforeEach(resetDatabase);

const codeWithHints = () =>
  q.code({
    hints: [
      { id: "h1", text: "Gebruik print().", penalty: 0 },
      {
        id: "h2",
        text: "Zet de tekst tussen aanhalingstekens.",
        penalty: 0.25,
      },
    ],
  });

async function hintWorld(
  mode: "exam" | "practice" = "practice",
  settings: Record<string, unknown> = {},
) {
  const w = await createBasicWorld();
  const { test: t, questions } = await createTest({
    questions: [codeWithHints(), q.mc(), q.open()],
  });
  const assignment = await createAssignment({
    testId: t.id,
    classId: w.klas.id,
    mode,
    settings: { showResults: "immediately", maxAttempts: 2, ...settings },
  });
  return { ...w, assignment, code: questions[0], mc: questions[1] };
}

describe("logEvents (data minimisation)", () => {
  test("drops events the settings don't ask for and sanitises details", async () => {
    const w = await createBasicWorld({
      settings: { showResults: "immediately", logFocusEvents: false },
    });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const out = await s1.portal.logEvents({
      attemptId,
      events: [
        { type: "focus_lost" },
        {
          type: "code_run",
          details: {
            questionId: w.questions.code.id,
            durationMs: 12,
            secret: "x",
          },
        },
      ],
    });
    expect(out).toEqual({ logged: 1, dropped: 1 });
    const rows = await db
      .select()
      .from(attemptEvents)
      .where(
        and(
          eq(attemptEvents.attemptId, attemptId),
          eq(attemptEvents.type, "code_run"),
        ),
      );
    expect(rows[0]?.details).toEqual({
      questionId: w.questions.code.id,
      durationMs: 12,
    });
    const [attempt] = await db
      .select({ focusLossCount: attempts.focusLossCount })
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(attempt?.focusLossCount).toBe(0);
  });

  test("ignoreFocusEvents switches focus logging off for that student", async () => {
    const w = await createBasicWorld({
      mode: "exam",
      settings: { showResults: "after_close", logFocusEvents: true },
    });
    await db
      .insert(studentAccommodations)
      .values({ userId: w.s1.id, ignoreFocusEvents: true, allowPaste: true });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const view = await s1.portal.getAttempt({ attemptId });
    expect(view.assignment.settings.logFocusEvents).toBe(false);
    expect(view.assignment.settings.blockPaste).toBe(false);
    const out = await s1.portal.logEvents({
      attemptId,
      events: [{ type: "focus_lost" }, { type: "visibility_hidden" }],
    });
    expect(out).toEqual({ logged: 0, dropped: 2 });

    // The other student is monitored as configured.
    const s2 = callerFor(w.s2);
    const second = await s2.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    expect(
      await s2.portal.logEvents({
        attemptId: second.attemptId,
        events: [{ type: "focus_lost" }],
      }),
    ).toEqual({ logged: 1, dropped: 0 });
  });

  test("rejects nested details", async () => {
    const w = await createBasicWorld();
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await expect(
      s1.portal.logEvents({
        attemptId,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
        events: [{ type: "code_run", details: { nested: { a: 1 } } as any }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("access code lockout", () => {
  test("5 wrong codes lock the student out, even with the right code", async () => {
    const w = await createBasicWorld({ mode: "exam", accessCode: "ABC123" });
    const s1 = callerFor(w.s1);
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      try {
        await s1.portal.startAttempt({
          assignmentId: w.assignment.id,
          accessCode: `WRONG${i}`,
        });
      } catch (err) {
        codes.push((err as { code: string }).code);
      }
    }
    expect(codes).toEqual([
      "BAD_REQUEST",
      "BAD_REQUEST",
      "BAD_REQUEST",
      "BAD_REQUEST",
      "TOO_MANY_REQUESTS",
    ]);
    await expect(
      s1.portal.startAttempt({
        assignmentId: w.assignment.id,
        accessCode: "abc123",
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // Another student is not affected.
    await expect(
      callerFor(w.s2).portal.startAttempt({
        assignmentId: w.assignment.id,
        accessCode: "abc123",
      }),
    ).resolves.toMatchObject({ resumed: false });
    // One sampled audit entry, without the code.
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "security.access_code_failed"));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.details).toEqual({ assignmentId: w.assignment.id });
  }, 20_000);
});

describe("practice cooldown", () => {
  test("a new attempt within 30 s of the previous one is refused", async () => {
    const w = await createBasicWorld();
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await s1.portal.submitAttempt({ attemptId });
    await expect(
      s1.portal.startAttempt({ assignmentId: w.assignment.id }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await db
      .update(attempts)
      .set({ startedAt: new Date(Date.now() - 60_000) })
      .where(eq(attempts.id, attemptId));
    await expect(
      s1.portal.startAttempt({ assignmentId: w.assignment.id }),
    ).resolves.toMatchObject({ resumed: false });
  });
});

describe("targeted afnames", () => {
  test("only the targeted students see the afname", async () => {
    const w = await createBasicWorld();
    await db
      .insert(assignmentStudents)
      .values({ assignmentId: w.assignment.id, userId: w.s1.id });
    const other = callerFor(w.s2);
    await expect(
      other.portal.getAssignment({ id: w.assignment.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      other.portal.startAttempt({ assignmentId: w.assignment.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const dash = await other.portal.dashboard();
    expect(
      [...dash.open, ...dash.upcoming, ...dash.finished].map((i) => i.id),
    ).not.toContain(w.assignment.id);

    const target = callerFor(w.s1);
    await expect(
      target.portal.getAssignment({ id: w.assignment.id }),
    ).resolves.toMatchObject({ id: w.assignment.id });
    expect((await target.portal.dashboard()).open.map((i) => i.id)).toContain(
      w.assignment.id,
    );
  });
});

describe("verlengde tijd", () => {
  test("the accommodation is snapshotted on the attempt", async () => {
    const w = await createBasicWorld({ mode: "exam", timeLimitMinutes: 50 });
    await db
      .insert(studentAccommodations)
      .values({ userId: w.s1.id, extraTimePercent: 25 });
    const s1 = callerFor(w.s1);
    const info = await s1.portal.getAssignment({ id: w.assignment.id });
    expect(info.extraTimePercent).toBe(25);
    expect(info.personalTimeMinutes).toBe(63);

    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(row?.accommodationMinutes).toBe(13);
    expect(
      (row?.deadlineAt?.getTime() ?? 0) - (row?.startedAt.getTime() ?? 0),
    ).toBe(63 * 60_000);
    const [started] = await db
      .select()
      .from(attemptEvents)
      .where(
        and(
          eq(attemptEvents.attemptId, attemptId),
          eq(attemptEvents.type, "started"),
        ),
      );
    expect(started?.details).toMatchObject({ accommodationMinutes: 13 });

    // A later change doesn't touch the running attempt.
    await db
      .update(studentAccommodations)
      .set({ extraTimePercent: 50 })
      .where(eq(studentAccommodations.userId, w.s1.id));
    const view = await s1.portal.getAttempt({ attemptId });
    expect(view.attempt.accommodationMinutes).toBe(13);
  });

  test("a personal deadline keeps working after the afname closed", async () => {
    const w = await createBasicWorld({ mode: "exam" });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await db
      .update(assignments)
      .set({ status: "closed" })
      .where(eq(assignments.id, w.assignment.id));
    await db
      .update(attempts)
      .set({ deadlineAt: new Date(Date.now() + 20 * 60_000) })
      .where(eq(attempts.id, attemptId));
    await expect(
      s1.portal.saveAnswer({
        attemptId,
        questionId: w.questions.mc.id,
        response: { selected: ["a"] },
      }),
    ).resolves.toMatchObject({ status: "saved" });
    await expect(
      s1.portal.startAttempt({ assignmentId: w.assignment.id }),
    ).resolves.toEqual({ attemptId, resumed: true });
    await expect(s1.portal.submitAttempt({ attemptId })).resolves.toMatchObject(
      { alreadySubmitted: false },
    );
    // A new attempt stays blocked.
    await expect(
      callerFor(w.s2).portal.startAttempt({ assignmentId: w.assignment.id }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("hints", () => {
  test("hints are revealed in order, once, and stored on the answer", async () => {
    const w = await hintWorld();
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const before = await s1.help.hints({ attemptId });
    expect(before.questions[w.code.id]).toEqual({
      total: 2,
      revealed: [],
      next: { id: "h1", penalty: 0 },
    });
    await expect(
      s1.help.revealHint({ attemptId, questionId: w.code.id, hintId: "h2" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Bekijk eerst de vorige hint.",
    });
    expect(
      await s1.help.revealHint({
        attemptId,
        questionId: w.code.id,
        hintId: "h1",
      }),
    ).toMatchObject({ text: "Gebruik print().", penalty: 0 });
    expect(
      await s1.help.revealHint({
        attemptId,
        questionId: w.code.id,
        hintId: "h1",
      }),
    ).toMatchObject({ alreadyRevealed: true });
    await s1.help.revealHint({
      attemptId,
      questionId: w.code.id,
      hintId: "h2",
    });

    const [answer] = await db
      .select({ hintsUsed: answers.hintsUsed })
      .from(answers)
      .where(
        and(
          eq(answers.attemptId, attemptId),
          eq(answers.questionId, w.code.id),
        ),
      );
    expect(answer?.hintsUsed.map((h) => h.id)).toEqual(["h1", "h2"]);
    const events = await db
      .select()
      .from(attemptEvents)
      .where(
        and(
          eq(attemptEvents.attemptId, attemptId),
          eq(attemptEvents.type, "hint_revealed"),
        ),
      );
    expect(events.map((e) => e.details)).toEqual([
      { questionId: w.code.id, hintId: "h1", penalty: 0 },
      { questionId: w.code.id, hintId: "h2", penalty: 0.25 },
    ]);

    // The student-safe question data never contains the hint text.
    const view = await s1.portal.getAttempt({ attemptId });
    const code = view.questions.find((x) => x.id === w.code.id);
    expect(JSON.stringify(code?.data)).not.toContain("Gebruik print()");
  });

  test("exams never offer hints, whatever the settings say", async () => {
    const w = await hintWorld("exam", { allowHints: true, codeTips: true });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const view = await s1.portal.getAttempt({ attemptId });
    expect(view.assignment.settings).toMatchObject({
      allowHints: false,
      codeTips: false,
      showSolutions: "never",
    });
    expect((await s1.help.hints({ attemptId })).enabled).toBe(false);
    await expect(
      s1.help.revealHint({ attemptId, questionId: w.code.id, hintId: "h1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("model solutions", () => {
  test("after_attempts: only when every attempt is used", async () => {
    const w = await hintWorld("practice", { showSolutions: "after_attempts" });
    const s1 = callerFor(w.s1);
    const first = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await s1.portal.submitAttempt({ attemptId: first.attemptId });
    await waitForGrading(first.attemptId);
    const early = await s1.help.solutions({ attemptId: first.attemptId });
    expect(early.available).toBe(false);

    await db
      .update(attempts)
      .set({ startedAt: new Date(Date.now() - 60_000) })
      .where(eq(attempts.id, first.attemptId));
    const second = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    // Never while another attempt runs.
    expect(
      (await s1.help.solutions({ attemptId: first.attemptId })).available,
    ).toBe(false);
    await s1.portal.submitAttempt({ attemptId: second.attemptId });
    await waitForGrading(second.attemptId);
    const late = await s1.help.solutions({ attemptId: second.attemptId });
    expect(late.available).toBe(true);
    expect(late.solutions[w.code.id]).toEqual({ solution: 'print("Hallo")\n' });
    expect(late.solutions[w.mc.id]).toBeNull();
  });
});

describe("exam confidentiality", () => {
  test("a handed-in exam shows no questions until results are visible", async () => {
    const w = await createBasicWorld({
      mode: "exam",
      settings: { showResults: "after_close", maxAttempts: 1 },
    });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await s1.portal.submitAttempt({ attemptId });
    const view = await s1.portal.getAttempt({ attemptId });
    expect(view.contentHidden).toBe(true);
    expect(view.questions).toEqual([]);
    expect(view.answers).toEqual([]);
  });

  test("right answers stay hidden while attempts remain", async () => {
    const w = await createBasicWorld({
      mode: "exam",
      settings: { showResults: "immediately", maxAttempts: 2 },
    });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await s1.portal.saveAnswer({
      attemptId,
      questionId: w.questions.mc.id,
      response: { selected: ["b"] },
    });
    await s1.portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    const result = await s1.portal.getResult({ attemptId });
    if (!result.visible) throw new Error("result should be visible");
    expect(result.answersHidden).toBe(true);
    const mc = result.questions.find((x) => x.id === w.questions.mc.id);
    expect(mc?.choice?.options.every((o) => o.correct === null)).toBe(true);
    const code = result.questions.find((x) => x.id === w.questions.code.id);
    for (const t of code?.codeResult?.tests ?? []) {
      expect(t.expected).toBeUndefined();
    }
  });
});

describe("a student outside the class", () => {
  test("cannot use the help router on someone else's attempt", async () => {
    const w = await hintWorld();
    const { attemptId } = await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const stranger = await insertStudent();
    await addToClass(w.klas.id, stranger.id);
    await expect(
      callerFor(stranger).help.hints({ attemptId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
