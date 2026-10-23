/**
 * Teacher side of the afname/attempt lifecycle: retention holds stop
 * deletes (reset, afname, klas, question), deletions and per-student
 * changes are audited with the student, deadlines survive reopen and
 * edits, a targeted afname stays targeted when its students are erased,
 * and deleting a question keeps stored scores in step.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  assignmentStudents,
  assignments,
  attempts,
  auditLog,
  classes,
  retentionHolds,
  user,
} from "@/server/db/schema";
import { backfillTargetingFlags } from "@/server/services/assignment-targets";
import { callerFor } from "../support/caller";
import { drainGrading, resetDatabase } from "../support/db";
import {
  addToClass,
  createAssignment,
  createClass,
  createTest,
  insertStudent,
  insertTeacher,
  q,
} from "../support/factories";

beforeEach(resetDatabase);

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);

async function world() {
  const teacher = await insertTeacher();
  const s1 = await insertStudent();
  const s2 = await insertStudent();
  const s3 = await insertStudent();
  const klas = await createClass(undefined, [s1.id, s2.id, s3.id]);
  const { test: toets, questions } = await createTest({
    createdById: teacher.id,
    questions: [q.mc({}, { points: 1 }), q.open({}, { points: 2 })],
  });
  const afname = await createAssignment({
    testId: toets.id,
    classId: klas.id,
    mode: "exam",
    settings: { showResults: "after_close", maxAttempts: 1 },
  });
  const [mc, open] = questions;
  return { teacher, s1, s2, s3, klas, toets, mc, open, afname };
}

/** A submitted, graded attempt with an answer per question. */
async function submittedAttempt(
  assignmentId: string,
  userId: string,
  scores: { questionId: string; autoScore: number; maxScore: number }[],
) {
  const total = scores.reduce((s, x) => s + x.autoScore, 0);
  const max = scores.reduce((s, x) => s + x.maxScore, 0);
  const [attempt] = await db
    .insert(attempts)
    .values({
      assignmentId,
      userId,
      status: "submitted",
      startedAt: minutesAgo(40),
      submittedAt: minutesAgo(5),
      questionOrder: scores.map((x) => x.questionId),
      score: total,
      maxScore: max,
      gradingStatus: "graded",
    })
    .returning();
  await db.insert(answers).values(
    scores.map((x) => ({
      attemptId: attempt.id,
      questionId: x.questionId,
      response: { selected: ["a"] } as never,
      status: "graded" as const,
      autoScore: x.autoScore,
      maxScore: x.maxScore,
      savedAt: minutesAgo(6),
      gradedAt: minutesAgo(4),
    })),
  );
  return attempt;
}

async function addHold(opts: {
  userId?: string;
  assignmentId?: string;
  kind?: "dispute" | "exam_dossier" | "restriction";
  until?: Date | null;
}) {
  const [hold] = await db
    .insert(retentionHolds)
    .values({
      userId: opts.userId ?? null,
      assignmentId: opts.assignmentId ?? null,
      kind: opts.kind ?? "exam_dossier",
      reason: "PTA-toets bewaren",
      until: opts.until ?? null,
    })
    .returning();
  return hold;
}

async function exists<T>(rows: Promise<T[]>) {
  return (await rows).length > 0;
}

async function auditRows(action: string) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, action as never));
}

