/**
 * Server-side follow-ups of the review fixes (group S1): right answers and
 * exports wait for classmates with verlengde tijd, retention holds stop
 * the last deletes, specific audit actions, undoing a neutralised question
 * after a reopen, focus losses per facility, the AVG art. 18 restriction
 * on teacher changes, and a server log without leerlingnummers.
 */
import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  assignments,
  attemptEvents,
  attempts,
  auditLog,
  classMembers,
  retentionHolds,
  studentAccommodations,
  tests,
  user,
} from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { drainGrading, resetDatabase } from "../support/db";
import {
  createAssignment,
  createBasicWorld,
  createClass,
  createTest,
  insertStudent,
  insertTeacher,
  nextStudentNumber,
  type QuestionSpec,
  q,
} from "../support/factories";
import { settleGrading, waitForGrading } from "../support/wait";

beforeEach(resetDatabase);

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function auditRows(action: string) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, action as never));
}

async function addHold(opts: {
  userId?: string;
  assignmentId?: string;
  kind?: "dispute" | "exam_dossier" | "restriction";
}) {
  const [hold] = await db
    .insert(retentionHolds)
    .values({
      userId: opts.userId ?? null,
      assignmentId: opts.assignmentId ?? null,
      kind: opts.kind ?? "exam_dossier",
      reason: "PTA-toets bewaren",
    })
    .returning();
  return hold;
}

async function restrict(teacherId: string, userId: string) {
  const teacher = await db.select().from(user).where(eq(user.id, teacherId));
  await callerFor({
    id: teacherId,
    name: teacher[0]?.name ?? "Docent",
    email: teacher[0]?.email ?? "",
    role: "admin",
    username: null,
  }).privacy.setRestriction({
    userId,
    restricted: true,
    reason: "Ouder betwist een score",
  });
}

/** A submitted attempt with graded answers, inserted directly. */
async function submittedAttempt(
  assignmentId: string,
  userId: string,
  scores: {
    questionId: string;
    autoScore: number | null;
    maxScore: number;
    status?: "graded" | "needs_review";
  }[],
) {
  const [attempt] = await db
    .insert(attempts)
    .values({
      assignmentId,
      userId,
      status: "submitted",
      startedAt: minutesAgo(40),
      submittedAt: minutesAgo(5),
      questionOrder: scores.map((x) => x.questionId),
      score: scores.reduce((s, x) => s + (x.autoScore ?? 0), 0),
      maxScore: scores.reduce((s, x) => s + x.maxScore, 0),
      gradingStatus: "graded",
    })
    .returning();
  const rows = await db
    .insert(answers)
    .values(
      scores.map((x) => ({
        attemptId: attempt.id,
        questionId: x.questionId,
        response: { text: "Mijn uitleg" } as never,
        status: x.status ?? ("graded" as const),
        autoScore: x.autoScore,
        maxScore: x.maxScore,
        savedAt: minutesAgo(6),
        gradedAt: minutesAgo(4),
      })),
    )
    .returning();
  return { attempt, answers: rows };
}

/**
 * Practice afname with model solutions after the close (60 minutes, one
 * attempt): s1 hands in, s2 (50% verlengde tijd) is still working when
 * the teacher closes it.
 */
async function closedWhileClassmateWorks(
  showResults: "after_close" | "immediately" = "after_close",
) {
  const w = await createBasicWorld({
    mode: "practice",
    timeLimitMinutes: 60,
    settings: {
      showResults,
      showSolutions: "after_close",
      maxAttempts: 1,
    },
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
    response: { selected: ["a"] },
  });
  await s1.portal.submitAttempt({ attemptId: a1 });
  const { attemptId: a2 } = await s2.portal.startAttempt({
    assignmentId: w.assignment.id,
  });
  await waitForGrading(a1);
  const closed = await callerFor(w.teacher).assignment.close({
    id: w.assignment.id,
  });
  expect(closed.stillWorking).toBe(1);
  return { ...w, s1c: s1, s2c: s2, a1, a2 };
}

/* ------------------------------ S02 / S03 ------------------------------- */

