/**
 * AVG compliance fixes: retention of unsubmitted attempts and expired holds,
 * audit hygiene (facilities, erasure, PIN views, similarity), restriction
 * enforcement, export completeness and copy events that are never stored.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  assignmentStudents,
  attemptEvents,
  attempts,
  auditLog,
  classes,
  retentionHolds,
  studentAccommodations,
  user,
} from "@/server/db/schema";
import { runRetention } from "@/server/privacy/retention-core";
import { savePrivacySettings } from "@/server/privacy/settings-store";
import { callerFor, type TestUser } from "../support/caller";
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

const NOW = new Date();
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

let teacher: TestUser;

beforeEach(async () => {
  await resetDatabase();
  teacher = await insertTeacher();
});

async function confirmAutoDelete() {
  await savePrivacySettings(
    db,
    {
      retention: {
        attemptsMonths: 6,
        inactiveStudentMonths: 3,
        autoDeleteAttempts: true,
        confirmedAt: daysAgo(1).toISOString(),
        confirmedById: null,
      },
    },
    null,
  );
}

async function auditRows(where: { action?: string; subjectUserId?: string }) {
  const rows = await db.select().from(auditLog);
  return rows.filter(
    (r) =>
      (!where.action || r.action === where.action) &&
      (!where.subjectUserId || r.subjectUserId === where.subjectUserId),
  );
}

/* ------------------------------ F17 retention ----------------------------- */

describe("retention: attempts that were never handed in", () => {
  async function attemptIn(
    student: TestUser,
    opts: {
      classId: string;
      mode?: "exam" | "practice";
      closesAt: Date | null;
      status?: "planned" | "open" | "closed";
      attemptStatus: "in_progress" | "submitted";
      activity: Date;
    },
  ) {
    const { test: t, questions } = await createTest();
    const assignment = await createAssignment({
      testId: t.id,
      classId: opts.classId,
      mode: opts.mode ?? "exam",
      status: opts.status ?? "closed",
      closesAt: opts.closesAt,
    });
    const [attempt] = await db
      .insert(attempts)
      .values({
        assignmentId: assignment.id,
        userId: student.id,
        status: opts.attemptStatus,
        startedAt: opts.activity,
        submittedAt: opts.attemptStatus === "submitted" ? opts.activity : null,
        lastSeenAt: opts.activity,
      })
      .returning();
    // Raw update: updated_at must reflect the seeded activity.
    await db
      .update(attempts)
      .set({ updatedAt: opts.activity })
      .where(eq(attempts.id, attempt.id));
    await db.insert(answers).values({
      attemptId: attempt.id,
      questionId: questions[0].id,
      response: { selected: ["a"] },
      maxScore: 1,
      savedAt: opts.activity,
      createdAt: opts.activity,
      updatedAt: opts.activity,
    });
    await db.insert(attemptEvents).values({
      attemptId: attempt.id,
      type: "code_run",
      createdAt: opts.activity,
    });
    return { assignment, attempt };
  }

  const exists = async (id: string) =>
    (await db.select().from(attempts).where(eq(attempts.id, id))).length === 1;

  test("an in_progress attempt in an afname that closed long ago is deleted and counted", async () => {
    await confirmAutoDelete();
    const s = await insertStudent();
    const klas = await createClass(undefined, [s.id]);
    const abandoned = await attemptIn(s, {
      classId: klas.id,
      closesAt: daysAgo(300),
      attemptStatus: "in_progress",
      activity: daysAgo(301),
    });
    // Afname still open: an old start is no reason to delete.
    const stillOpen = await attemptIn(s, {
      classId: klas.id,
      status: "open",
      closesAt: new Date(NOW.getTime() + 7 * DAY),
      attemptStatus: "in_progress",
      activity: daysAgo(300),
    });
    // Practice afname that never closes: idle for longer than the period.
    const idlePractice = await attemptIn(s, {
      classId: klas.id,
      mode: "practice",
      status: "open",
      closesAt: null,
      attemptStatus: "in_progress",
      activity: daysAgo(250),
    });
    // Practice, recently active (an answer saved last week).
    const activePractice = await attemptIn(s, {
      classId: klas.id,
      mode: "practice",
      status: "open",
      closesAt: null,
      attemptStatus: "in_progress",
      activity: daysAgo(250),
    });
    await db
      .update(answers)
      .set({ savedAt: daysAgo(7), updatedAt: daysAgo(7) })
      .where(eq(answers.attemptId, activePractice.attempt.id));
    // Held: kept whatever its age.
    const held = await attemptIn(s, {
      classId: klas.id,
      closesAt: daysAgo(300),
      attemptStatus: "in_progress",
      activity: daysAgo(301),
    });
    await db.insert(retentionHolds).values({
      assignmentId: held.assignment.id,
      kind: "dispute",
      reason: "Bezwaar",
    });

    const preview = await runRetention(db, {
      now: NOW,
      trigger: "cli",
      dryRun: true,
      record: false,
    });
    expect(preview.attempts).toBe(2);

    const report = await runRetention(db, { now: NOW, trigger: "manual" });
    expect(report.attempts).toBe(2);
    expect(report.answers).toBe(2);
    expect(report.skippedByHold).toBeGreaterThanOrEqual(1);
    expect(await exists(abandoned.attempt.id)).toBe(false);
    expect(await exists(idlePractice.attempt.id)).toBe(false);
    expect(await exists(stillOpen.attempt.id)).toBe(true);
    expect(await exists(activePractice.attempt.id)).toBe(true);
    expect(await exists(held.attempt.id)).toBe(true);
    expect(
      await db
        .select()
        .from(answers)
        .where(eq(answers.attemptId, abandoned.attempt.id)),
    ).toHaveLength(0);
  });

  test("nothing is deleted while auto-delete is off", async () => {
    const s = await insertStudent();
    const klas = await createClass(undefined, [s.id]);
    const abandoned = await attemptIn(s, {
      classId: klas.id,
      closesAt: daysAgo(900),
      attemptStatus: "in_progress",
      activity: daysAgo(901),
    });
    const report = await runRetention(db, { now: NOW, trigger: "manual" });
    expect(report.attempts).toBe(0);
    expect(await exists(abandoned.attempt.id)).toBe(true);
  });
});