describe("retention holds stop teacher deletes", () => {
  test("resetting an attempt: refused under a hold on the afname or the student", async () => {
    const w = await world();
    const attempt = await submittedAttempt(w.afname.id, w.s1.id, [
      { questionId: w.mc.id, autoScore: 1, maxScore: 1 },
    ]);
    const t = callerFor(w.teacher);

    const afnameHold = await addHold({ assignmentId: w.afname.id });
    await expect(
      t.assignment.resetAttempt({ attemptId: attempt.id }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("Examendossier: PTA-toets bewaren"),
    });
    await db.delete(retentionHolds).where(eq(retentionHolds.id, afnameHold.id));

    await addHold({ userId: w.s1.id, kind: "restriction" });
    await expect(
      t.assignment.resetAttempt({ attemptId: attempt.id }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining(`leerling ${w.s1.username}`),
    });
    expect(
      await exists(
        db.select().from(attempts).where(eq(attempts.id, attempt.id)),
      ),
    ).toBe(true);
  });

  test("an expired hold does not block; the reset is audited with the student", async () => {
    const w = await world();
    const attempt = await submittedAttempt(w.afname.id, w.s1.id, [
      { questionId: w.mc.id, autoScore: 1, maxScore: 1 },
    ]);
    await addHold({ assignmentId: w.afname.id, until: minutesAgo(60) });
    await callerFor(w.teacher).assignment.resetAttempt({
      attemptId: attempt.id,
    });
    expect(
      await exists(
        db.select().from(attempts).where(eq(attempts.id, attempt.id)),
      ),
    ).toBe(false);
    const [row] = await auditRows("attempt.reset");
    expect(row).toMatchObject({
      subjectType: "attempt",
      subjectId: attempt.id,
      subjectUserId: w.s1.id,
      subjectLabel: w.s1.username,
    });
    expect(row.details).toMatchObject({
      attemptId: attempt.id,
      assignmentId: w.afname.id,
      attemptNumber: 1,
    });
    // No generic safety-net row on top.
    expect(await auditRows("trpc.mutation")).toHaveLength(0);
  });

  test("deleting an afname: refused under a hold, and the hold survives", async () => {
    const w = await world();
    await submittedAttempt(w.afname.id, w.s1.id, [
      { questionId: w.mc.id, autoScore: 1, maxScore: 1 },
    ]);
    const t = callerFor(w.teacher);
    const hold = await addHold({ assignmentId: w.afname.id, kind: "dispute" });
    await expect(
      t.assignment.delete({ id: w.afname.id }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("Bezwaar of beroep"),
    });
    expect(
      await exists(
        db.select().from(retentionHolds).where(eq(retentionHolds.id, hold.id)),
      ),
    ).toBe(true);

    // A hold on a student with work in it blocks it too.
    await db.delete(retentionHolds).where(eq(retentionHolds.id, hold.id));
    await addHold({ userId: w.s1.id, kind: "restriction" });
    await expect(
      t.assignment.delete({ id: w.afname.id }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(
      await exists(
        db.select().from(assignments).where(eq(assignments.id, w.afname.id)),
      ),
    ).toBe(true);
  });

  test("deleting an afname without holds: one audit row per student", async () => {
    const w = await world();
    await submittedAttempt(w.afname.id, w.s1.id, [
      { questionId: w.mc.id, autoScore: 1, maxScore: 1 },
    ]);
    await submittedAttempt(w.afname.id, w.s2.id, [
      { questionId: w.mc.id, autoScore: 0, maxScore: 1 },
    ]);
    // A hold on an unrelated student does not matter.
    await addHold({ userId: w.s3.id, kind: "restriction" });
    const res = await callerFor(w.teacher).assignment.delete({
      id: w.afname.id,
    });
    expect(res.deletedAttempts).toBe(2);
    const perStudent = await auditRows("attempt.reset");
    expect(perStudent.map((r) => r.subjectUserId).sort()).toEqual(
      [w.s1.id, w.s2.id].sort(),
    );
    for (const r of perStudent) {
      expect(r.details).toMatchObject({
        path: "assignment.delete",
        assignmentId: w.afname.id,
        attemptsCount: 1,
      });
      expect(r.subjectLabel).toBeTruthy();
    }
    const [summary] = await auditRows("trpc.mutation");
    expect(summary.details).toMatchObject({
      path: "assignment.delete",
      deletedAttempts: 2,
      studentsCount: 2,
    });
  });

  test("deleting a klas: refused under a hold on one of its afnames", async () => {
    const w = await world();
    await submittedAttempt(w.afname.id, w.s1.id, [
      { questionId: w.mc.id, autoScore: 1, maxScore: 1 },
    ]);
    const hold = await addHold({ assignmentId: w.afname.id });
    const t = callerFor(w.teacher);
    await expect(t.class.delete({ id: w.klas.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("archiveer de klas"),
    });
    expect(
      await exists(db.select().from(classes).where(eq(classes.id, w.klas.id))),
    ).toBe(true);
    expect(
      await exists(
        db.select().from(retentionHolds).where(eq(retentionHolds.id, hold.id)),
      ),
    ).toBe(true);

    await db.delete(retentionHolds).where(eq(retentionHolds.id, hold.id));
    await t.class.delete({ id: w.klas.id });
    const [row] = await auditRows("attempt.reset");
    expect(row).toMatchObject({
      subjectType: "class",
      subjectId: w.klas.id,
      subjectUserId: w.s1.id,
    });
    expect(row.details).toMatchObject({
      path: "class.delete",
      classId: w.klas.id,
    });
  });
});

describe("deleting a question", () => {
  test("refused under a hold, even with force; the answers stay", async () => {
    const w = await world();
    const attempt = await submittedAttempt(w.afname.id, w.s1.id, [
      { questionId: w.mc.id, autoScore: 1, maxScore: 1 },
      { questionId: w.open.id, autoScore: 2, maxScore: 2 },
    ]);
    await addHold({ assignmentId: w.afname.id });
    await expect(
      callerFor(w.teacher).question.delete({ id: w.open.id, force: true }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("vervallen"),
    });
    const left = await db
      .select()
      .from(answers)
      .where(eq(answers.attemptId, attempt.id));
    expect(left).toHaveLength(2);
  });

  test("recomputes the stored scores of handed-in attempts and audits per student", async () => {
    const w = await world();
    const done = await submittedAttempt(w.afname.id, w.s1.id, [
      { questionId: w.mc.id, autoScore: 1, maxScore: 1 },
      { questionId: w.open.id, autoScore: 0.5, maxScore: 2 },
    ]);
    // A running attempt is left alone (graded at its hand-in).
    const [running] = await db
      .insert(attempts)
      .values({
        assignmentId: w.afname.id,
        userId: w.s2.id,
        startedAt: minutesAgo(5),
        questionOrder: [w.mc.id, w.open.id],
      })
      .returning();
    await db.insert(answers).values([
      { attemptId: running.id, questionId: w.mc.id, maxScore: 1 },
      { attemptId: running.id, questionId: w.open.id, maxScore: 2 },
    ]);

    const res = await callerFor(w.teacher).question.delete({
      id: w.mc.id,
      force: true,
    });
    expect(res).toMatchObject({ answerCount: 2, recomputedAttempts: 1 });
    const [after] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, done.id));
    expect(after.score).toBe(0.5);
    expect(after.maxScore).toBe(2);
    expect(after.gradingStatus).toBe("graded");
    const [stillRunning] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, running.id));
    expect(stillRunning.status).toBe("in_progress");
    expect(stillRunning.score).toBeNull();

    // The student's view and the teacher's results agree.
    const result = await callerFor(w.s1).portal.getResult({
      attemptId: done.id,
    });
    expect(result.visible).toBe(false); // after_close, still open
    await db
      .update(assignments)
      .set({ status: "closed", closesAt: new Date() })
      .where(eq(assignments.id, w.afname.id));
    const shown = await callerFor(w.s1).portal.getResult({
      attemptId: done.id,
    });
    if (!shown.visible) throw new Error("result should be visible");
    expect(shown.score).toBe(0.5);
    expect(shown.maxScore).toBe(2);

    const rows = await auditRows("trpc.mutation");
    const summary = rows.find((r) => r.subjectUserId == null);
    expect(summary?.details).toMatchObject({
      path: "question.delete",
      questionId: w.mc.id,
      answersCount: 2,
      attemptsAffected: 2,
      studentsCount: 2,
    });
    expect(
      rows
        .filter((r) => r.subjectUserId != null)
        .map((r) => r.subjectUserId)
        .sort(),
    ).toEqual([w.s1.id, w.s2.id].sort());
    await drainGrading();
  });
});

