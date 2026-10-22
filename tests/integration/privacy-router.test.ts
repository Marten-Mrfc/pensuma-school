/** privacy router: settings, export, erasure, restriction, holds, year-end. */
import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  attemptEvents,
  attempts,
  auditLog,
  classes,
  retentionHolds,
  session,
  user,
} from "@/server/db/schema";
import { callerFor, type TestUser } from "../support/caller";
import { countRows, resetDatabase } from "../support/db";
import {
  createAssignment,
  createClass,
  createTeacherAccount,
  createTest,
  insertStudent,
  insertTeacher,
  q,
} from "../support/factories";

let teacher: TestUser;

beforeEach(async () => {
  await resetDatabase();
  teacher = await insertTeacher();
});

/** A submitted attempt with one answer and one event for `student`. */
async function seedAttempt(student: TestUser, classId: string) {
  const { test, questions } = await createTest({
    questions: [q.code({ solution: "SECRET_SOLUTION_P2" })],
  });
  const assignment = await createAssignment({
    testId: test.id,
    classId,
    settings: { showResults: "immediately" },
  });
  const [attempt] = await db
    .insert(attempts)
    .values({
      assignmentId: assignment.id,
      userId: student.id,
      status: "submitted",
      submittedAt: new Date(),
      score: 1,
      maxScore: 2,
      gradingStatus: "graded",
    })
    .returning();
  await db.insert(answers).values({
    attemptId: attempt.id,
    questionId: questions[0].id,
    response: { code: `print("${student.username}")` },
    status: "graded",
    autoScore: 1,
    maxScore: 2,
  });
  await db.insert(attemptEvents).values({
    attemptId: attempt.id,
    type: "focus_lost",
    details: { durationMs: 1200 },
  });
  return { assignment, attempt };
}