/* ---------------------------- F22 expired holds --------------------------- */

describe("retention: expired holds and their reasons", () => {
  test("holds expired more than 30 days ago are deleted; others stay", async () => {
    const s = await insertStudent();
    const [old, recent, open, restriction] = await db
      .insert(retentionHolds)
      .values([
        {
          userId: s.id,
          kind: "dispute",
          reason: "Bezwaar ouders tegen cijfer H3",
          until: daysAgo(45),
        },
        {
          userId: s.id,
          kind: "exam_dossier",
          reason: "Net verlopen",
          until: daysAgo(5),
        },
        { userId: s.id, kind: "exam_dossier", reason: "Zonder einddatum" },
        {
          userId: s.id,
          kind: "restriction",
          reason: "Beperking",
          until: daysAgo(400),
        },
      ])
      .returning();

    const preview = await runRetention(db, {
      now: NOW,
      trigger: "cli",
      dryRun: true,
      record: false,
    });
    expect(preview.expiredHolds).toBe(1);
    expect(await db.select().from(retentionHolds)).toHaveLength(4);

    const report = await runRetention(db, { now: NOW, trigger: "manual" });
    expect(report.expiredHolds).toBe(1);
    const left = (await db.select().from(retentionHolds)).map((h) => h.id);
    expect(left.sort()).toEqual([recent.id, open.id, restriction.id].sort());
    expect(left).not.toContain(old.id);
    const [run] = await auditRows({ action: "privacy.retention_run" });
    expect(run?.details).toMatchObject({ expiredHolds: 1 });
  });
});

/* ---------------------- F14 facilities and erasure audit ------------------- */

