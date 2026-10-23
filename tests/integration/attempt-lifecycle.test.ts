/**
 * The student's attempt from start to result: starting, access codes,
 * windows and attempt limits, autosave, the activity log, submitting,
 * background grading and result visibility.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  assignments,
  attemptEvents,
  attempts,
} from "@/server/db/schema";
import { autoSubmitExpiredAttempts } from "@/server/services/attempts";
import { callerFor, type TestUser } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  addToClass,
  createAssignment,
  createBasicWorld,
  createClass,
  createTest,
  insertStudent,
  q,
} from "../support/factories";
import { FAIL_MARKER, gradeCalls } from "../support/fake-grader";
import { waitForGrading } from "../support/wait";

beforeEach(resetDatabase);

type World = Awaited<ReturnType<typeof createBasicWorld>>;

async function start(world: World, student: TestUser = world.s1) {
  return callerFor(student).portal.startAttempt({
    assignmentId: world.assignment.id,
  });
}

/** Insert finished attempts directly (no cooldown, old start times). */
async function insertSubmittedAttempts(
  assignmentId: string,
  userId: string,
  n: number,
) {
  for (let i = 1; i <= n; i++) {
    const startedAt = new Date(Date.now() - (n - i + 1) * 3_600_000);
    await db.insert(attempts).values({
      assignmentId,
      userId,
      attemptNumber: i,
      status: "submitted",
      startedAt,
      submittedAt: new Date(startedAt.getTime() + 60_000),
      gradingStatus: "graded",
    });
  }
}

describe("startAttempt", () => {
  test("creates one empty answer per question and a started event", async () => {
    const w = await createBasicWorld();
    const out = await start(w);
    expect(out.resumed).toBe(false);
    const rows = await db
      .select()
      .from(answers)
      .where(eq(answers.attemptId, out.attemptId));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe("empty");
      const question = Object.values(w.questions).find(
        (x) => x.id === row.questionId,
      );
      expect(row.maxScore).toBe(question?.points ?? -1);
    }
    const events = await db
      .select()
      .from(attemptEvents)
      .where(eq(attemptEvents.attemptId, out.attemptId));
    expect(events.map((e) => e.type)).toContain("started");
  });

  test("two concurrent starts give one attempt", async () => {
    const w = await createBasicWorld();
    const results = await Promise.allSettled([start(w), start(w)]);
    const ok = results.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : [],
    );
    expect(ok.length).toBeGreaterThan(0);
    expect(new Set(ok.map((o) => o.attemptId)).size).toBe(1);
    const rows = await db
      .select()
      .from(attempts)
      .where(eq(attempts.userId, w.s1.id));
    expect(rows).toHaveLength(1);
  });

  // Regression: a request whose resume check ran before the other one
  // committed used to hit the 30-second cooldown ("Je bent net nog
  // begonnen…") instead of resuming.
  test("many concurrent starts always resume instead of failing", async () => {
    const w = await createBasicWorld();
    const failures: string[] = [];
    for (let i = 0; i < 25; i++) {
      const student = await insertStudent();
      await addToClass(w.klas.id, student.id);
      const results = await Promise.allSettled(
        [1, 2, 3, 4].map(() => start(w, student)),
      );
      for (const r of results) {
        if (r.status === "rejected") failures.push(String(r.reason));
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);

  test("a second start resumes the attempt in progress", async () => {
    const w = await createBasicWorld();
    const first = await start(w);
    const second = await start(w);
    expect(second).toEqual({ attemptId: first.attemptId, resumed: true });
  });

  test("access codes: wrong is refused, case and spaces don't matter, resume needs none", async () => {
    const w = await createBasicWorld({ accessCode: "ABC123" });
    const s1 = callerFor(w.s1);
    await expect(
      s1.portal.startAttempt({
        assignmentId: w.assignment.id,
        accessCode: "XYZ999",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Onjuiste toegangscode",
    });
    await expect(
      s1.portal.startAttempt({ assignmentId: w.assignment.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const ok = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
      accessCode: " abc123 ",
    });
    expect(ok.resumed).toBe(false);
    const resumed = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    expect(resumed).toEqual({ attemptId: ok.attemptId, resumed: true });
  });

  test("a planned afname is not open yet; a past closing time closes it", async () => {
    const w = await createBasicWorld();
    await db
      .update(assignments)
      .set({ status: "planned", opensAt: new Date(Date.now() + 3_600_000) })
      .where(eq(assignments.id, w.assignment.id));
    await expect(start(w)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Deze toets is nog niet geopend.",
    });
    await db
      .update(assignments)
      .set({
        status: "open",
        opensAt: null,
        closesAt: new Date(Date.now() - 60_000),
      })
      .where(eq(assignments.id, w.assignment.id));
    await expect(start(w)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Deze toets is gesloten.",
    });
  });

  test("attempt limits", async () => {
    const w = await createBasicWorld({ settings: { maxAttempts: 1 } });
    await insertSubmittedAttempts(w.assignment.id, w.s1.id, 1);
    await expect(start(w)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Je hebt deze toets al gemaakt.",
    });

    await db
      .update(assignments)
      .set({ settings: { ...w.assignment.settings, maxAttempts: 3 } })
      .where(eq(assignments.id, w.assignment.id));
    await insertSubmittedAttempts(w.assignment.id, w.s2.id, 3);
    await expect(start(w, w.s2)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Je hebt al je 3 pogingen gebruikt.",
    });
    // s1 has 1 of 3 used: may start again.
    await expect(start(w)).resolves.toMatchObject({ resumed: false });
  });

  test("a test without questions cannot be started", async () => {
    const student = await insertStudent();
    const klas = await createClass(undefined, [student.id]);
    const { test: empty } = await createTest({ questions: [] });
    const afname = await createAssignment({
      testId: empty.id,
      classId: klas.id,
    });
    await expect(
      callerFor(student).portal.startAttempt({ assignmentId: afname.id }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Deze toets heeft nog geen vragen.",
    });
  });
});

