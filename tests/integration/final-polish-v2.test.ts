/**
 * Final server-side polish (group V2):
 * - W01: students see why a result is hidden (dashboard and Resultaten).
 * - W04: a herkansing uses the same toets as the original afname.
 * - W05: bulk grading never overwrites a manual score on the other answers.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import pg from "pg";
import { db } from "@/server/db";
import { answers, assignments, attempts, auditLog } from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  createAssignment,
  createClass,
  createTest,
  insertStudent,
  insertTeacher,
  q,
} from "../support/factories";
import { waitFor } from "../support/wait";

beforeEach(resetDatabase);

/* ------------------------------ W01 hiddenReason ----------------------------- */

describe("hiddenReason on the student dashboard and Resultaten (W01)", () => {
  async function handedIn(
    settings: Record<string, unknown>,
    extra: { resultsReleased?: boolean } = {},
  ) {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    const klas = await createClass(undefined, [student.id]);
    const { test: toets, questions: qs } = await createTest({
      createdById: teacher.id,
      questions: [q.mc()],
    });
    const afname = await createAssignment({
      testId: toets.id,
      classId: klas.id,
      settings: { maxAttempts: 3, ...settings },
      resultsReleased: extra.resultsReleased ?? false,
      createdById: teacher.id,
    });
    const [attempt] = await db
      .insert(attempts)
      .values({
        assignmentId: afname.id,
        userId: student.id,
        status: "submitted",
        submittedAt: new Date(),
        questionOrder: [qs[0].id],
        gradingStatus: "graded",
        score: 1,
        maxScore: 1,
      })
      .returning();
    const s = callerFor(student);
    const dash = await s.portal.dashboard();
    const item = [...dash.open, ...dash.upcoming, ...dash.finished].find(
      (i) => i.id === afname.id,
    );
    const row = (await s.portal.myResults()).find(
      (r) => r.attemptId === attempt.id,
    );
    if (!item?.lastAttempt || !row) throw new Error("hand-in not listed");
    return { last: item.lastAttempt, row };
  }

  test('"never": the teacher discusses the result', async () => {
    const { last, row } = await handedIn({ showResults: "never" });
    expect(last).toMatchObject({
      resultsVisible: false,
      hiddenReason: "never",
      score: null,
      grade: null,
    });
    expect(row).toMatchObject({
      visible: false,
      hiddenReason: "never",
      score: null,
      grade: null,
    });
  });

  test('"manual" before the release and "after_close" while open: pending', async () => {
    for (const showResults of ["manual", "after_close"]) {
      const { last, row } = await handedIn({ showResults });
      expect(last.resultsVisible).toBe(false);
      expect(last.hiddenReason).toBe("pending");
      expect(row.visible).toBe(false);
      expect(row.hiddenReason).toBe("pending");
    }
  });

  test("visible results have no hidden reason", async () => {
    const shown = await handedIn({ showResults: "immediately" });
    expect(shown.last).toMatchObject({ resultsVisible: true, score: 1 });
    expect(shown.last.hiddenReason).toBeNull();
    expect(shown.row).toMatchObject({ visible: true, score: 1 });
    expect(shown.row.hiddenReason).toBeNull();

    const released = await handedIn(
      { showResults: "manual" },
      { resultsReleased: true },
    );
    expect(released.last.hiddenReason).toBeNull();
    expect(released.row.hiddenReason).toBeNull();
  });
});

/* ------------------------------- W04 herkansing ------------------------------ */

