/** Afnames (teacher side): plan, open/close/reopen, monitor, time and attempts. */
import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  assignments,
  attemptEvents,
  attempts,
} from "@/server/db/schema";
import { computeAttemptDeadline } from "@/server/services/assignment-status";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  createBasicWorld,
  createClass,
  createTest,
  insertStudent,
  insertTeacher,
  q,
} from "../support/factories";
import { waitForGrading } from "../support/wait";

beforeEach(resetDatabase);

const ACCESS_CODE_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

describe("create", () => {
  test("a published test is planned for a class", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    const klas = await createClass(undefined, [student.id]);
    const { test: toets } = await createTest({ questions: [q.mc()] });
    const out = await callerFor(teacher).assignment.create({
      testId: toets.id,
      classId: klas.id,
      mode: "exam",
      title: "Toets H1",
      generateAccessCode: true,
    });
    expect(out.effectiveStatus).toBe("planned");
    expect(out.accessCode).toMatch(ACCESS_CODE_ALPHABET);
    const [row] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, out.id));
    expect(row).toMatchObject({
      mode: "exam",
      status: "planned",
      createdById: teacher.id,
    });
    // Planned without an opening time: invisible to the student.
    await expect(
      callerFor(student).portal.getAssignment({ id: out.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("test and class must exist; drafts can't be planned", async () => {
    const teacher = await insertTeacher();
    const klas = await createClass();
    const t = callerFor(teacher);
    await expect(
      t.assignment.create({
        testId: "00000000-0000-4000-8000-000000000000",
        classId: klas.id,
        mode: "practice",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { test: draft } = await createTest({ status: "draft" });
    await expect(
      t.assignment.create({
        testId: draft.id,
        classId: klas.id,
        mode: "practice",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { test: toets } = await createTest();
    await expect(
      t.assignment.create({
        testId: toets.id,
        classId: "00000000-0000-4000-8000-000000000000",
        mode: "practice",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("open, close, reopen", () => {
  test("the state machine and its effect on the portal", async () => {
    const w = await createBasicWorld();
    const t = callerFor(w.teacher);
    const s1 = callerFor(w.s1);
    await db
      .update(assignments)
      .set({ status: "planned" })
      .where(eq(assignments.id, w.assignment.id));

    expect(
      (await t.assignment.open({ id: w.assignment.id })).effectiveStatus,
    ).toBe("open");
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });

    const closed = await t.assignment.close({ id: w.assignment.id });
    expect(closed).toMatchObject({ autoSubmitted: 1, stillWorking: 0 });
    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(attempt).toMatchObject({ status: "submitted", autoSubmitted: true });
    await expect(
      callerFor(w.s2).portal.startAttempt({ assignmentId: w.assignment.id }),
    ).rejects.toMatchObject({ message: "Deze toets is gesloten." });

    expect(
      (await t.assignment.reopen({ id: w.assignment.id })).effectiveStatus,
    ).toBe("open");
    await expect(
      callerFor(w.s2).portal.startAttempt({ assignmentId: w.assignment.id }),
    ).resolves.toMatchObject({ resumed: false });
    await waitForGrading(attemptId);
  });

  test("regenerateAccessCode uses the unambiguous alphabet", async () => {
    const w = await createBasicWorld({ accessCode: "OUD123" });
    const t = callerFor(w.teacher);
    const codes = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const out = await t.assignment.regenerateAccessCode({
        id: w.assignment.id,
      });
      expect(out.accessCode).toMatch(ACCESS_CODE_ALPHABET);
      codes.add(out.accessCode);
    }
    expect(codes.has("OUD123")).toBe(false);
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("attempts", () => {
  test("extendTime recomputes the deadline with the extra minutes", async () => {
    const w = await createBasicWorld({ timeLimitMinutes: 30 });
    const { attemptId } = await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const [before] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    const out = await callerFor(w.teacher).assignment.extendTime({
      attemptId,
      minutes: 10,
    });
    expect(out.extraMinutes).toBe(10);
    const expected = computeAttemptDeadline(w.assignment, before.startedAt, 10);
    expect(expected).not.toBeNull();
    expect(out.deadlineAt?.getTime() ?? 0).toBe(expected?.getTime() ?? -1);
    const events = await db
      .select()
      .from(attemptEvents)
      .where(eq(attemptEvents.attemptId, attemptId));
    expect(events.map((e) => e.type)).toContain("time_extended");
  });

  test("extendTime refuses a submitted attempt", async () => {
    const w = await createBasicWorld({ timeLimitMinutes: 30 });
    const { attemptId } = await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await callerFor(w.s1).portal.submitAttempt({ attemptId });
    await expect(
      callerFor(w.teacher).assignment.extendTime({ attemptId, minutes: 5 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await waitForGrading(attemptId);
  });

  test("reopenAttempt puts a submitted attempt back in progress", async () => {
    const w = await createBasicWorld({ timeLimitMinutes: 30 });
    const { attemptId } = await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await callerFor(w.s1).portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    const out = await callerFor(w.teacher).assignment.reopenAttempt({
      attemptId,
      minutes: 15,
    });
    expect(out.deadlineAt?.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(row).toMatchObject({
      status: "in_progress",
      submittedAt: null,
      autoSubmitted: false,
    });
    await expect(
      callerFor(w.s1).portal.saveAnswer({
        attemptId,
        questionId: w.questions.open.id,
        response: { text: "nog even" },
      }),
    ).resolves.toMatchObject({ status: "saved" });
  });

  test("resetAttempt deletes the attempt with its answers and events", async () => {
    const w = await createBasicWorld();
    const { attemptId } = await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await callerFor(w.teacher).assignment.resetAttempt({ attemptId });
    expect(
      await db.select().from(attempts).where(eq(attempts.id, attemptId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(answers).where(eq(answers.attemptId, attemptId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(attemptEvents)
        .where(eq(attemptEvents.attemptId, attemptId)),
    ).toHaveLength(0);
    // The student may start fresh.
    await expect(
      callerFor(w.s1).portal.startAttempt({ assignmentId: w.assignment.id }),
    ).resolves.toMatchObject({ resumed: false });
  });

  test("monitor lists every class member, also those who didn't start", async () => {
    const w = await createBasicWorld();
    await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const out = await callerFor(w.teacher).assignment.monitor({
      id: w.assignment.id,
    });
    expect(out.students).toHaveLength(2);
    expect(out.summary).toMatchObject({
      students: 2,
      notStarted: 1,
      inProgress: 1,
      submitted: 0,
    });
    const s2 = out.students.find((s) => s.student.id === w.s2.id);
    expect(s2).toBeDefined();
    expect(s2?.attempt).toBeNull();
  });

  test("delete removes the afname and its attempts", async () => {
    const w = await createBasicWorld();
    await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const out = await callerFor(w.teacher).assignment.delete({
      id: w.assignment.id,
    });
    expect(out.deletedAttempts).toBe(1);
    expect(await db.select().from(attempts)).toHaveLength(0);
  });
});