describe("saveAnswer", () => {
  test("code, multiple choice and open answers round-trip", async () => {
    const w = await createBasicWorld();
    const { attemptId } = await start(w);
    const s1 = callerFor(w.s1);
    const code = 'naam = input("Wat is je naam?")\nprint("Hallo " + naam)\n';
    expect(
      await s1.portal.saveAnswer({
        attemptId,
        questionId: w.questions.code.id,
        response: { code },
      }),
    ).toMatchObject({ status: "saved" });
    await s1.portal.saveAnswer({
      attemptId,
      questionId: w.questions.mc.id,
      response: { selected: ["a"] },
    });
    await s1.portal.saveAnswer({
      attemptId,
      questionId: w.questions.open.id,
      response: { text: "Omdat het kan." },
    });
    const out = await s1.portal.getAttempt({ attemptId });
    const byQ = new Map(out.answers.map((a) => [a.questionId, a]));
    expect(byQ.get(w.questions.code.id)?.response).toEqual({ code });
    expect(byQ.get(w.questions.mc.id)?.response).toEqual({ selected: ["a"] });
    expect(byQ.get(w.questions.open.id)?.response).toEqual({
      text: "Omdat het kan.",
    });
  });

  test("only the starter code counts as empty", async () => {
    const w = await createBasicWorld();
    const { attemptId } = await start(w);
    const out = await callerFor(w.s1).portal.saveAnswer({
      attemptId,
      questionId: w.questions.code.id,
      response: { code: "  # Schrijf hier je code\n\n" },
    });
    expect(out.status).toBe("empty");
  });

  test("single choice with two options is refused", async () => {
    const w = await createBasicWorld();
    const { attemptId } = await start(w);
    await expect(
      callerFor(w.s1).portal.saveAnswer({
        attemptId,
        questionId: w.questions.mc.id,
        response: { selected: ["a", "b"] },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Kies maar één antwoord.",
    });
  });

  test("an open answer over the maximum length is refused", async () => {
    const student = await insertStudent();
    const klas = await createClass(undefined, [student.id]);
    const { test: toets, questions } = await createTest({
      questions: [q.open({ maxLength: 10 })],
    });
    const afname = await createAssignment({
      testId: toets.id,
      classId: klas.id,
    });
    const caller = callerFor(student);
    const { attemptId } = await caller.portal.startAttempt({
      assignmentId: afname.id,
    });
    await expect(
      caller.portal.saveAnswer({
        attemptId,
        questionId: questions[0].id,
        response: { text: "dit is veel te lang" },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Je antwoord is te lang (maximaal 10 tekens).",
    });
  });

  test("after submitting nothing can be changed", async () => {
    const w = await createBasicWorld();
    const { attemptId } = await start(w);
    const s1 = callerFor(w.s1);
    await s1.portal.submitAttempt({ attemptId });
    await expect(
      s1.portal.saveAnswer({
        attemptId,
        questionId: w.questions.open.id,
        response: { text: "te laat" },
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Deze poging is al ingeleverd. Je kunt niets meer wijzigen.",
    });
  });

  test("past the deadline (+30 s grace) the attempt is submitted automatically", async () => {
    const w = await createBasicWorld({ timeLimitMinutes: 30 });
    const { attemptId } = await start(w);
    await db
      .update(attempts)
      .set({ deadlineAt: new Date(Date.now() - 31_000) })
      .where(eq(attempts.id, attemptId));
    await expect(
      callerFor(w.s1).portal.saveAnswer({
        attemptId,
        questionId: w.questions.open.id,
        response: { text: "net te laat" },
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "De tijd is om. Je antwoord kon niet meer worden opgeslagen.",
    });
    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(row.status).toBe("submitted");
    expect(row.autoSubmitted).toBe(true);
  });

  test("within the grace period a save still counts", async () => {
    const w = await createBasicWorld({ timeLimitMinutes: 30 });
    const { attemptId } = await start(w);
    await db
      .update(attempts)
      .set({ deadlineAt: new Date(Date.now() - 10_000) })
      .where(eq(attempts.id, attemptId));
    await expect(
      callerFor(w.s1).portal.saveAnswer({
        attemptId,
        questionId: w.questions.open.id,
        response: { text: "net op tijd" },
      }),
    ).resolves.toMatchObject({ status: "saved" });
  });
});

describe("logEvents", () => {
  test("events the settings don't allow are dropped", async () => {
    const w = await createBasicWorld({ settings: { logFocusEvents: false } });
    const { attemptId } = await start(w);
    const out = await callerFor(w.s1).portal.logEvents({
      attemptId,
      events: [
        { type: "focus_lost", details: { durationMs: 1000 } },
        { type: "visibility_hidden" },
        { type: "code_run", details: { questionId: w.questions.code.id } },
      ],
    });
    expect(out).toEqual({ logged: 1, dropped: 2 });
    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(row.focusLossCount).toBe(0);
    const types = (
      await db
        .select()
        .from(attemptEvents)
        .where(eq(attemptEvents.attemptId, attemptId))
    ).map((e) => e.type);
    expect(types).not.toContain("focus_lost");
    expect(types).toContain("code_run");
  });

  test("focus losses are counted when the afname logs them", async () => {
    const w = await createBasicWorld({ settings: { logFocusEvents: true } });
    const { attemptId } = await start(w);
    const out = await callerFor(w.s1).portal.logEvents({
      attemptId,
      events: [
        { type: "focus_lost", details: { durationMs: 1200 } },
        { type: "focus_gained" },
        { type: "visibility_hidden" },
      ],
    });
    expect(out).toEqual({ logged: 3, dropped: 0 });
    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(row.focusLossCount).toBe(2);
  });

  test("clipboard text is never stored", async () => {
    const w = await createBasicWorld({ settings: { logFocusEvents: true } });
    const { attemptId } = await start(w);
    await callerFor(w.s1).portal.logEvents({
      attemptId,
      events: [
        {
          type: "paste",
          details: {
            questionId: w.questions.code.id,
            length: 11,
            blocked: false,
            text: "CANARY_CLIPBOARD",
          },
        },
      ],
    });
    const rows = await db
      .select()
      .from(attemptEvents)
      .where(
        and(
          eq(attemptEvents.attemptId, attemptId),
          eq(attemptEvents.type, "paste"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0].details)).not.toContain("CANARY_CLIPBOARD");
    expect(rows[0].details).toMatchObject({ length: 11, blocked: false });
  });

  test("more than 50 events or server-only types are refused", async () => {
    const w = await createBasicWorld();
    const { attemptId } = await start(w);
    const s1 = callerFor(w.s1);
    await expect(
      s1.portal.logEvents({
        attemptId,
        events: Array.from({ length: 51 }, () => ({
          type: "code_run" as const,
        })),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      s1.portal.logEvents({
        attemptId,
        // @ts-expect-error: "submitted" is written by the server only.
        events: [{ type: "submitted" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("submit and grading", () => {
  test("MC is auto-scored, code by the grader, open waits for the teacher", async () => {
    const w = await createBasicWorld();
    const { attemptId } = await start(w);
    const s1 = callerFor(w.s1);
    await s1.portal.saveAnswer({
      attemptId,
      questionId: w.questions.code.id,
      response: { code: 'print("Hallo")\n' },
    });
    await s1.portal.saveAnswer({
      attemptId,
      questionId: w.questions.mc.id,
      response: { selected: ["a"] },
    });
    await s1.portal.saveAnswer({
      attemptId,
      questionId: w.questions.open.id,
      response: { text: "Uitleg" },
    });
    expect(await s1.portal.submitAttempt({ attemptId })).toMatchObject({
      alreadySubmitted: false,
    });
    expect(await s1.portal.submitAttempt({ attemptId })).toMatchObject({
      alreadySubmitted: true,
    });

    const attempt = await waitForGrading(attemptId);
    expect(attempt.gradingStatus).toBe("needs_review");
    // All of the grader's tests, hidden ones included, came from the server.
    expect(gradeCalls).toHaveLength(1);
    const rows = await db
      .select()
      .from(answers)
      .where(eq(answers.attemptId, attemptId));
    const byQ = new Map(rows.map((r) => [r.questionId, r]));
    expect(byQ.get(w.questions.mc.id)).toMatchObject({
      status: "graded",
      autoScore: w.questions.mc.points,
    });
    expect(byQ.get(w.questions.code.id)).toMatchObject({
      status: "graded",
      autoScore: w.questions.code.points,
    });
    expect(byQ.get(w.questions.open.id)).toMatchObject({
      status: "needs_review",
      autoScore: null,
    });
    expect(attempt.score).toBe(w.questions.mc.points + w.questions.code.points);
  });

  test("wrong code scores 0; blank answers are graded 0 right away", async () => {
    const w = await createBasicWorld();
    const { attemptId } = await start(w);
    await callerFor(w.s1).portal.saveAnswer({
      attemptId,
      questionId: w.questions.code.id,
      response: { code: `print("Hoi")  ${FAIL_MARKER}\n` },
    });
    await callerFor(w.s1).portal.submitAttempt({ attemptId });
    const attempt = await waitForGrading(attemptId);
    expect(attempt.gradingStatus).toBe("graded");
    expect(attempt.score).toBe(0);
  });

  test("the sweep submits only expired attempts in progress", async () => {
    const w = await createBasicWorld({ timeLimitMinutes: 30 });
    const expired = await start(w, w.s1);
    const running = await start(w, w.s2);
    await db
      .update(attempts)
      .set({ deadlineAt: new Date(Date.now() - 120_000) })
      .where(eq(attempts.id, expired.attemptId));
    const done = await autoSubmitExpiredAttempts();
    expect(done).toEqual([expired.attemptId]);
    const rows = await db.select().from(attempts);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(expired.attemptId)).toMatchObject({
      status: "submitted",
      autoSubmitted: true,
    });
    expect(byId.get(running.attemptId)?.status).toBe("in_progress");
    await waitForGrading(expired.attemptId);
  });
});

describe("result visibility", () => {
  async function submitted(settings: Record<string, unknown>) {
    const w = await createBasicWorld({ settings, mode: "exam" });
    const { attemptId } = await start(w);
    await callerFor(w.s1).portal.saveAnswer({
      attemptId,
      questionId: w.questions.mc.id,
      response: { selected: ["a"] },
    });
    await callerFor(w.s1).portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    return { w, attemptId, s1: callerFor(w.s1) };
  }

  test("immediately: visible, hidden tests redacted", async () => {
    const student = await insertStudent();
    const klas = await createClass(undefined, [student.id]);
    const { test: toets, questions } = await createTest({
      questions: [
        q.code({
          tests: [
            {
              id: "zichtbaar",
              kind: "io",
              name: "Zichtbaar",
              stdin: "",
              expectedOutput: "Hallo",
            },
            {
              id: "geheim",
              kind: "io",
              name: "Geheim",
              stdin: "GEHEIME_INVOER",
              expectedOutput: "GEHEIME_UITVOER",
              hidden: true,
            },
          ],
        }),
      ],
    });
    const afname = await createAssignment({
      testId: toets.id,
      classId: klas.id,
      mode: "practice",
      settings: { showResults: "immediately" },
    });
    const caller = callerFor(student);
    const { attemptId } = await caller.portal.startAttempt({
      assignmentId: afname.id,
    });
    await caller.portal.saveAnswer({
      attemptId,
      questionId: questions[0].id,
      response: { code: 'print("Hallo")\n' },
    });
    await caller.portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    const result = await caller.portal.getResult({ attemptId });
    expect(result.visible).toBe(true);
    const json = JSON.stringify(result);
    expect(json).not.toContain("GEHEIME_INVOER");
    expect(json).not.toContain("GEHEIME_UITVOER");
    expect(json).toContain("Verborgen test 2");
  });

  test("after_close: hidden while open, visible once closed", async () => {
    const { w, attemptId, s1 } = await submitted({
      showResults: "after_close",
      maxAttempts: 1,
    });
    expect(await s1.portal.getResult({ attemptId })).toMatchObject({
      visible: false,
      message: "Je ziet je resultaat zodra je docent de toets sluit.",
    });
    await db
      .update(assignments)
      .set({ status: "closed" })
      .where(eq(assignments.id, w.assignment.id));
    expect(await s1.portal.getResult({ attemptId })).toMatchObject({
      visible: true,
    });
  });

  test("after_close with a closing time mentions it", async () => {
    const { w, attemptId, s1 } = await submitted({
      showResults: "after_close",
      maxAttempts: 1,
    });
    await db
      .update(assignments)
      .set({ closesAt: new Date(Date.now() + 3_600_000) })
      .where(eq(assignments.id, w.assignment.id));
    expect(await s1.portal.getResult({ attemptId })).toMatchObject({
      visible: false,
      message: "Je ziet je resultaat zodra de toets gesloten is.",
    });
  });

  test("manual: visible only after the teacher releases results", async () => {
    const { w, attemptId, s1 } = await submitted({
      showResults: "manual",
      maxAttempts: 1,
    });
    expect(await s1.portal.getResult({ attemptId })).toMatchObject({
      visible: false,
    });
    await callerFor(w.teacher).assignment.setResultsReleased({
      id: w.assignment.id,
      released: true,
    });
    expect(await s1.portal.getResult({ attemptId })).toMatchObject({
      visible: true,
    });
  });

  test("never: the result is not shown online", async () => {
    const { w, attemptId, s1 } = await submitted({
      showResults: "never",
      maxAttempts: 1,
    });
    await db
      .update(assignments)
      .set({ status: "closed" })
      .where(eq(assignments.id, w.assignment.id));
    expect(await s1.portal.getResult({ attemptId })).toMatchObject({
      visible: false,
      message:
        "Bij deze toets wordt je resultaat niet online getoond. Je docent bespreekt het met je.",
    });
    const mine = await s1.portal.myResults();
    expect(mine[0]).toMatchObject({ visible: false, score: null, grade: null });
  });
});