describe("model solutions and exports wait for classmates with verlengde tijd", () => {
  test("help.solutions (after_close) waits until everyone has handed in", async () => {
    // Results right away, model solutions after the close.
    const w = await closedWhileClassmateWorks("immediately");
    const waiting = await w.s1c.help.solutions({ attemptId: w.a1 });
    expect(waiting.available).toBe(false);
    expect(waiting.message).toBe(
      "De modeloplossingen zie je zodra iedereen klaar is met de toets.",
    );
    expect(JSON.stringify(waiting)).not.toContain("Hallo");

    await w.s2c.portal.submitAttempt({ attemptId: w.a2 });
    await waitForGrading(w.a2);
    const shown = await w.s1c.help.solutions({ attemptId: w.a1 });
    expect(shown.available).toBe(true);
    expect(shown.solutions[w.questions.code.id]?.solution).toContain("Hallo");
    await drainGrading();
  });

  test("help.solutions while the results themselves wait (after_close) shows nothing yet", async () => {
    const w = await closedWhileClassmateWorks("after_close");
    const res = await w.s1c.help.solutions({ attemptId: w.a1 });
    expect(res).toEqual({ available: false, message: null, solutions: {} });
    await w.s2c.portal.submitAttempt({ attemptId: w.a2 });
    await waitForGrading(w.a2);
    expect((await w.s1c.help.solutions({ attemptId: w.a1 })).available).toBe(
      true,
    );
    await drainGrading();
  });

  test("help.solutions before the close still says the toets must close", async () => {
    const w = await createBasicWorld({
      settings: {
        showResults: "immediately",
        showSolutions: "after_close",
        maxAttempts: 1,
      },
    });
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await s1.portal.submitAttempt({ attemptId });
    const res = await s1.help.solutions({ attemptId });
    expect(res).toMatchObject({
      available: false,
      message: "De modeloplossingen zie je zodra de toets gesloten is.",
    });
    await drainGrading();
  });

  test("privacy.myData and exportMyData hold back results while a classmate works", async () => {
    const w = await closedWhileClassmateWorks();
    const mine = await w.s1c.privacy.myData();
    expect(mine.attempts).toMatchObject({ submitted: 1, withResults: 0 });
    expect(mine.attempts.recent).toEqual([]);
    expect((await w.s1c.privacy.exportMyData()).attempts).toHaveLength(0);
    // The teacher's export for an inzageverzoek has everything.
    const forTeacher = await callerFor(w.teacher).privacy.exportStudent({
      userId: w.s1.id,
    });
    expect(forTeacher.attempts).toHaveLength(1);

    await w.s2c.portal.submitAttempt({ attemptId: w.a2 });
    await waitForGrading(w.a2);
    const after = await w.s1c.privacy.myData();
    expect(after.attempts.withResults).toBe(1);
    expect((await w.s1c.privacy.exportMyData()).attempts).toHaveLength(1);
    await drainGrading();
  });
});

/* ------------------------------ S04 / S05 ------------------------------- */