describe("per-student changes are audited with the student", () => {
  test("extendTime and reopenAttempt", async () => {
    const w = await world();
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
      mode: "exam",
      timeLimitMinutes: 30,
    });
    const [running] = await db
      .insert(attempts)
      .values({
        assignmentId: a.id,
        userId: w.s1.id,
        startedAt: minutesAgo(10),
        deadlineAt: minutesFromNow(20),
      })
      .returning();
    const done = await submittedAttempt(a.id, w.s2.id, [
      { questionId: w.mc.id, autoScore: 1, maxScore: 1 },
    ]);
    const t = callerFor(w.teacher);
    await t.assignment.extendTime({ attemptId: running.id, minutes: 5 });
    await t.assignment.reopenAttempt({ attemptId: done.id, minutes: 10 });
    const rows = await auditRows("trpc.mutation");
    const extend = rows.find(
      (r) => (r.details as { path?: string }).path === "assignment.extendTime",
    );
    expect(extend).toMatchObject({
      subjectType: "attempt",
      subjectId: running.id,
      subjectUserId: w.s1.id,
      subjectLabel: w.s1.username,
    });
    expect(extend?.details).toMatchObject({ minutes: 5 });
    const reopen = rows.find(
      (r) =>
        (r.details as { path?: string }).path === "assignment.reopenAttempt",
    );
    expect(reopen).toMatchObject({
      subjectId: done.id,
      subjectUserId: w.s2.id,
      subjectLabel: w.s2.username,
    });
  });

  test("feedback.gradeMany writes one row per answer with the student", async () => {
    const w = await world();
    const a1 = await submittedAttempt(w.afname.id, w.s1.id, [
      { questionId: w.open.id, autoScore: 0, maxScore: 2 },
    ]);
    const a2 = await submittedAttempt(w.afname.id, w.s2.id, [
      { questionId: w.open.id, autoScore: 0, maxScore: 2 },
    ]);
    const rows = await db
      .select({ id: answers.id, attemptId: answers.attemptId })
      .from(answers)
      .where(inArray(answers.attemptId, [a1.id, a2.id]));
    await callerFor(w.teacher).feedback.gradeMany({
      answerIds: rows.map((r) => r.id),
      manualScore: 1.5,
    });
    const audit = await auditRows("answer.score_changed");
    expect(audit).toHaveLength(2);
    for (const r of rows) {
      const entry = audit.find((x) => x.subjectId === r.id);
      expect(entry).toBeTruthy();
      expect(entry?.subjectUserId).toBe(
        r.attemptId === a1.id ? w.s1.id : w.s2.id,
      );
      expect(entry?.details).toMatchObject({
        answerId: r.id,
        attemptId: r.attemptId,
        from: null,
        to: 1.5,
      });
    }
  });
});