describe("authorization", () => {
  test("students get FORBIDDEN on admin procedures; myData works", async () => {
    const student = await insertStudent();
    const caller = callerFor(student);
    await expect(caller.privacy.getSettings()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.privacy.overview()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.privacy.exportStudent({ userId: student.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.privacy.auditLog({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const mine = await caller.privacy.myData();
    expect(mine.profile.studentNumber).toBe(student.username ?? "");
    await expect(callerFor(teacher).privacy.myData()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(null).privacy.publicInfo()).resolves.toBeTruthy();
  });
});

describe("settings", () => {
  test("updateSettings round-trips and confirming is recorded", async () => {
    const caller = callerFor(teacher);
    const current = await caller.privacy.getSettings();
    const {
      confirmedAt: _a,
      confirmedById: _b,
      ...retention
    } = current.settings.retention;
    await caller.privacy.updateSettings({
      ...current.settings,
      school: { ...current.settings.school, name: "Testlyceum" },
      retention: { ...retention, attemptsMonths: 18, autoDeleteAttempts: true },
      confirmRetention: true,
    });
    const after = await caller.privacy.getSettings();
    expect(after.settings.school.name).toBe("Testlyceum");
    expect(after.settings.retention.attemptsMonths).toBe(18);
    expect(after.settings.retention.confirmedAt).not.toBeNull();
    expect(after.confirmedByName).toBe(teacher.name);

    // Changing a confirmed period withdraws the confirmation.
    const changed = await caller.privacy.updateSettings({
      ...after.settings,
      retention: { ...retention, attemptsMonths: 12, autoDeleteAttempts: true },
    });
    expect(changed.confirmationWithdrawn).toBe(true);
    expect(changed.settings.retention.confirmedAt).toBeNull();

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "privacy.settings_updated"));
    expect(audits).toHaveLength(2);
    expect(audits[0]?.details?.changedKeys).toContain(
      "retention.attemptsMonths",
    );
  });
});

describe("export", () => {
  test("exportStudent contains only that student and no solutions", async () => {
    const a = await insertStudent({ name: "Anna Export" });
    const b = await insertStudent({ name: "Bram Ander" });
    const klas = await createClass(undefined, [a.id, b.id]);
    await seedAttempt(a, klas.id);
    await seedAttempt(b, klas.id);

    const data = await callerFor(teacher).privacy.exportStudent({
      userId: a.id,
    });
    const json = JSON.stringify(data);
    expect(data.student.name).toBe("Anna Export");
    expect(data.attempts).toHaveLength(1);
    expect(data.attempts[0]?.answers[0]?.response).toEqual({
      code: `print("${a.username}")`,
    });
    expect(json).not.toContain("Bram Ander");
    expect(json).not.toContain(String(b.username));
    expect(json).not.toContain("SECRET_SOLUTION_P2");

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "student.exported"));
    expect(audit?.subjectUserId).toBe(a.id);
    expect(audit?.subjectLabel).toBe(a.username);
  });

  test("exportMyData only has visible, submitted attempts", async () => {
    const s = await insertStudent();
    const klas = await createClass(undefined, [s.id]);
    const { test: t } = await createTest();
    const hidden = await createAssignment({
      testId: t.id,
      classId: klas.id,
      mode: "exam",
      settings: { showResults: "manual" },
    });
    await db.insert(attempts).values({
      assignmentId: hidden.id,
      userId: s.id,
      status: "submitted",
      submittedAt: new Date(),
    });
    await seedAttempt(s, klas.id);
    const mine = await callerFor(s).privacy.exportMyData();
    expect(mine.audience).toBe("student");
    expect(mine.attempts).toHaveLength(1);
  });
});

describe("erasure", () => {
  test("eraseStudent removes the rows and keeps a student.deleted row", async () => {
    const s = await insertStudent({ name: "Wis Mij" });
    const klas = await createClass(undefined, [s.id]);
    const { attempt } = await seedAttempt(s, klas.id);
    const caller = callerFor(teacher);

    const preview = await caller.privacy.erasePreview({ userId: s.id });
    expect(preview).toMatchObject({
      classes: 1,
      attempts: 1,
      answers: 1,
      events: 1,
      holds: [],
    });

    await expect(
      caller.privacy.eraseStudent({
        userId: s.id,
        confirmStudentNumber: "00000000",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Het leerlingnummer klopt niet.",
    });

    await caller.privacy.eraseStudent({
      userId: s.id,
      confirmStudentNumber: s.username ?? "",
    });
    expect(await db.select().from(user).where(eq(user.id, s.id))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(attempts).where(eq(attempts.id, attempt.id)),
    ).toHaveLength(0);
    expect(await countRows("answer")).toBe(0);
    const [deleted] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "student.deleted"));
    expect(deleted?.subjectLabel).toBe(s.username);
    expect(JSON.stringify(deleted)).not.toContain("Wis Mij");
  });

  test("restriction bans, blocks erasure and is lifted again", async () => {
    const s = await insertStudent();
    await db.insert(session).values({
      id: randomUUID(),
      token: randomUUID(),
      userId: s.id,
      expiresAt: new Date(Date.now() + 3_600_000),
      updatedAt: new Date(),
    });
    const caller = callerFor(teacher);
    await caller.privacy.setRestriction({
      userId: s.id,
      restricted: true,
      reason: "Ouder betwist een score",
    });
    const [banned] = await db.select().from(user).where(eq(user.id, s.id));
    expect(banned?.banned).toBe(true);
    expect(
      await db.select().from(session).where(eq(session.userId, s.id)),
    ).toHaveLength(0);
    await expect(
      caller.privacy.eraseStudent({
        userId: s.id,
        confirmStudentNumber: s.username ?? "",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const [hold] = await db
      .select()
      .from(retentionHolds)
      .where(eq(retentionHolds.userId, s.id));
    await expect(
      caller.privacy.removeHold({ id: hold?.id ?? "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await caller.privacy.setRestriction({ userId: s.id, restricted: false });
    const [lifted] = await db.select().from(user).where(eq(user.id, s.id));
    expect(lifted?.banned).toBe(false);
    expect(await countRows("retention_hold")).toBe(0);
  });

  test("lifting a restriction keeps a teacher's deactivation", async () => {
    const s = await insertStudent();
    const deactivated = "Gedeactiveerd door een docent.";
    await db
      .update(user)
      .set({ banned: true, banReason: deactivated })
      .where(eq(user.id, s.id));
    const caller = callerFor(teacher);
    await caller.privacy.setRestriction({
      userId: s.id,
      restricted: true,
      reason: "Ouder betwist een score",
    });
    await caller.privacy.setRestriction({ userId: s.id, restricted: false });
    const [row] = await db.select().from(user).where(eq(user.id, s.id));
    expect(row?.banned).toBe(true);
    expect(row?.banReason).toBe(deactivated);
    expect(await countRows("retention_hold")).toBe(0);
  });

  test("holds: create and remove are audited", async () => {
    const s = await insertStudent();
    const caller = callerFor(teacher);
    const created = await caller.privacy.createHold({
      userId: s.id,
      kind: "dispute",
      reason: "Bezwaarprocedure",
    });
    const list = await caller.privacy.listHolds();
    expect(list).toHaveLength(1);
    expect(list[0]?.active).toBe(true);
    await caller.privacy.removeHold({ id: created.id ?? "" });
    const actions = (
      await db.select({ action: auditLog.action }).from(auditLog)
    ).map((r) => r.action);
    expect(actions).toContain("privacy.hold_created");
    expect(actions).toContain("privacy.hold_removed");
  });

  test("deleteAttemptEvents clears the log of one attempt", async () => {
    const s = await insertStudent();
    const klas = await createClass(undefined, [s.id]);
    const { attempt } = await seedAttempt(s, klas.id);
    await db
      .update(attempts)
      .set({ focusLossCount: 3 })
      .where(eq(attempts.id, attempt.id));
    const result = await callerFor(teacher).privacy.deleteAttemptEvents({
      attemptId: attempt.id,
    });
    expect(result.deleted).toBe(1);
    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attempt.id));
    expect(row?.focusLossCount).toBe(0);
  });
});

describe("audit log viewer", () => {
  test("keyset pagination, labels and deleted subjects", async () => {
    const caller = callerFor(teacher);
    const s = await insertStudent();
    for (let i = 0; i < 5; i++) {
      await caller.privacy.createHold({
        userId: s.id,
        kind: "dispute",
        reason: `Reden ${i}`,
      });
    }
    const first = await caller.privacy.auditLog({ limit: 3 });
    expect(first.rows).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    expect(first.rows[0]?.label).toBe("Bewaarblokkade ingesteld");
    expect(first.rows[0]?.actorName).toBe(teacher.name);
    const second = await caller.privacy.auditLog({
      limit: 3,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.rows).toHaveLength(2);
    expect(second.nextCursor).toBeNull();

    const filtered = await caller.privacy.auditLog({ category: "security" });
    expect(filtered.rows).toHaveLength(0);

    await db.delete(user).where(eq(user.id, s.id));
    const afterDelete = await caller.privacy.auditLog({
      subjectUserId: s.id,
    });
    expect(afterDelete.rows[0]?.subjectDeleted).toBe(true);
    expect(afterDelete.rows[0]?.subjectLabel).toBe(s.username);

    const csv = await caller.privacy.exportAuditLog({});
    expect(csv.csv).toContain("Tijdstip;Docent;Handeling;Betreft;Details");
    // The default period ends today in Dutch time (also just after local
    // midnight, when the UTC date is still yesterday): rows from just now
    // are included.
    expect(csv.rowCount).toBeGreaterThanOrEqual(5);
    expect(csv.csv).toContain("Bewaarblokkade ingesteld");
    await expect(
      caller.privacy.exportAuditLog({ from: "2026-01-01", to: "2026-03-01" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("school year", () => {
  test("closeSchoolYear needs VERWIJDEREN and the right password", async () => {
    const t = await createTeacherAccount();
    const leaver = await insertStudent();
    const stayer = await insertStudent();
    const old = await createClass("5H1", [leaver.id, stayer.id]);
    const next = await createClass("6H1", [stayer.id]);
    await db
      .update(classes)
      .set({ schoolYear: "2027-2028" })
      .where(eq(classes.id, next.id));
    await seedAttempt(leaver, old.id);
    const caller = callerFor(t);

    const preview = await caller.privacy.schoolYearPreview({
      schoolYear: "2026-2027",
    });
    expect(preview).toMatchObject({ classes: 1, students: 2, leavers: 1 });

    const base = {
      schoolYear: "2026-2027",
      archiveClasses: true,
      deleteEvents: true,
      deleteAttempts: false,
      deleteLeavers: true,
    };
    await expect(
      caller.privacy.closeSchoolYear({
        ...base,
        confirm: "verwijderen" as "VERWIJDEREN",
        password: t.password,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.privacy.closeSchoolYear({
        ...base,
        confirm: "VERWIJDEREN",
        password: "helemaal-fout",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const result = await caller.privacy.closeSchoolYear({
      ...base,
      confirm: "VERWIJDEREN",
      password: t.password,
    });
    expect(result).toMatchObject({ archivedClasses: 1, students: 1 });
    expect(
      await db.select().from(user).where(eq(user.id, leaver.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(user).where(eq(user.id, stayer.id)),
    ).toHaveLength(1);
    const [archived] = await db
      .select()
      .from(classes)
      .where(eq(classes.id, old.id));
    expect(archived?.archived).toBe(true);
    const closed = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "privacy.school_year_closed"),
          eq(auditLog.subjectLabel, "2026-2027"),
        ),
      );
    expect(closed).toHaveLength(1);
  });
});
