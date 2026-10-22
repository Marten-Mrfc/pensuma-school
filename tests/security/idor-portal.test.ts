/**
 * IDOR: students can only reach their own attempts, and only afnames of
 * classes they belong to.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { answers, assignmentStudents, classMembers } from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  addToClass,
  createAssignment,
  createTest,
  q,
} from "../support/factories";
import { createSecurityFixtures, type SecurityFixtures } from "./fixtures";

let f: SecurityFixtures;

beforeAll(async () => {
  await resetDatabase();
  f = await createSecurityFixtures();
});

afterAll(async () => {
  await f?.cleanup();
});

describe("another student's attempt", () => {
  test("A2 gets NOT_FOUND for every procedure on A1's attempt", async () => {
    const a2 = callerFor(f.a2);
    const attemptId = f.a1AttemptId;
    const calls: [string, () => Promise<unknown>][] = [
      ["getAttempt", () => a2.portal.getAttempt({ attemptId })],
      [
        "saveAnswer",
        () =>
          a2.portal.saveAnswer({
            attemptId,
            questionId: f.questions.open.id,
            response: { text: "overgenomen" },
          }),
      ],
      [
        "logEvents",
        () =>
          a2.portal.logEvents({
            attemptId,
            events: [{ type: "focus_lost" }],
          }),
      ],
      ["heartbeat", () => a2.portal.heartbeat({ attemptId })],
      ["submitAttempt", () => a2.portal.submitAttempt({ attemptId })],
      ["getResult", () => a2.portal.getResult({ attemptId })],
    ];
    for (const [name, run] of calls) {
      await expect(run(), name).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    // Nothing changed on A1's attempt.
    const [open] = await db
      .select()
      .from(answers)
      .where(eq(answers.questionId, f.questions.open.id));
    expect(JSON.stringify(open?.response ?? null)).not.toContain("overgenomen");
  });

  test("B1 (other class) gets NOT_FOUND on A1's attempt", async () => {
    await expect(
      callerFor(f.b1).portal.getAttempt({ attemptId: f.a1AttemptId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("afnames of other classes", () => {
  test("B1 gets NOT_FOUND on class A's afname", async () => {
    const b1 = callerFor(f.b1);
    await expect(
      b1.portal.getAssignment({ id: f.aOpen.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      b1.portal.startAttempt({
        assignmentId: f.aOpen.id,
        accessCode: f.canary.accessCode,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("a planned afname without opening time is invisible", async () => {
    const a1 = callerFor(f.a1);
    await expect(
      a1.portal.getAssignment({ id: f.aPlannedHidden.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      a1.portal.startAttempt({ assignmentId: f.aPlannedHidden.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const dash = await a1.portal.dashboard();
    expect(JSON.stringify(dash)).not.toContain(f.aPlannedHidden.id);
  });

  test("the dashboard lists only the student's own classes", async () => {
    const dash = JSON.stringify(await callerFor(f.b1).portal.dashboard());
    expect(dash).toContain(f.bOpen.id);
    expect(dash).not.toContain(f.aOpen.id);
  });

  test("a non-existent id looks the same as a foreign one", async () => {
    await expect(
      callerFor(f.a1).portal.getAttempt({
        attemptId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("class membership is checked on every call", () => {
  test("A1 removed from class A gets FORBIDDEN on its own attempt", async () => {
    await db.delete(classMembers).where(eq(classMembers.userId, f.a1.id));
    try {
      const a1 = callerFor(f.a1);
      await expect(
        a1.portal.getAttempt({ attemptId: f.a1AttemptId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        a1.portal.saveAnswer({
          attemptId: f.a1AttemptId,
          questionId: f.questions.open.id,
          response: { text: "na verwijderen" },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        a1.portal.getAssignment({ id: f.aOpen.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await addToClass(f.classA.id, f.a1.id);
    }
    await expect(
      callerFor(f.a1).portal.getAttempt({ attemptId: f.a1AttemptId }),
    ).resolves.toBeDefined();
  });
});

describe("foreign question and option ids", () => {
  test("a question of another test is rejected", async () => {
    const { questions } = await createTest({ questions: [q.open()] });
    await expect(
      callerFor(f.a1).portal.saveAnswer({
        attemptId: f.a1AttemptId,
        questionId: questions[0].id,
        response: { text: "elders" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("unknown option ids are filtered out", async () => {
    const out = await callerFor(f.a1).portal.saveAnswer({
      attemptId: f.a1AttemptId,
      questionId: f.questions.mc.id,
      response: { selected: ["verzonnen-optie", "__proto__"] },
    });
    expect(out.status).toBe("empty");
    const [row] = await db
      .select({ response: answers.response })
      .from(answers)
      .where(
        and(
          eq(answers.attemptId, f.a1AttemptId),
          eq(answers.questionId, f.questions.mc.id),
        ),
      );
    expect(row?.response).toEqual({ selected: [] });
  });

  test("a response of the wrong type is rejected", async () => {
    await expect(
      callerFor(f.a1).portal.saveAnswer({
        attemptId: f.a1AttemptId,
        questionId: f.questions.mc.id,
        response: { code: "print(1)" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("targeted afnames (assignment_student)", () => {
  test("a classmate who is not targeted gets NOT_FOUND", async () => {
    const targeted = await createAssignment({
      testId: f.test.id,
      classId: f.classA.id,
      title: "Alleen voor A1",
      mode: "practice",
      status: "open",
      settings: { showResults: "immediately" },
    });
    await db
      .insert(assignmentStudents)
      .values({ assignmentId: targeted.id, userId: f.a1.id });
    await expect(
      callerFor(f.a1).portal.getAssignment({ id: targeted.id }),
    ).resolves.toBeDefined();
    await expect(
      callerFor(f.a2).portal.getAssignment({ id: targeted.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      callerFor(f.a2).portal.startAttempt({ assignmentId: targeted.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const dash = JSON.stringify(await callerFor(f.a2).portal.dashboard());
    expect(dash).not.toContain(targeted.id);
  });
});

describe("access-code abuse controls", () => {
  test("five wrong access codes lock the student out of that afname", async () => {
    const previous = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    try {
      const locked = await createAssignment({
        testId: f.test.id,
        classId: f.classA.id,
        title: "Codeslot",
        mode: "exam",
        status: "open",
        accessCode: "SLOT42",
      });
      const a2 = callerFor(f.a2);
      for (let i = 0; i < 4; i++) {
        await expect(
          a2.portal.startAttempt({
            assignmentId: locked.id,
            accessCode: `FOUT${i}`,
          }),
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: "Onjuiste toegangscode",
        });
      }
      // The fifth failure locks the key (P4 answers it with the lock).
      await expect(
        a2.portal.startAttempt({
          assignmentId: locked.id,
          accessCode: "FOUT5",
        }),
      ).rejects.toThrow();
      // Locked now: even the right code is refused for a while.
      await expect(
        a2.portal.startAttempt({
          assignmentId: locked.id,
          accessCode: "SLOT42",
        }),
      ).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
    } finally {
      if (previous !== undefined) process.env.RATE_LIMIT_DISABLED = previous;
    }
  }, 20_000);

  test("practice attempts have a cooldown between starts", async () => {
    const previous = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    try {
      const practice = await createAssignment({
        testId: f.test.id,
        classId: f.classB.id,
        title: "Oefenen cooldown",
        mode: "practice",
        status: "open",
        settings: { showResults: "immediately", maxAttempts: 10 },
      });
      const b1 = callerFor(f.b1);
      const first = await b1.portal.startAttempt({
        assignmentId: practice.id,
      });
      await b1.portal.submitAttempt({ attemptId: first.attemptId });
      await expect(
        b1.portal.startAttempt({ assignmentId: practice.id }),
      ).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
    } finally {
      if (previous !== undefined) process.env.RATE_LIMIT_DISABLED = previous;
    }
  });
});