describe("deadlines survive reopening and editing", () => {
  test("reopening a closed afname gives verlengde tijd back", async () => {
    const w = await world();
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
      mode: "exam",
      timeLimitMinutes: 60,
    });
    const startedAt = minutesAgo(10);
    const personal = new Date(startedAt.getTime() + 90 * 60_000);
    const [attempt] = await db
      .insert(attempts)
      .values({
        assignmentId: a.id,
        userId: w.s1.id,
        startedAt,
        deadlineAt: personal,
        accommodationMinutes: 30,
      })
      .returning();
    const t = callerFor(w.teacher);
    await t.assignment.close({ id: a.id });
    const [closed] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attempt.id));
    // Cut off at the closing time + 30 minutes.
    expect(closed.deadlineAt?.getTime()).toBeLessThan(personal.getTime());

    const res = await t.assignment.reopen({ id: a.id });
    expect(res).toMatchObject({
      effectiveStatus: "open",
      restoredDeadlines: 1,
    });
    const [reopened] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attempt.id));
    expect(reopened.deadlineAt?.getTime()).toBe(personal.getTime());
  });

  test("reopening the afname never shortens an attempt reopened by hand", async () => {
    const w = await world();
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
      mode: "exam",
      status: "closed",
      closesAt: minutesAgo(30),
      timeLimitMinutes: 50,
    });
    const done = await submittedAttempt(a.id, w.s1.id, [
      { questionId: w.mc.id, autoScore: 1, maxScore: 1 },
    ]);
    const t = callerFor(w.teacher);
    const { deadlineAt } = await t.assignment.reopenAttempt({
      attemptId: done.id,
      minutes: 15,
    });
    await t.assignment.reopen({ id: a.id });
    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, done.id));
    expect(row.deadlineAt?.getTime()).toBe(deadlineAt?.getTime());
  });

  test("moving the end time keeps a reopened attempt's own deadline", async () => {
    const w = await world();
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
      mode: "exam",
      timeLimitMinutes: 50,
      closesAt: minutesFromNow(60),
    });
    // Started 55 minutes ago and handed in; reopened for 15 minutes.
    const [done] = await db
      .insert(attempts)
      .values({
        assignmentId: a.id,
        userId: w.s1.id,
        status: "submitted",
        startedAt: minutesAgo(55),
        submittedAt: minutesAgo(5),
        questionOrder: [w.mc.id, w.open.id],
        score: 1,
        maxScore: 3,
        gradingStatus: "graded",
      })
      .returning();
    // A regular running attempt, for contrast.
    const [regular] = await db
      .insert(attempts)
      .values({
        assignmentId: a.id,
        userId: w.s2.id,
        startedAt: minutesAgo(10),
        deadlineAt: minutesFromNow(40),
      })
      .returning();
    const t = callerFor(w.teacher);
    const { deadlineAt } = await t.assignment.reopenAttempt({
      attemptId: done.id,
      minutes: 15,
    });

    const res = await t.assignment.update({
      id: a.id,
      closesAt: minutesFromNow(90),
      timeLimitMinutes: 20,
    });
    expect(res.recomputedDeadlines).toBe(1);
    const [reopened] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, done.id));
    expect(reopened.deadlineAt?.getTime()).toBe(deadlineAt?.getTime());
    // The student can still save (not cut off).
    await expect(
      callerFor(w.s1).portal.saveAnswer({
        attemptId: done.id,
        questionId: w.mc.id,
        response: { selected: ["a"] },
      }),
    ).resolves.toMatchObject({ status: "saved" });
    // A deliberate shorter limit still applies to regular attempts.
    const [shortened] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, regular.id));
    const minutes =
      ((shortened.deadlineAt?.getTime() ?? 0) - regular.startedAt.getTime()) /
      60_000;
    expect(Math.round(minutes)).toBe(20);
  });

  test("saving unchanged window values recomputes nothing", async () => {
    const w = await world();
    const closesAt = minutesFromNow(60);
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
      mode: "exam",
      timeLimitMinutes: 50,
      closesAt,
    });
    const custom = minutesFromNow(7);
    const [running] = await db
      .insert(attempts)
      .values({
        assignmentId: a.id,
        userId: w.s1.id,
        startedAt: minutesAgo(10),
        deadlineAt: custom,
      })
      .returning();
    const res = await callerFor(w.teacher).assignment.update({
      id: a.id,
      title: "Nieuwe titel",
      timeLimitMinutes: 50,
      closesAt: new Date(closesAt.getTime()),
    });
    expect(res.recomputedDeadlines).toBe(0);
    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, running.id));
    expect(row.deadlineAt?.getTime()).toBe(custom.getTime());
  });
});