describe("audit log: facilities and erasure", () => {
  test("accommodation.set logs what kind changed, never the values", async () => {
    const s = await insertStudent();
    const caller = callerFor(teacher);
    await caller.accommodation.set({
      userId: s.id,
      extraTimePercent: 25,
      allowPaste: true,
      ignoreFocusEvents: false,
    });
    await caller.accommodation.set({
      userId: s.id,
      extraTimePercent: 50,
      allowPaste: true,
      ignoreFocusEvents: false,
    });
    await caller.accommodation.setMany({
      userIds: [s.id],
      extraTimePercent: 0,
    });
    const rows = await auditRows({
      action: "student.accommodation_updated",
      subjectUserId: s.id,
    });
    expect(rows.map((r) => r.details)).toEqual([
      { extraTimeChanged: true, allowPasteChanged: true, facilityActive: true },
      { extraTimeChanged: true, facilityActive: true },
      { extraTimeChanged: true, facilityActive: true },
    ]);
    for (const r of rows) {
      const json = JSON.stringify(r.details);
      expect(json).not.toContain("extraTimePercent");
      expect(json).not.toContain("25");
      expect(json).not.toContain("50");
    }
  });

  test("erasing a student strips scores and facilities from earlier rows", async () => {
    const s = await insertStudent();
    const other = await insertStudent();
    // Rows as stored before this fix (values in the details).
    await db.insert(auditLog).values([
      {
        actorRole: "admin",
        action: "student.accommodation_updated",
        subjectType: "student",
        subjectId: s.id,
        subjectUserId: s.id,
        subjectLabel: s.username,
        details: {
          extraTimePercent: 25,
          allowPaste: true,
          ignoreFocusEvents: false,
        },
      },
      {
        actorRole: "admin",
        action: "answer.score_changed",
        subjectType: "answer",
        subjectId: "a1",
        subjectUserId: s.id,
        subjectLabel: s.username,
        details: { answerId: "a1", attemptId: "t1", from: null, to: 1.5 },
      },
      {
        actorRole: "admin",
        action: "attempt.viewed",
        subjectType: "attempt",
        subjectId: "t1",
        subjectUserId: s.id,
        subjectLabel: s.username,
        details: { via: "review" },
      },
      {
        actorRole: "admin",
        action: "answer.score_changed",
        subjectType: "answer",
        subjectId: "a2",
        subjectUserId: other.id,
        subjectLabel: other.username,
        details: { answerId: "a2", from: 1, to: 2 },
      },
    ]);

    await callerFor(teacher).privacy.eraseStudent({
      userId: s.id,
      confirmStudentNumber: s.username ?? "",
    });

    const mine = await auditRows({ subjectUserId: s.id });
    const byAction = Object.fromEntries(mine.map((r) => [r.action, r]));
    expect(byAction["student.accommodation_updated"]?.details).toBeNull();
    expect(byAction["answer.score_changed"]?.details).toEqual({
      answerId: "a1",
      attemptId: "t1",
    });
    // Rows without student data are untouched; the label stays, no name.
    expect(byAction["attempt.viewed"]?.details).toEqual({ via: "review" });
    expect(byAction["student.deleted"]).toBeDefined();
    for (const r of mine) expect(r.subjectLabel).toBe(s.username);
    // Another student's rows keep their scores.
    const [theirs] = await auditRows({ subjectUserId: other.id });
    expect(theirs?.details).toMatchObject({ from: 1, to: 2 });
  });

  test("automatic deletion of an inactive student redacts the same way", async () => {
    await confirmAutoDelete();
    const leaver = await insertStudent();
    const archived = await createClass(undefined, [leaver.id]);
    await db
      .update(classes)
      .set({ archived: true })
      .where(eq(classes.id, archived.id));
    await db
      .update(user)
      .set({ createdAt: daysAgo(400) })
      .where(eq(user.id, leaver.id));
    await db.insert(auditLog).values({
      actorRole: "admin",
      action: "answer.score_changed",
      subjectUserId: leaver.id,
      subjectLabel: leaver.username,
      details: { from: 0, to: 2 },
    });
    const report = await runRetention(db, { now: NOW, trigger: "manual" });
    expect(report.inactiveStudents).toBe(1);
    const [scoreRow] = await auditRows({
      action: "answer.score_changed",
      subjectUserId: leaver.id,
    });
    expect(scoreRow?.details).toBeNull();
  });

  test("rows of students deleted before this fix are redacted by the next retention run", async () => {
    const existing = await insertStudent();
    // A student erased by an older version: the account is gone, the audit
    // rows still hold the facility values and scores.
    const goneId = "erased-before-the-fix";
    await db.insert(auditLog).values([
      {
        actorRole: "admin",
        action: "student.accommodation_updated",
        subjectType: "student",
        subjectId: goneId,
        subjectUserId: goneId,
        subjectLabel: "996602",
        details: {
          extraTimePercent: 25,
          allowPaste: true,
          ignoreFocusEvents: false,
        },
      },
      {
        actorRole: "admin",
        action: "answer.score_changed",
        subjectUserId: goneId,
        subjectLabel: "996602",
        details: { answerId: "a9", from: null, to: 1.5 },
      },
      {
        actorRole: "admin",
        action: "answer.score_changed",
        subjectUserId: existing.id,
        subjectLabel: existing.username,
        details: { answerId: "a8", from: 1, to: 2 },
      },
    ]);

    // A preview changes nothing.
    await runRetention(db, {
      now: NOW,
      trigger: "cli",
      dryRun: true,
      record: false,
    });
    expect(
      (await auditRows({ subjectUserId: goneId })).map((r) => r.details),
    ).toContainEqual({ answerId: "a9", from: null, to: 1.5 });

    // Auto-delete is off: this runs anyway (it only strips details).
    await runRetention(db, { now: NOW, trigger: "manual" });
    const gone = Object.fromEntries(
      (await auditRows({ subjectUserId: goneId })).map((r) => [
        r.action,
        r.details,
      ]),
    );
    expect(gone["student.accommodation_updated"]).toBeNull();
    expect(gone["answer.score_changed"]).toEqual({ answerId: "a9" });
    const [kept] = await auditRows({ subjectUserId: existing.id });
    expect(kept?.details).toMatchObject({ from: 1, to: 2 });
  });
});