describe("retention holds stop the remaining deletes", () => {
  async function world() {
    const teacher = await insertTeacher();
    const s1 = await insertStudent();
    const klas = await createClass(undefined, [s1.id]);
    const { test: toets, questions: qs } = await createTest({
      createdById: teacher.id,
      questions: [q.open({}, { points: 2 })],
    });
    const afname = await createAssignment({
      testId: toets.id,
      classId: klas.id,
      mode: "exam",
    });
    return { teacher, s1, klas, toets, open: qs[0], afname };
  }

  test("privacy.deleteAttemptEvents: refused under a hold on the afname or the student", async () => {
    const w = await world();
    const { attempt } = await submittedAttempt(w.afname.id, w.s1.id, [
      { questionId: w.open.id, autoScore: null, maxScore: 2 },
    ]);
    await db.insert(attemptEvents).values([
      { attemptId: attempt.id, type: "focus_lost" },
      { attemptId: attempt.id, type: "focus_gained" },
    ]);
    const t = callerFor(w.teacher);
    for (const scope of [
      { assignmentId: w.afname.id },
      { userId: w.s1.id, kind: "dispute" as const },
    ]) {
      const hold = await addHold(scope);
      await expect(
        t.privacy.deleteAttemptEvents({ attemptId: attempt.id }),
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining(
          "Je kunt het logboek daarom niet wissen.",
        ),
      });
      expect(
        await db
          .select()
          .from(attemptEvents)
          .where(eq(attemptEvents.attemptId, attempt.id)),
      ).toHaveLength(2);
      await db.delete(retentionHolds).where(eq(retentionHolds.id, hold.id));
    }
    expect(await auditRows("attempt.events_deleted")).toHaveLength(0);

    await expect(
      t.privacy.deleteAttemptEvents({ attemptId: attempt.id }),
    ).resolves.toEqual({ deleted: 2 });
  });

  test("test.delete: refused under a hold on one of its afnames (even without attempts)", async () => {
    const w = await world();
    const hold = await addHold({ assignmentId: w.afname.id });
    const t = callerFor(w.teacher);
    await expect(t.test.delete({ id: w.toets.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining(
        "Je kunt de toets daarom niet verwijderen.",
      ),
    });
    // Nothing cascaded away: the toets, the afname and the hold remain.
    expect(
      await db.select().from(tests).where(eq(tests.id, w.toets.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(retentionHolds)
        .where(eq(retentionHolds.id, hold.id)),
    ).toHaveLength(1);

    await db.delete(retentionHolds).where(eq(retentionHolds.id, hold.id));
    await expect(t.test.delete({ id: w.toets.id })).resolves.toEqual({
      id: w.toets.id,
    });
    expect(
      await db
        .select()
        .from(assignments)
        .where(eq(assignments.id, w.afname.id)),
    ).toHaveLength(0);
    const [audit] = await auditRows("trpc.mutation");
    expect(audit).toMatchObject({ subjectType: "test", subjectId: w.toets.id });
    expect(audit.details).toMatchObject({
      path: "test.delete",
      assignmentsCount: 1,
    });
  });

  test("test.delete: a hold on a student with work wins; work alone still refuses", async () => {
    const w = await world();
    await submittedAttempt(w.afname.id, w.s1.id, [
      { questionId: w.open.id, autoScore: null, maxScore: 2 },
    ]);
    const t = callerFor(w.teacher);
    await expect(t.test.delete({ id: w.toets.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("Archiveer de toets"),
    });
    await addHold({ userId: w.s1.id, kind: "dispute" });
    await expect(t.test.delete({ id: w.toets.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining(`leerling ${w.s1.username}`),
    });
    expect(
      await db.select().from(attempts).where(eq(attempts.userId, w.s1.id)),
    ).toHaveLength(1);
  });
});

/* ---------------------------------- S06 --------------------------------- */

describe("creating and importing students is audited per student", () => {
  test("student.create writes student.created with the leerlingnummer", async () => {
    const teacher = await insertTeacher();
    const klas = await createClass();
    const number = nextStudentNumber();
    const { user: created } = await callerFor(teacher).student.create({
      studentNumber: number,
      name: "Nieuwe Leerling",
      classId: klas.id,
    });
    const rows = await auditRows("student.created");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: teacher.id,
      subjectType: "student",
      subjectId: created.id,
      subjectUserId: created.id,
      subjectLabel: number,
    });
    expect(rows[0].details).toEqual({ classId: klas.id });
    expect(JSON.stringify(rows[0])).not.toContain("Nieuwe Leerling");
    // Semantic row, so no generic "Wijziging" next to it.
    expect(await auditRows("trpc.mutation")).toHaveLength(0);
  });

  test("student.import: a summary, student.created per new account, student.updated per rename", async () => {
    const teacher = await insertTeacher();
    const klas = await createClass();
    const existing = await insertStudent({ name: "Oude Naam" });
    const same = await insertStudent({ name: "Zelfde Naam" });
    const n1 = nextStudentNumber();
    const n2 = nextStudentNumber();
    const res = await callerFor(teacher).student.import({
      classId: klas.id,
      onExisting: "update_name",
      rows: [
        { studentNumber: n1, name: "Eerste Nieuw" },
        { studentNumber: n2, name: "Tweede Nieuw" },
        { studentNumber: existing.username ?? "", name: "Nieuwe Naam" },
        { studentNumber: same.username ?? "", name: "Zelfde Naam" },
        { studentNumber: "12", name: "Te kort nummer" },
      ],
    });
    expect(res.created).toHaveLength(2);
    expect(res.errors).toHaveLength(1);

    const created = await auditRows("student.created");
    expect(created.map((r) => r.subjectLabel).sort()).toEqual([n1, n2].sort());
    for (const r of created) {
      expect(r.subjectUserId).toBeTruthy();
      expect(r.details).toEqual({ classId: klas.id, via: "import" });
    }
    const updated = await auditRows("student.updated");
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      subjectUserId: existing.id,
      subjectLabel: existing.username,
    });
    expect(updated[0].details).toEqual({ fields: ["name"], via: "import" });

    const [summary, ...more] = await auditRows("student.imported");
    expect(more).toHaveLength(0);
    expect(summary).toMatchObject({ subjectType: "class", subjectId: klas.id });
    expect(summary.details).toEqual({
      classId: klas.id,
      rowsCount: 5,
      createdCount: 2,
      existingCount: 2,
      renamedCount: 1,
      addedToClassCount: 4,
      errorsCount: 1,
    });
    const all = JSON.stringify(await db.select().from(auditLog));
    for (const name of ["Eerste Nieuw", "Nieuwe Naam", "Oude Naam"]) {
      expect(all).not.toContain(name);
    }
  });
});