describe("a herkansing uses the same toets (W04)", () => {
  async function world() {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    const klas = await createClass(undefined, [student.id]);
    const { test: toets } = await createTest({
      createdById: teacher.id,
      questions: [q.mc()],
    });
    const { test: other } = await createTest({
      createdById: teacher.id,
      questions: [q.mc()],
    });
    const original = await createAssignment({
      testId: toets.id,
      classId: klas.id,
      mode: "exam",
      status: "closed",
      createdById: teacher.id,
    });
    return { teacher, student, klas, toets, other, original };
  }

  test("another toets is refused and nothing is created", async () => {
    const w = await world();
    const t = callerFor(w.teacher);
    await expect(
      t.assignment.create({
        testId: w.other.id,
        classIds: [w.klas.id],
        retakeOfId: w.original.id,
        mode: "exam",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Een herkansing gebruikt dezelfde toets als de oorspronkelijke afname.",
    });
    const rows = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.classId, w.klas.id));
    expect(rows.map((r) => r.id)).toEqual([w.original.id]);
  });

  test("the same toets is fine and remembers the original", async () => {
    const w = await world();
    const t = callerFor(w.teacher);
    const res = await t.assignment.create({
      testId: w.toets.id,
      classIds: [w.klas.id],
      studentIds: [w.student.id],
      retakeOfId: w.original.id,
      mode: "exam",
    });
    const [row] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, res.id));
    expect(row.retakeOfId).toBe(w.original.id);
    expect(row.testId).toBe(w.toets.id);
  });

  test("an unknown original is still NOT_FOUND", async () => {
    const w = await world();
    await expect(
      callerFor(w.teacher).assignment.create({
        testId: w.toets.id,
        classIds: [w.klas.id],
        retakeOfId: crypto.randomUUID(),
        mode: "exam",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/* ---------------------------- W05 bulk grading guard ------------------------- */

describe("feedback.gradeMany keeps existing manual scores (W05)", () => {
  async function threeAnswers() {
    const teacher = await insertTeacher();
    const colleague = await insertTeacher();
    const students = await Promise.all([
      insertStudent(),
      insertStudent(),
      insertStudent(),
    ]);
    const klas = await createClass(
      undefined,
      students.map((s) => s.id),
    );
    const { test: toets, questions: qs } = await createTest({
      questions: [q.open({}, { points: 2 })],
    });
    const afname = await createAssignment({
      testId: toets.id,
      classId: klas.id,
      createdById: teacher.id,
    });
    const answerIds: string[] = [];
    const attemptIds: string[] = [];
    for (const s of students) {
      const [attempt] = await db
        .insert(attempts)
        .values({
          assignmentId: afname.id,
          userId: s.id,
          status: "submitted",
          submittedAt: new Date(),
          questionOrder: [qs[0].id],
          gradingStatus: "needs_review",
          score: 0,
          maxScore: 2,
        })
        .returning();
      const [answer] = await db
        .insert(answers)
        .values({
          attemptId: attempt.id,
          questionId: qs[0].id,
          response: { text: "Een functie kun je hergebruiken." },
          status: "needs_review",
          maxScore: 2,
        })
        .returning();
      attemptIds.push(attempt.id);
      answerIds.push(answer.id);
    }
    // The colleague already scored the second answer.
    const colleagueReviewedAt = new Date(Date.now() - 60_000);
    await db
      .update(answers)
      .set({
        manualScore: 2,
        status: "graded",
        feedback: "Mooi uitgelegd.",
        reviewedById: colleague.id,
        reviewedAt: colleagueReviewedAt,
      })
      .where(eq(answers.id, answerIds[1]));
    return { teacher, colleague, answerIds, attemptIds, colleagueReviewedAt };
  }

  const scores = async (ids: string[]) =>
    Object.fromEntries(
      (
        await db
          .select({
            id: answers.id,
            manualScore: answers.manualScore,
            reviewedById: answers.reviewedById,
            feedback: answers.feedback,
          })
          .from(answers)
          .where(inArray(answers.id, ids))
      ).map((r) => [r.id, r]),
    );

  test("identical answers that already have a manual score are skipped and counted", async () => {
    const w = await threeAnswers();
    const [a1, a2, a3] = w.answerIds;
    const res = await callerFor(w.teacher).feedback.gradeMany({
      answerIds: [a1, a2, a3],
      manualScore: 1,
      feedback: "Bijna goed.",
    });
    expect(res).toMatchObject({
      updated: 2,
      skippedGraded: 1,
      skippedRestricted: 0,
      recomputed: true,
    });
    expect(res.answerIds).toEqual([a1, a3]);
    expect(res.attemptIds.sort()).toEqual(
      [w.attemptIds[0], w.attemptIds[2]].sort(),
    );

    const after = await scores(w.answerIds);
    expect(after[a1]).toMatchObject({
      manualScore: 1,
      reviewedById: w.teacher.id,
    });
    expect(after[a3]).toMatchObject({
      manualScore: 1,
      reviewedById: w.teacher.id,
    });
    // The colleague's score, feedback and name stay.
    expect(after[a2]).toMatchObject({
      manualScore: 2,
      reviewedById: w.colleague.id,
      feedback: "Mooi uitgelegd.",
    });
    const [kept] = await db
      .select({ score: attempts.score })
      .from(attempts)
      .where(eq(attempts.id, w.attemptIds[1]));
    expect(kept.score).toBe(0);

    // Only the graded answers are logged as a score change.
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "answer.score_changed"));
    expect(audits.map((a) => a.subjectId).sort()).toEqual([a1, a3].sort());
  });

  test("the answer being graded directly is always saved, even when it had a score", async () => {
    const w = await threeAnswers();
    const [a1, a2, a3] = w.answerIds;
    const t = callerFor(w.teacher);
    // The teacher corrects the colleague's score on a2 itself; a1 and a3
    // are still open, so they follow.
    const first = await t.feedback.gradeMany({
      answerIds: [a2, a1, a3],
      manualScore: 1.5,
    });
    expect(first).toMatchObject({ updated: 3, skippedGraded: 0 });
    expect(first.answerIds[0]).toBe(a2);
    let after = await scores(w.answerIds);
    expect(after[a2]).toMatchObject({
      manualScore: 1.5,
      reviewedById: w.teacher.id,
    });
    const change = (
      await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "answer.score_changed"))
    ).find((r) => r.subjectId === a2);
    expect(change?.details).toMatchObject({ from: 2, to: 1.5, bulk: true });

    // Now all three have a manual score: a second bulk save from a3 only
    // changes a3.
    const second = await t.feedback.gradeMany({
      answerIds: [a3, a1, a2],
      manualScore: 0.5,
    });
    expect(second).toMatchObject({ updated: 1, skippedGraded: 2 });
    expect(second.answerIds).toEqual([a3]);
    after = await scores(w.answerIds);
    expect(after[a3].manualScore).toBe(0.5);
    expect(after[a1].manualScore).toBe(1.5);
    expect(after[a2].manualScore).toBe(1.5);
  });

  test("a score another teacher saves while the bulk save runs is kept", async () => {
    const w = await threeAnswers();
    const [a1, , a3] = w.answerIds;
    // A colleague is saving a score for a3 right now: their transaction
    // holds the row while the bulk save reads it as "not scored yet".
    const colleague = new pg.Client({
      connectionString: process.env.DATABASE_URL,
    });
    await colleague.connect();
    try {
      await colleague.query("begin");
      await colleague.query(
        "update answer set manual_score = 2, reviewed_by_id = $1 where id = $2",
        [w.colleague.id, a3],
      );
      const bulk = callerFor(w.teacher).feedback.gradeMany({
        answerIds: [a1, a3],
        manualScore: 1,
      });
      // Wait until the bulk UPDATE is blocked on the colleague's row lock.
      await waitFor(
        async () => {
          const res = await db.execute<{ n: number }>(sql`
            select count(*)::int as n from pg_stat_activity
            where datname = current_database()
              and wait_event_type = 'Lock'
              and query ilike 'update "answer"%'`);
          return res.rows[0]?.n > 0;
        },
        { message: "the bulk save never reached its UPDATE" },
      );
      await colleague.query("commit");
      const res = await bulk;
      expect(res).toMatchObject({ updated: 1, skippedGraded: 1 });
      expect(res.answerIds).toEqual([a1]);
    } finally {
      await colleague.query("rollback").catch(() => {});
      await colleague.end();
    }
    const after = await scores([a1, a3]);
    expect(after[a1].manualScore).toBe(1);
    expect(after[a3]).toMatchObject({
      manualScore: 2,
      reviewedById: w.colleague.id,
    });
  });

  test("a single answer with criteria can still be re-graded", async () => {
    const w = await threeAnswers();
    const res = await callerFor(w.teacher).feedback.gradeMany({
      answerIds: [w.answerIds[1]],
      manualScore: 0,
    });
    expect(res).toMatchObject({ updated: 1, skippedGraded: 0 });
    expect((await scores([w.answerIds[1]]))[w.answerIds[1]].manualScore).toBe(
      0,
    );
  });
});