/* ------------------------------- F24 PIN audit ---------------------------- */

describe("audit log: class-wide PIN views and resets reach each student", () => {
  test("getPins({ classId }) logs one row per student; the inzage export shows it", async () => {
    const s1 = await insertStudent();
    const s2 = await insertStudent();
    const klas = await createClass(undefined, [s1.id, s2.id]);
    const caller = callerFor(teacher);
    await caller.student.getPins({ classId: klas.id });

    const rows = await waitFor(async () => {
      const found = await auditRows({ action: "student.pins_viewed" });
      return found.length >= 3 ? found : null;
    });
    expect(rows.filter((r) => r.subjectType === "class")).toHaveLength(1);
    const perStudent = rows.filter((r) => r.subjectType === "student");
    expect(perStudent.map((r) => r.subjectUserId).sort()).toEqual(
      [s1.id, s2.id].sort(),
    );
    expect(
      perStudent.find((r) => r.subjectUserId === s1.id)?.subjectLabel,
    ).toBe(s1.username);

    const exported = await caller.privacy.exportStudent({ userId: s1.id });
    expect(exported.accessLog.map((e) => e.action)).toContain(
      "Pincodes bekeken (inlogkaarten)",
    );
  });

  test("getPins for a selection also logs each student", async () => {
    const s1 = await insertStudent();
    const s2 = await insertStudent();
    await callerFor(teacher).student.getPins({ userIds: [s1.id, s2.id] });
    const rows = await waitFor(async () => {
      const found = await auditRows({ action: "student.pins_viewed" });
      return found.length >= 3 ? found : null;
    });
    const ids = rows.map((r) => r.subjectUserId).filter(Boolean);
    expect(ids.sort()).toEqual([s1.id, s2.id].sort());
  });

  test("resetPins logs the class and every student", async () => {
    const s1 = await insertStudent();
    const s2 = await insertStudent();
    const klas = await createClass(undefined, [s1.id, s2.id]);
    await callerFor(teacher).student.resetPins({ classId: klas.id });
    const rows = await auditRows({ action: "student.pin_reset" });
    expect(rows).toHaveLength(3);
    expect(
      rows
        .map((r) => r.subjectUserId)
        .filter(Boolean)
        .sort(),
    ).toEqual([s1.id, s2.id].sort());
    expect(await auditRows({ action: "trpc.mutation" })).toHaveLength(0);
  });
});

/* ---------------------------- F20 similarity audit ------------------------- */