/* ---------------------------------- S07 --------------------------------- */

describe("specific audit actions", () => {
  test("deleting a question without answers is still 'Vraag verwijderd'", async () => {
    const teacher = await insertTeacher();
    const { test: toets, questions: qs } = await createTest({
      createdById: teacher.id,
      status: "draft",
      questions: [q.mc(), q.open()],
    });
    await callerFor(teacher).question.delete({ id: qs[0].id });
    const rows = await auditRows("question.deleted");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      subjectType: "question",
      subjectId: qs[0].id,
      subjectUserId: null,
    });
    expect(rows[0].details).toMatchObject({
      questionId: qs[0].id,
      testId: toets.id,
      studentsCount: 0,
    });
    expect(await auditRows("trpc.mutation")).toHaveLength(0);
  });
});

/* ---------------------------------- S08 --------------------------------- */

describe("undoing a neutralised question after a reopen", () => {
  test("a manual score for an answer the student has since changed does not come back", async () => {
    const w = await createBasicWorld({
      settings: { showResults: "immediately", maxAttempts: 1 },
    });
    const t = callerFor(w.teacher);
    const openId = w.questions.open.id;
    const takeAndReview = async (who: typeof w.s1, score: number) => {
      const c = callerFor(who);
      const { attemptId } = await c.portal.startAttempt({
        assignmentId: w.assignment.id,
      });
      await c.portal.saveAnswer({
        attemptId,
        questionId: openId,
        response: { text: "weet ik niet" },
      });
      await c.portal.submitAttempt({ attemptId });
      await waitForGrading(attemptId);
      const [row] = await db
        .select()
        .from(answers)
        .where(
          and(eq(answers.attemptId, attemptId), eq(answers.questionId, openId)),
        );
      await t.review.setManualScore({ answerId: row.id, manualScore: score });
      return { attemptId, answerId: row.id };
    };
    const changed = await takeAndReview(w.s1, 0.5);
    const kept = await takeAndReview(w.s2, 1.5);

    await t.analysis.neutralizeQuestion({
      assignmentId: w.assignment.id,
      questionId: openId,
      mode: "full_points",
    });

    // s1's attempt is reopened and the answer changed: the review is gone.
    await t.assignment.reopenAttempt({
      attemptId: changed.attemptId,
      minutes: 10,
    });
    const s1 = callerFor(w.s1);
    await s1.portal.saveAnswer({
      attemptId: changed.attemptId,
      questionId: openId,
      response: { text: "Een for-lus gebruik je als je weet hoe vaak." },
    });
    await s1.portal.submitAttempt({ attemptId: changed.attemptId });
    await waitForGrading(changed.attemptId);

    await t.analysis.neutralizeQuestion({
      assignmentId: w.assignment.id,
      questionId: openId,
      mode: null,
    });
    const answerRow = async (id: string) =>
      (await db.select().from(answers).where(eq(answers.id, id)))[0];
    const s1Answer = await answerRow(changed.answerId);
    expect(s1Answer.manualScore).toBeNull();
    expect(s1Answer.status).toBe("needs_review");
    // The review that still stands comes back.
    expect((await answerRow(kept.answerId)).manualScore).toBe(1.5);
    const [s1Attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, changed.attemptId));
    expect(s1Attempt.gradingStatus).toBe("needs_review");
    await drainGrading();
  });

  test("switching modes after the change does not bring the old score back either", async () => {
    const w = await createBasicWorld({
      settings: { showResults: "immediately", maxAttempts: 1 },
    });
    const t = callerFor(w.teacher);
    const openId = w.questions.open.id;
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await s1.portal.saveAnswer({
      attemptId,
      questionId: openId,
      response: { text: "weet ik niet" },
    });
    await s1.portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    const [row] = await db
      .select()
      .from(answers)
      .where(
        and(eq(answers.attemptId, attemptId), eq(answers.questionId, openId)),
      );
    await t.review.setManualScore({ answerId: row.id, manualScore: 0.5 });
    await t.analysis.neutralizeQuestion({
      assignmentId: w.assignment.id,
      questionId: openId,
      mode: "drop",
    });
    await t.assignment.reopenAttempt({ attemptId, minutes: 10 });
    await s1.portal.saveAnswer({
      attemptId,
      questionId: openId,
      response: { text: "Een ander antwoord" },
    });
    await s1.portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    await t.analysis.neutralizeQuestion({
      assignmentId: w.assignment.id,
      questionId: openId,
      mode: "full_points",
    });
    await t.analysis.neutralizeQuestion({
      assignmentId: w.assignment.id,
      questionId: openId,
      mode: null,
    });
    const [after] = await db
      .select()
      .from(answers)
      .where(eq(answers.id, row.id));
    expect(after.manualScore).toBeNull();
    await drainGrading();
  });

  test("a new review of the changed answer survives a switch to 'drop' and the undo", async () => {
    const w = await createBasicWorld({
      settings: { showResults: "immediately", maxAttempts: 1 },
    });
    const t = callerFor(w.teacher);
    const openId = w.questions.open.id;
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await s1.portal.saveAnswer({
      attemptId,
      questionId: openId,
      response: { text: "weet ik niet" },
    });
    await s1.portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    const [row] = await db
      .select()
      .from(answers)
      .where(
        and(eq(answers.attemptId, attemptId), eq(answers.questionId, openId)),
      );
    await t.review.setManualScore({ answerId: row.id, manualScore: 0.5 });
    await t.analysis.neutralizeQuestion({
      assignmentId: w.assignment.id,
      questionId: openId,
      mode: "full_points",
    });
    // Reopened, changed, and reviewed again while the question gave full
    // points: that newer review belongs to the answer as it is now.
    await t.assignment.reopenAttempt({ attemptId, minutes: 10 });
    await s1.portal.saveAnswer({
      attemptId,
      questionId: openId,
      response: { text: "Een for-lus herhaalt een vast aantal keer." },
    });
    await s1.portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    await t.review.setManualScore({ answerId: row.id, manualScore: 1 });

    await t.analysis.neutralizeQuestion({
      assignmentId: w.assignment.id,
      questionId: openId,
      mode: "drop",
    });
    await t.analysis.neutralizeQuestion({
      assignmentId: w.assignment.id,
      questionId: openId,
      mode: null,
    });
    const [after] = await db
      .select()
      .from(answers)
      .where(eq(answers.id, row.id));
    expect(after.manualScore).toBe(1);
    expect(after.maxScore).toBe(2);
    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(attempt.score).toBeGreaterThanOrEqual(1);
    await drainGrading();
  });
});

