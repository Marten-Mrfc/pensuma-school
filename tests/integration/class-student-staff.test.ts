/** Klassen, leerlingen (accounts, PINs, import) and docenten. */
import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  answers,
  attemptEvents,
  attempts,
  auditLog,
  classMembers,
  session,
  studentPins,
  user,
} from "@/server/db/schema";
import {
  callerFor,
  callerForCookie,
  type TestUser,
  testHeaders,
} from "../support/caller";
import { countRows, resetDatabase } from "../support/db";
import {
  createAssignment,
  createClass,
  createStudentLogin,
  createTest,
  insertStudent,
  insertTeacher,
  nextStudentNumber,
  q,
} from "../support/factories";
import { pendingTest } from "../support/pending";

let teacher: TestUser;

beforeEach(async () => {
  await resetDatabase();
  teacher = await insertTeacher();
});

async function signIn(username: string, password: string) {
  try {
    const res = await auth.api.signInUsername({
      body: { username, password },
      headers: testHeaders(),
      asResponse: true,
    });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    return { status: res.status, cookie };
  } catch (err) {
    return {
      status: (err as { statusCode?: number }).statusCode ?? 500,
      cookie: "",
    };
  }
}

async function signInTeacher(email: string, password: string) {
  try {
    const res = await auth.api.signInEmail({
      body: { email, password },
      headers: testHeaders(),
      asResponse: true,
    });
    return res.status;
  } catch (err) {
    return (err as { statusCode?: number }).statusCode ?? 500;
  }
}