describe("a targeted afname stays targeted", () => {
  async function targetedWorld() {
    const w = await world();
    const temp = await insertStudent();
    await addToClass(w.klas.id, temp.id);
    const t = callerFor(w.teacher);
    const created = await t.assignment.create({
      testId: w.toets.id,
      classIds: [w.klas.id],
      studentIds: [temp.id],
      mode: "exam",
      openNow: true,
      generateAccessCode: false,
    });
    return { ...w, temp, t, afnameId: created.id };
  }

  const listed = async (caller: ReturnType<typeof callerFor>, id: string) => {
    const dash = await caller.portal.dashboard();
    return [...dash.open, ...dash.upcoming, ...dash.finished].some(
      (i) => i.id === id,
    );
  };

  test("erasing the only selected student hides it from the class", async () => {
    const w = await targetedWorld();
    const s1 = callerFor(w.s1);
    expect(await listed(s1, w.afnameId)).toBe(false);
    // Erasure cascades the assignment_student rows away.
    await db.delete(user).where(eq(user.id, w.temp.id));
    expect(
      await exists(
        db
          .select()
          .from(assignmentStudents)
          .where(eq(assignmentStudents.assignmentId, w.afnameId)),
      ),
    ).toBe(false);
    expect(await listed(s1, w.afnameId)).toBe(false);
    await expect(
      s1.portal.startAttempt({ assignmentId: w.afnameId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const info = await w.t.assignment.get({ id: w.afnameId });
    expect(info.targetedStudentCount).toBe(0);
    expect(info.targetedStudentIds).toEqual([]);
    expect(info.counts.students).toBe(0);
  });

  test("editing settings keeps the flag; 'whole class' clears it", async () => {
    const w = await targetedWorld();
    await w.t.assignment.update({
      id: w.afnameId,
      settings: { shuffleQuestions: true },
    });
    await db.delete(user).where(eq(user.id, w.temp.id));
    const s1 = callerFor(w.s1);
    expect(await listed(s1, w.afnameId)).toBe(false);

    await w.t.assignment.setStudents({ id: w.afnameId, userIds: null });
    expect(await listed(s1, w.afnameId)).toBe(true);
    await w.t.assignment.setStudents({ id: w.afnameId, userIds: [w.s2.id] });
    expect(await listed(s1, w.afnameId)).toBe(false);
    expect(await listed(callerFor(w.s2), w.afnameId)).toBe(true);
  });

  test("older targeted afnames get the flag from the backfill", async () => {
    const w = await world();
    const temp = await insertStudent();
    await db
      .insert(assignmentStudents)
      .values({ assignmentId: w.afname.id, userId: temp.id });
    expect(await backfillTargetingFlags(db)).toBe(1);
    expect(await backfillTargetingFlags(db)).toBe(0);
    await db.delete(user).where(eq(user.id, temp.id));
    expect(await listed(callerFor(w.s1), w.afname.id)).toBe(false);
  });

  test("a whole-class afname is unaffected", async () => {
    const w = await world();
    expect(await listed(callerFor(w.s1), w.afname.id)).toBe(true);
    const info = await callerFor(w.teacher).assignment.get({ id: w.afname.id });
    expect(info.targetedStudentIds).toBeNull();
    expect(info.counts.students).toBe(3);
  });
});