/* ---------------------------------- S09 --------------------------------- */

describe("portal.logEvents counts focus losses per the student's settings", () => {
  test("with 'vensterwissels niet registreren' a fullscreen exit is logged but not counted", async () => {
    const w = await createBasicWorld({
      mode: "exam",
      settings: {
        showResults: "after_close",
        maxAttempts: 1,
        logFocusEvents: true,
        requireFullscreen: true,
      },
    });
    await db
      .insert(studentAccommodations)
      .values({ userId: w.s1.id, ignoreFocusEvents: true });
    const events = [
      { type: "fullscreen_exit" as const },
      { type: "focus_lost" as const },
      { type: "visibility_hidden" as const },
    ];

    const s1 = callerFor(w.s1);
    const { attemptId: a1 } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const r1 = await s1.portal.logEvents({ attemptId: a1, events });
    expect(r1).toEqual({ logged: 1, dropped: 2 });
    const stored = await db
      .select({ type: attemptEvents.type })
      .from(attemptEvents)
      .where(
        and(
          eq(attemptEvents.attemptId, a1),
          sql`${attemptEvents.type} in ('fullscreen_exit', 'focus_lost', 'visibility_hidden')`,
        ),
      );
    expect(stored.map((e) => e.type)).toEqual(["fullscreen_exit"]);
    const [row1] = await db.select().from(attempts).where(eq(attempts.id, a1));
    expect(row1.focusLossCount).toBe(0);

    // Without the facility every loss counts.
    const s2 = callerFor(w.s2);
    const { attemptId: a2 } = await s2.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const r2 = await s2.portal.logEvents({ attemptId: a2, events });
    expect(r2).toEqual({ logged: 3, dropped: 0 });
    const [row2] = await db.select().from(attempts).where(eq(attempts.id, a2));
    expect(row2.focusLossCount).toBe(3);
  });
});