describe("classes", () => {
  test("create, update, archive and delete", async () => {
    const t = callerFor(teacher);
    const klas = await t.class.create({ name: "4H2", schoolYear: "2026-2027" });
    expect(klas.name).toBe("4H2");
    await expect(
      t.class.create({ name: "4h2", schoolYear: "2026-2027" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const renamed = await t.class.update({ id: klas.id, name: "4H3" });
    expect(renamed.name).toBe("4H3");

    await t.class.setArchived({ id: klas.id, archived: true });
    expect((await t.class.list()).map((c) => c.id)).not.toContain(klas.id);
    expect(
      (await t.class.list({ includeArchived: true })).map((c) => c.id),
    ).toContain(klas.id);

    await t.class.delete({ id: klas.id });
    await expect(t.class.get({ id: klas.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("members: only students can be added; removing works", async () => {
    const t = callerFor(teacher);
    const s1 = await insertStudent();
    const s2 = await insertStudent();
    const otherTeacher = await insertTeacher();
    const klas = await createClass();
    await expect(
      t.class.addMembers({
        classId: klas.id,
        userIds: [s1.id, otherTeacher.id],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await t.class.addMembers({
      classId: klas.id,
      userIds: [s1.id, s2.id, s1.id],
    });
    let detail = await t.class.get({ id: klas.id });
    expect(detail.members.map((m) => m.id).sort()).toEqual(
      [s1.id, s2.id].sort(),
    );
    const memberRows = await db
      .select()
      .from(classMembers)
      .where(eq(classMembers.userId, otherTeacher.id));
    expect(memberRows).toHaveLength(0);

    await t.class.removeMember({ classId: klas.id, userId: s1.id });
    detail = await t.class.get({ id: klas.id });
    expect(detail.members.map((m) => m.id)).toEqual([s2.id]);
  });
});

describe("students", () => {
  test("student.create returns a PIN that signs in", async () => {
    const klas = await createClass();
    const number = nextStudentNumber();
    const out = await callerFor(teacher).student.create({
      studentNumber: number,
      name: "Pim Proef",
      classId: klas.id,
    });
    expect(out.pin).toMatch(/^\d{6}$/);
    expect((await signIn(number, out.pin)).status).toBe(200);
    const detail = await callerFor(teacher).class.get({ id: klas.id });
    expect(detail.members.map((m) => m.studentNumber)).toEqual([number]);
    await expect(
      callerFor(teacher).student.create({
        studentNumber: number,
        name: "Dubbel",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("student.import reports duplicates, invalid rows and existing students", async () => {
    const existing = await insertStudent({ name: "Al Bekend" });
    const klas = await createClass();
    const a = nextStudentNumber();
    const b = nextStudentNumber();
    const out = await callerFor(teacher).student.import({
      classId: klas.id,
      rows: [
        { studentNumber: a, name: "Anna Nieuw", line: 1 },
        { studentNumber: b, name: "Bram Nieuw", line: 2 },
        { studentNumber: a, name: "Anna Dubbel", line: 3 },
        { studentNumber: "12ab", name: "Ongeldig", line: 4 },
        { studentNumber: existing.username ?? "", name: "Al Bekend", line: 5 },
      ],
    });
    expect(out.created.map((c) => c.studentNumber).sort()).toEqual(
      [a, b].sort(),
    );
    for (const c of out.created) expect(c.pin).toMatch(/^\d{6}$/);
    expect(out.existing.map((e) => e.id)).toEqual([existing.id]);
    expect(out.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(out.errors[0].message).toContain("staat dubbel in de lijst");
    const detail = await callerFor(teacher).class.get({ id: klas.id });
    expect(detail.members).toHaveLength(3);
  });

  test("resetPin: the old PIN stops working, the new one works, sessions end", async () => {
    const s = await createStudentLogin({ pin: "246810" });
    expect((await signIn(s.number, s.pin)).status).toBe(200);
    expect(
      await db.select().from(session).where(eq(session.userId, s.id)),
    ).toHaveLength(1);

    const out = await callerFor(teacher).student.resetPin({ id: s.id });
    expect(out.pin).toMatch(/^\d{6}$/);
    expect(
      await db.select().from(session).where(eq(session.userId, s.id)),
    ).toHaveLength(0);
    if (out.pin !== s.pin) {
      expect((await signIn(s.number, s.pin)).status).toBe(401);
    }
    expect((await signIn(s.number, out.pin)).status).toBe(200);
    const pins = await callerFor(teacher).student.getPins({ userIds: [s.id] });
    expect(pins[0]?.pin).toBe(out.pin);
  });

  test("setActive(false) blocks sign-in until reactivated", async () => {
    const s = await createStudentLogin();
    await callerFor(teacher).student.setActive({ id: s.id, active: false });
    expect((await signIn(s.number, s.pin)).status).not.toBe(200);
    await callerFor(teacher).student.setActive({ id: s.id, active: true });
    expect((await signIn(s.number, s.pin)).status).toBe(200);
  });

  pendingTest(
    "P1",
    "setActive(false) revokes an existing session cookie at once",
    async () => {
      const s = await createStudentLogin();
      const { status, cookie } = await signIn(s.number, s.pin);
      expect(status).toBe(200);
      await expect(
        callerForCookie(cookie).portal.dashboard(),
      ).resolves.toBeDefined();
      await callerFor(teacher).student.setActive({ id: s.id, active: false });
      await expect(
        callerForCookie(cookie).portal.dashboard(),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    },
  );

  test("student.delete removes every personal row", async () => {
    const s = await createStudentLogin();
    expect((await signIn(s.number, s.pin)).status).toBe(200);
    const klas = await createClass(undefined, [s.id]);
    const { test: toets } = await createTest({ questions: [q.open()] });
    const afname = await createAssignment({
      testId: toets.id,
      classId: klas.id,
    });
    const { attemptId } = await callerFor(s).portal.startAttempt({
      assignmentId: afname.id,
    });
    await callerFor(s).portal.logEvents({
      attemptId,
      events: [{ type: "code_run" }],
    });

    await callerFor(teacher).student.delete({ id: s.id });

    expect(await db.select().from(user).where(eq(user.id, s.id))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(attempts).where(eq(attempts.userId, s.id)),
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
    expect(
      await db.select().from(studentPins).where(eq(studentPins.userId, s.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(session).where(eq(session.userId, s.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(classMembers).where(eq(classMembers.userId, s.id)),
    ).toHaveLength(0);
    expect(await countRows("account")).toBe(0);
  });

  pendingTest(
    "P6",
    "student.delete writes a student.deleted audit row",
    async () => {
      const s = await createStudentLogin();
      await callerFor(teacher).student.delete({ id: s.id });
      const rows = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "student.deleted"),
            eq(auditLog.subjectUserId, s.id),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0].details ?? {})).not.toContain(s.name);
    },
  );
});

describe("teachers (staff)", () => {
  test("staff.create without password returns a temporary password that signs in", async () => {
    const out = await callerFor(teacher).staff.create({
      name: "Nieuwe Collega",
      email: "collega@test.pensuma.local",
    });
    expect(out.temporaryPassword).toBeTruthy();
    expect(
      await signInTeacher(
        "collega@test.pensuma.local",
        out.temporaryPassword ?? "",
      ),
    ).toBe(200);
    await expect(
      callerFor(teacher).staff.create({
        name: "Dubbel",
        email: "collega@test.pensuma.local",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("staff.resetPassword gives another teacher a new password", async () => {
    const created = await callerFor(teacher).staff.create({
      name: "Collega Twee",
      email: "twee@test.pensuma.local",
    });
    const reset = await callerFor(teacher).staff.resetPassword({
      id: created.user.id,
    });
    expect(await signInTeacher("twee@test.pensuma.local", reset.password)).toBe(
      200,
    );
    if (reset.password !== created.temporaryPassword) {
      expect(
        await signInTeacher(
          "twee@test.pensuma.local",
          created.temporaryPassword ?? "",
        ),
      ).toBe(401);
    }
  });

  test("you cannot remove yourself", async () => {
    await expect(
      callerFor(teacher).staff.remove({ id: teacher.id }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Je kunt je eigen account niet verwijderen.",
    });
  });

  test("the last teacher cannot be removed", async () => {
    // A session whose own account is gone: the target is the only teacher.
    const ghost: TestUser = {
      id: randomUUID(),
      name: "Spook",
      email: "spook@test.pensuma.local",
      role: "admin",
      username: null,
    };
    await expect(
      callerFor(ghost).staff.remove({ id: teacher.id }),
    ).rejects.toMatchObject({
      message: "Er moet minstens één docent overblijven.",
    });
  });

  test("removing another teacher works", async () => {
    const other = await insertTeacher();
    await callerFor(teacher).staff.remove({ id: other.id });
    expect(
      await db.select().from(user).where(eq(user.id, other.id)),
    ).toHaveLength(0);
  });
});