describe("audit log: comparing code", () => {
  test("similarity.pair logs attempt.viewed for both named students", async () => {
    const s1 = await insertStudent();
    const s2 = await insertStudent();
    const klas = await createClass(undefined, [s1.id, s2.id]);
    const { test: t, questions } = await createTest({ questions: [q.code()] });
    const assignment = await createAssignment({
      testId: t.id,
      classId: klas.id,
      status: "closed",
    });
    const answerIds: string[] = [];
    const attemptIds: string[] = [];
    for (const s of [s1, s2]) {
      const [attempt] = await db
        .insert(attempts)
        .values({
          assignmentId: assignment.id,
          userId: s.id,
          status: "submitted",
          submittedAt: new Date(),
        })
        .returning();
      const [answer] = await db
        .insert(answers)
        .values({
          attemptId: attempt.id,
          questionId: questions[0].id,
          response: { code: 'naam = input("Naam? ")\nprint("Hallo", naam)\n' },
          maxScore: 2,
        })
        .returning();
      attemptIds.push(attempt.id);
      answerIds.push(answer.id);
    }
    const caller = callerFor(teacher);
    await caller.similarity.pair({
      answerIdA: answerIds[0],
      answerIdB: answerIds[1],
    });
    const viewed = await waitFor(async () => {
      const found = await auditRows({ action: "attempt.viewed" });
      return found.length >= 2 ? found : null;
    });
    expect(viewed.map((r) => r.subjectId).sort()).toEqual(
      [...attemptIds].sort(),
    );
    expect(viewed.map((r) => r.subjectUserId).sort()).toEqual(
      [s1.id, s2.id].sort(),
    );
    for (const r of viewed)
      expect(r.details).toMatchObject({ via: "similarity" });

    await caller.similarity.assignment({ assignmentId: assignment.id });
    const overview = await waitFor(async () => {
      const found = await auditRows({ action: "similarity.viewed" });
      return found.length ? found : null;
    });
    expect(overview[0]).toMatchObject({
      subjectType: "assignment",
      subjectId: assignment.id,
    });
  });
});

/* ------------------------- F18 restriction enforcement ---------------------- */