/* ---------------------------------- S10 --------------------------------- */

describe("AVG art. 18: a restriction stops teacher changes on the server", () => {
  async function world() {
    const teacher = await insertTeacher();
    const s1 = await insertStudent();
    const s2 = await insertStudent();
    const klas = await createClass(undefined, [s1.id, s2.id]);
    const specs: QuestionSpec[] = [q.open({}, { points: 2 })];
    const { test: toets, questions: qs } = await createTest({
      createdById: teacher.id,
      questions: specs,
    });
    const afname = await createAssignment({
      testId: toets.id,
      classId: klas.id,
      mode: "exam",
      status: "closed",
      closesAt: minutesAgo(1),
      settings: { showResults: "after_close", maxAttempts: 1 },
    });
    const open = qs[0];
    const r1 = await submittedAttempt(afname.id, s1.id, [
      {
        questionId: open.id,
        autoScore: null,
        maxScore: 2,
        status: "needs_review",
      },
    ]);
    const r2 = await submittedAttempt(afname.id, s2.id, [
      {
        questionId: open.id,
        autoScore: null,
        maxScore: 2,
        status: "needs_review",
      },
    ]);
    return { teacher, s1, s2, klas, toets, afname, open, r1, r2 };
  }

  test("review.setManualScore: refused, unless overridden (and then logged)", async () => {
    const w = await world();
    await restrict(w.teacher.id, w.s1.id);
    const t = callerFor(w.teacher);
    const answerId = w.r1.answers[0].id;
    await expect(
      t.review.setManualScore({ answerId, manualScore: 1 }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("AVG art. 18"),
    });
    const [untouched] = await db
      .select()
      .from(answers)
      .where(eq(answers.id, answerId));
    expect(untouched.manualScore).toBeNull();
    expect(untouched.reviewedAt).toBeNull();

    await t.review.setManualScore({
      answerId,
      manualScore: 1,
      overrideRestriction: true,
    });
    const [changed] = await auditRows("answer.score_changed");
    expect(changed.subjectUserId).toBe(w.s1.id);
    expect(changed.details).toMatchObject({
      from: null,
      to: 1,
      restrictionOverridden: true,
    });
    // Other students are not affected.
    await expect(
      t.review.setManualScore({
        answerId: w.r2.answers[0].id,
        manualScore: 2,
      }),
    ).resolves.toMatchObject({ manualScore: 2 });
  });

  test("review.regradeAttempt and regradeAssignment leave a restricted student's scores alone", async () => {
    const w = await world();
    await restrict(w.teacher.id, w.s1.id);
    const t = callerFor(w.teacher);
    await expect(
      t.review.regradeAttempt({ attemptId: w.r1.attempt.id }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await t.review.regradeAttempt({
      attemptId: w.r1.attempt.id,
      overrideRestriction: true,
    });
    const overridden = (await auditRows("trpc.mutation")).find(
      (r) => (r.details as { path?: string }).path === "review.regradeAttempt",
    );
    expect(overridden).toMatchObject({ subjectUserId: w.s1.id });
    expect(overridden?.details).toMatchObject({ restrictionOverridden: true });

    const res = await t.review.regradeAssignment({
      assignmentId: w.afname.id,
    });
    expect(res).toMatchObject({
      total: 2,
      scheduled: 1,
      skippedRestricted: 1,
    });
    await settleGrading();
  });

  test("assignment.reopenAttempt: refused, unless overridden (and then logged)", async () => {
    const w = await world();
    await restrict(w.teacher.id, w.s1.id);
    const t = callerFor(w.teacher);
    await expect(
      t.assignment.reopenAttempt({ attemptId: w.r1.attempt.id, minutes: 10 }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const [still] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, w.r1.attempt.id));
    expect(still.status).toBe("submitted");
    await t.assignment.reopenAttempt({
      attemptId: w.r1.attempt.id,
      minutes: 10,
      overrideRestriction: true,
    });
    const [audit] = await auditRows("attempt.reopened");
    expect(audit.subjectUserId).toBe(w.s1.id);
    expect(audit.details).toMatchObject({ restrictionOverridden: true });
  });

  test("feedback.gradeMany skips restricted students and says so; only restricted → refused", async () => {
    const w = await world();
    await restrict(w.teacher.id, w.s1.id);
    const t = callerFor(w.teacher);
    const res = await t.feedback.gradeMany({
      answerIds: [w.r1.answers[0].id, w.r2.answers[0].id],
      manualScore: 1,
    });
    expect(res).toMatchObject({ updated: 1, skippedRestricted: 1 });
    const scores = Object.fromEntries(
      (await db.select().from(answers)).map((a) => [a.id, a.manualScore]),
    );
    expect(scores[w.r1.answers[0].id]).toBeNull();
    expect(scores[w.r2.answers[0].id]).toBe(1);
    expect(
      (await auditRows("answer.score_changed")).map((r) => r.subjectUserId),
    ).toEqual([w.s2.id]);

    await expect(
      t.feedback.gradeMany({ answerIds: [w.r1.answers[0].id], manualScore: 2 }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("AVG art. 18"),
    });
    const forced = await t.feedback.gradeMany({
      answerIds: [w.r1.answers[0].id],
      manualScore: 2,
      overrideRestriction: true,
    });
    expect(forced).toMatchObject({ updated: 1, skippedRestricted: 0 });
    const forcedAudit = (await auditRows("answer.score_changed")).find(
      (r) => r.subjectUserId === w.s1.id,
    );
    expect(forcedAudit?.details).toMatchObject({ restrictionOverridden: true });
  });

  test("class.addMembers skips, class.removeMember refuses unless overridden", async () => {
    const w = await world();
    const s3 = await insertStudent();
    await restrict(w.teacher.id, s3.id);
    await restrict(w.teacher.id, w.s1.id);
    const other = await createClass();
    const t = callerFor(w.teacher);
    const added = await t.class.addMembers({
      classId: other.id,
      userIds: [s3.id, w.s2.id],
    });
    expect(added).toEqual({ added: 1, alreadyMember: 0, skippedRestricted: 1 });
    await expect(
      t.class.addMembers({ classId: other.id, userIds: [s3.id] }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    await expect(
      t.class.removeMember({ classId: w.klas.id, userId: w.s1.id }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("AVG art. 18"),
    });
    const stillMember = await db
      .select()
      .from(classMembers)
      .where(
        and(
          eq(classMembers.classId, w.klas.id),
          eq(classMembers.userId, w.s1.id),
        ),
      );
    expect(stillMember).toHaveLength(1);
    await t.class.removeMember({
      classId: w.klas.id,
      userId: w.s1.id,
      overrideRestriction: true,
    });
    const removed = (await auditRows("trpc.mutation")).find(
      (r) => (r.details as { path?: string }).path === "class.removeMember",
    );
    expect(removed).toMatchObject({
      subjectUserId: w.s1.id,
      subjectLabel: w.s1.username,
    });
    expect(removed?.details).toMatchObject({ restrictionOverridden: true });
    // An unrestricted student is removed as before.
    await expect(
      t.class.removeMember({ classId: w.klas.id, userId: w.s2.id }),
    ).resolves.toEqual({ classId: w.klas.id, userId: w.s2.id });
  });

  test("student.import does not rename or add a restricted student to the class", async () => {
    const w = await world();
    await restrict(w.teacher.id, w.s1.id);
    const other = await createClass();
    const res = await callerFor(w.teacher).student.import({
      classId: other.id,
      onExisting: "update_name",
      rows: [{ studentNumber: w.s1.username ?? "", name: "Andere Naam" }],
    });
    expect(res.existing[0]).toMatchObject({
      restricted: true,
      nameUpdated: false,
      addedToClass: false,
    });
    expect(
      await db
        .select()
        .from(classMembers)
        .where(eq(classMembers.classId, other.id)),
    ).toHaveLength(0);
  });

  test("review.exportCsv: a restricted student's row has no results", async () => {
    const w = await world();
    const t = callerFor(w.teacher);
    await t.review.setManualScore({
      answerId: w.r1.answers[0].id,
      manualScore: 1.5,
    });
    await t.review.setManualScore({
      answerId: w.r2.answers[0].id,
      manualScore: 2,
    });
    await restrict(w.teacher.id, w.s1.id);
    const out = await t.review.exportCsv({ assignmentId: w.afname.id });
    expect(out.restrictedCount).toBe(1);
    const lines = out.csv.replace(/^﻿/, "").split("\r\n");
    const s1Line = lines.find((l) => l.startsWith(w.s1.username ?? "-"));
    const s2Line = lines.find((l) => l.startsWith(w.s2.username ?? "-"));
    expect(s1Line).toContain("Verwerking beperkt (AVG art. 18)");
    expect(s1Line).not.toContain("1,5");
    expect(s1Line?.split(";").slice(3).join("")).toBe("");
    expect(s2Line).toContain("Ingeleverd");
    expect(s2Line).toContain(";2;");
    const [audit] = await auditRows("results.exported");
    expect(audit.details).toMatchObject({ rows: 2, restrictedRows: 1 });
  });
});

/* ---------------------------------- S11 --------------------------------- */

describe("a failed student creation never logs the leerlingnummer or the query", () => {
  const FAIL_NAME = "Faal Bij Aanmaken";

  async function withFailingInsert<T>(run: () => Promise<T>): Promise<T> {
    await db.execute(sql`
      create or replace function pensuma_test_fail_user() returns trigger
      language plpgsql as $$
      begin
        if new.name = ${sql.raw(`'${FAIL_NAME}'`)} then
          raise exception 'kapot voor %', new.username using errcode = '23514';
        end if;
        return new;
      end $$`);
    await db.execute(sql`
      create trigger pensuma_test_fail_user before insert on "user"
      for each row execute function pensuma_test_fail_user()`);
    try {
      return await run();
    } finally {
      await db.execute(
        sql`drop trigger if exists pensuma_test_fail_user on "user"`,
      );
      await db.execute(sql`drop function if exists pensuma_test_fail_user()`);
    }
  }

  test("student.create: a Dutch error without the number, the database error as cause", async () => {
    const teacher = await insertTeacher();
    const number = nextStudentNumber();
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const error = await withFailingInsert(() =>
        callerFor(teacher)
          .student.create({ studentNumber: number, name: FAIL_NAME })
          .then(
            () => null,
            (e: unknown) => e,
          ),
      );
      expect(error).toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Het account kon niet worden aangemaakt. Probeer het opnieuw.",
      });
      // The tRPC error log reads the SQLSTATE from the cause chain.
      let cause = (error as { cause?: unknown }).cause;
      let code: unknown;
      while (cause instanceof Error && code === undefined) {
        code = (cause as { code?: unknown }).code;
        cause = cause.cause;
      }
      expect(code).toBe("23514");
      const logged = spy.mock.calls.flat().map(String).join("\n");
      expect(logged).not.toContain(number);
      expect(
        await db.select().from(user).where(eq(user.username, number)),
      ).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  test("student.import: one JSON line with an error code, shown to the teacher too", async () => {
    const teacher = await insertTeacher();
    const ok = nextStudentNumber();
    const bad = nextStudentNumber();
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await withFailingInsert(() =>
        callerFor(teacher).student.import({
          rows: [
            { studentNumber: ok, name: "Gaat Goed" },
            { studentNumber: bad, name: FAIL_NAME },
          ],
        }),
      );
      expect(res.created.map((c) => c.studentNumber)).toEqual([ok]);
      expect(res.errors).toHaveLength(1);
      const [failure] = res.errors;
      expect(failure.studentNumber).toBe(bad);
      const match = failure.message.match(/foutcode: ([0-9a-f-]{8})/);
      expect(match).not.toBeNull();

      const lines = spy.mock.calls.map((c) => String(c[0]));
      const line = lines.find((l) =>
        l.includes("student.import_create_failed"),
      );
      expect(line).toBeDefined();
      const parsed = JSON.parse(line ?? "{}");
      expect(parsed).toMatchObject({
        level: "error",
        event: "student.import_create_failed",
        errorId: match?.[1],
        db: { code: "23514" },
      });
      expect(parsed.message).toBeUndefined();
      const all = lines.join("\n");
      expect(all).not.toContain(bad);
      expect(all).not.toContain(FAIL_NAME);
      expect(all).not.toContain("params");
    } finally {
      spy.mockRestore();
    }
  });
});