describe("AVG art. 18: restricted students' data is not changed", () => {
  async function restricted() {
    const s = await insertStudent({ name: "Sem de Vries" });
    await createClass(undefined, [s.id]);
    await callerFor(teacher).privacy.setRestriction({
      userId: s.id,
      restricted: true,
      reason: "Leerling betwist een cijfer",
    });
    return s;
  }

  test("rename and facility changes are refused; the flag is visible", async () => {
    const s = await restricted();
    const caller = callerFor(teacher);
    await expect(
      caller.student.update({ id: s.id, name: "Andere Naam" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      caller.accommodation.set({
        userId: s.id,
        extraTimePercent: 25,
        allowPaste: false,
        ignoreFocusEvents: false,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      caller.accommodation.setMany({ userIds: [s.id], extraTimePercent: 25 }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const [row] = await db.select().from(user).where(eq(user.id, s.id));
    expect(row?.name).toBe("Sem de Vries");
    expect(
      await db
        .select()
        .from(studentAccommodations)
        .where(eq(studentAccommodations.userId, s.id)),
    ).toHaveLength(0);

    expect((await caller.student.get({ id: s.id })).restricted).toBe(true);
    const list = await caller.student.list({});
    expect(list.rows.find((r) => r.id === s.id)?.restricted).toBe(true);
  });

  test("an explicit override is allowed and logged", async () => {
    const s = await restricted();
    await callerFor(teacher).student.update({
      id: s.id,
      name: "Sem van Vries",
      overrideRestriction: true,
    });
    const [row] = await auditRows({
      action: "student.updated",
      subjectUserId: s.id,
    });
    expect(row?.details).toMatchObject({ restrictionOverridden: true });
  });

  test("bulk paths skip restricted students", async () => {
    const s = await restricted();
    const free = await insertStudent();
    const caller = callerFor(teacher);
    const res = await caller.accommodation.setMany({
      userIds: [s.id, free.id],
      extraTimePercent: 25,
    });
    expect(res).toEqual({ updated: 1, skippedRestricted: 1 });

    const imported = await caller.student.import({
      onExisting: "update_name",
      rows: [{ studentNumber: s.username ?? "", name: "Nieuwe Naam" }],
    });
    expect(imported.existing[0]).toMatchObject({
      nameUpdated: false,
      restricted: true,
    });
    const [row] = await db.select().from(user).where(eq(user.id, s.id));
    expect(row?.name).toBe("Sem de Vries");
  });

  test("after lifting the restriction changes work again", async () => {
    const s = await restricted();
    const caller = callerFor(teacher);
    await caller.privacy.setRestriction({ userId: s.id, restricted: false });
    await caller.student.update({ id: s.id, name: "Sem Jansen" });
    expect((await caller.student.get({ id: s.id })).restricted).toBe(false);
  });
});

/* ---------------------------- F19 export completeness ---------------------- */

describe("inzage export: hints, holds and targeted afnames", () => {
  test("the export explains hint penalties and lists holds and inhaal-afnames", async () => {
    const s = await insertStudent();
    const klas = await createClass(undefined, [s.id]);
    const { test: t, questions } = await createTest({
      questions: [
        q.code({
          hints: [
            { id: "h1", text: "GEHEIME_HINTTEKST", penalty: 0.25 },
            { id: "h2", text: "Tweede hint", penalty: 0.5 },
          ],
        }),
      ],
    });
    const assignment = await createAssignment({
      testId: t.id,
      classId: klas.id,
      mode: "practice",
      title: "Inhaaltoets H3",
      settings: { showResults: "immediately" },
    });
    await db
      .insert(assignmentStudents)
      .values({ assignmentId: assignment.id, userId: s.id });
    const [attempt] = await db
      .insert(attempts)
      .values({
        assignmentId: assignment.id,
        userId: s.id,
        status: "submitted",
        submittedAt: new Date(),
        score: 1.5,
        maxScore: 2,
      })
      .returning();
    await db.insert(answers).values({
      attemptId: attempt.id,
      questionId: questions[0].id,
      response: { code: "print('Hallo')" },
      autoScore: 1.5,
      maxScore: 2,
      hintsUsed: [{ id: "h1", at: "2026-10-01T09:15:00.000Z" }],
    });
    await db.insert(retentionHolds).values([
      {
        userId: s.id,
        kind: "dispute",
        reason: "Bezwaar ouders tegen cijfer H3",
        createdById: teacher.id,
      },
      {
        assignmentId: assignment.id,
        kind: "exam_dossier",
        reason: "REDEN_VAN_DE_HELE_AFNAME",
      },
    ]);

    const caller = callerFor(teacher);
    const data = await caller.privacy.exportStudent({ userId: s.id });
    expect(data.schemaVersion).toBe(3);
    expect(data.uitleg.codes.mode.practice).toBe("oefentoets");
    expect(data.attempts[0]?.answers[0]?.hintsUsed).toEqual([
      { hintNumber: 1, at: "2026-10-01T09:15:00.000Z", penalty: 0.25 },
    ]);
    expect(data.attempts[0]?.answers[0]?.hintPenalty).toBe(0.25);
    expect(data.holds.map((h) => [h.appliesTo, h.reason]).sort()).toEqual([
      ["afname", null],
      ["student", "Bezwaar ouders tegen cijfer H3"],
    ]);
    expect(data.targetedAssignments.map((a) => a.title)).toEqual([
      "Inhaaltoets H3",
    ]);
    const json = JSON.stringify(data);
    expect(json).not.toContain("GEHEIME_HINTTEKST");
    expect(json).not.toContain("REDEN_VAN_DE_HELE_AFNAME");
    expect(json).not.toContain(teacher.name);

    // The student's own download carries the same fields.
    const mine = await callerFor(s).privacy.exportMyData();
    expect(mine.holds).toHaveLength(2);
    expect(mine.targetedAssignments).toHaveLength(1);
  });
});

/* ------------------------------ F12 copy events ---------------------------- */

describe("monitoring: copying is never stored", () => {
  test("a batch with a copy event from an old client is accepted; copy is dropped", async () => {
    const s = await insertStudent();
    const klas = await createClass(undefined, [s.id]);
    const { test: t } = await createTest();
    const assignment = await createAssignment({
      testId: t.id,
      classId: klas.id,
      status: "open",
      settings: { logFocusEvents: true },
    });
    const student = callerFor(s);
    const { attemptId } = await student.portal.startAttempt({
      assignmentId: assignment.id,
    });
    const res = await student.portal.logEvents({
      attemptId,
      events: [
        { type: "copy", details: { length: 12 } },
        { type: "focus_lost" },
      ],
    });
    expect(res).toEqual({ logged: 1, dropped: 1 });
    const stored = await db
      .select({ type: attemptEvents.type })
      .from(attemptEvents)
      .where(
        and(
          eq(attemptEvents.attemptId, attemptId),
          eq(attemptEvents.type, "copy"),
        ),
      );
    expect(stored).toHaveLength(0);
  });
});
