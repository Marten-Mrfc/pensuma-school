/**
 * P6: faciliteiten (accommodations), student read audits, lockouts and
 * erasure through the shared service.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  auditLog,
  loginThrottle,
  retentionHolds,
  studentAccommodations,
  user,
} from "@/server/db/schema";
import { studentThrottleKeys } from "@/server/security/login-throttle";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  createClass,
  insertStudent,
  insertTeacher,
} from "../support/factories";
import { waitFor } from "../support/wait";

beforeEach(resetDatabase);

async function auditRows(action: string, subjectUserId?: string) {
  return db
    .select()
    .from(auditLog)
    .where(
      subjectUserId
        ? and(
            eq(auditLog.action, action as never),
            eq(auditLog.subjectUserId, subjectUserId),
          )
        : eq(auditLog.action, action as never),
    );
}

describe("accommodation", () => {
  test("set, get, listForClass; all defaults removes the row", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    const klas = await createClass(undefined, [student.id]);
    const t = callerFor(teacher);

    expect(await t.accommodation.get({ userId: student.id })).toBeNull();
    await t.accommodation.set({
      userId: student.id,
      extraTimePercent: 25,
      allowPaste: true,
      ignoreFocusEvents: false,
    });
    expect(await t.accommodation.get({ userId: student.id })).toEqual({
      extraTimePercent: 25,
      allowPaste: true,
      ignoreFocusEvents: false,
    });
    expect(await t.accommodation.listForClass({ classId: klas.id })).toEqual({
      [student.id]: {
        extraTimePercent: 25,
        allowPaste: true,
        ignoreFocusEvents: false,
      },
    });
    const got = await t.student.get({ id: student.id });
    expect(got.accommodation).toMatchObject({ extraTimePercent: 25 });

    const audits = await auditRows("student.accommodation_updated", student.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].subjectLabel).toBe(student.username);
    expect(audits[0].details).toEqual({
      extraTimePercent: 25,
      allowPaste: true,
      ignoreFocusEvents: false,
    });

    await t.accommodation.set({
      userId: student.id,
      extraTimePercent: 0,
      allowPaste: false,
      ignoreFocusEvents: false,
    });
    const rows = await db
      .select()
      .from(studentAccommodations)
      .where(eq(studentAccommodations.userId, student.id));
    expect(rows).toHaveLength(0);
  });

  test("setMany only changes the percentage", async () => {
    const teacher = await insertTeacher();
    const a = await insertStudent();
    const b = await insertStudent();
    const t = callerFor(teacher);
    await t.accommodation.set({
      userId: a.id,
      extraTimePercent: 10,
      allowPaste: true,
      ignoreFocusEvents: true,
    });
    const res = await t.accommodation.setMany({
      userIds: [a.id, b.id],
      extraTimePercent: 33,
    });
    expect(res.updated).toBe(2);
    expect(await t.accommodation.get({ userId: a.id })).toEqual({
      extraTimePercent: 33,
      allowPaste: true,
      ignoreFocusEvents: true,
    });
    expect(await t.accommodation.get({ userId: b.id })).toEqual({
      extraTimePercent: 33,
      allowPaste: false,
      ignoreFocusEvents: false,
    });
  });

  test("a teacher is not a student: NOT_FOUND", async () => {
    const teacher = await insertTeacher();
    const other = await insertTeacher();
    await expect(
      callerFor(teacher).accommodation.set({
        userId: other.id,
        extraTimePercent: 25,
        allowPaste: false,
        ignoreFocusEvents: false,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Leerling niet gevonden.",
    });
  });

  test("percentages outside 0..100 are rejected", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    await expect(
      callerFor(teacher).accommodation.set({
        userId: student.id,
        extraTimePercent: 150,
        allowPaste: false,
        ignoreFocusEvents: false,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("student privacy", () => {
  test("student.get leaves one student.viewed row with the number as label", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    const t = callerFor(teacher);
    await t.student.get({ id: student.id });
    await t.student.get({ id: student.id });
    const rows = await waitFor(async () => {
      const found = await auditRows("student.viewed", student.id);
      return found.length > 0 ? found : null;
    });
    // Give a possible duplicate write the chance to land.
    await new Promise((r) => setTimeout(r, 100));
    expect(await auditRows("student.viewed", student.id)).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: teacher.id,
      actorRole: "admin",
      subjectType: "student",
      subjectId: student.id,
      subjectLabel: student.username,
    });
    expect(rows[0].details).toBeNull();
  });

  test("getPins audits pins_viewed without any PIN", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    const klas = await createClass(undefined, [student.id]);
    await callerFor(teacher).student.getPins({ classId: klas.id });
    const rows = await waitFor(async () => {
      const found = await auditRows("student.pins_viewed");
      return found.length > 0 ? found : null;
    });
    expect(rows[0].details).toEqual({ classId: klas.id, count: 1 });
  });

  test("update audits only which fields changed", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    await callerFor(teacher).student.update({
      id: student.id,
      name: "Andere Naam",
    });
    const rows = await auditRows("student.updated", student.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toEqual({ fields: ["name"] });
    expect(JSON.stringify(rows[0])).not.toContain("Andere Naam");
  });

  test("setActive audits deactivation and reactivation", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    const t = callerFor(teacher);
    await t.student.setActive({ id: student.id, active: false });
    await t.student.setActive({ id: student.id, active: true });
    expect(await auditRows("student.deactivated", student.id)).toHaveLength(1);
    expect(await auditRows("student.reactivated", student.id)).toHaveLength(1);
  });

  test("delete goes through erasure: refused while a hold applies", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    const t = callerFor(teacher);
    await db.insert(retentionHolds).values({
      userId: student.id,
      kind: "dispute",
      reason: "Bezwaar tegen cijfer",
      createdById: teacher.id,
    });
    await expect(t.student.delete({ id: student.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    await db
      .delete(retentionHolds)
      .where(eq(retentionHolds.userId, student.id));
    expect(await t.student.delete({ id: student.id })).toEqual({
      id: student.id,
    });
    const gone = await db.select().from(user).where(eq(user.id, student.id));
    expect(gone).toHaveLength(0);
    const rows = await auditRows("student.deleted", student.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].subjectLabel).toBe(student.username);
  });
});

describe("login lockouts", () => {
  test("list shows the lock and unlockLogin clears it", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    const number = student.username ?? "";
    const t = callerFor(teacher);
    const until = new Date(Date.now() + 10 * 60_000);
    await db.insert(loginThrottle).values(
      studentThrottleKeys(number).map((key) => ({
        key,
        failures: 8,
        // The column has no time zone and is compared with now() (UTC).
        lockedUntil: until,
      })),
    );

    const list = await t.student.list({ search: number });
    const row = list.rows.find((r) => r.id === student.id);
    expect(row?.recentFailures).toBe(8);
    expect(row?.loginLockedUntil).toBeInstanceOf(Date);

    const detail = await t.student.get({ id: student.id });
    expect(detail.loginLockedUntil).toBeInstanceOf(Date);

    expect(await t.student.unlockLogin({ id: student.id })).toEqual({
      id: student.id,
    });
    const left = await db
      .select()
      .from(loginThrottle)
      .where(inArray(loginThrottle.key, studentThrottleKeys(number)));
    expect(left).toHaveLength(0);
    expect(await auditRows("auth.login_unlocked", student.id)).toHaveLength(1);

    const after = await t.student.list({ search: number });
    expect(after.rows[0]).toMatchObject({
      loginLockedUntil: null,
      recentFailures: 0,
    });
  });

  test("resetPin also clears the lock and is audited", async () => {
    const teacher = await insertTeacher();
    const student = await insertStudent();
    const number = student.username ?? "";
    await db
      .insert(loginThrottle)
      .values(studentThrottleKeys(number).map((key) => ({ key, failures: 3 })));
    // insertStudent has no PIN row; resetting creates one.
    const res = await callerFor(teacher).student.resetPin({ id: student.id });
    expect(res.pin).toMatch(/^\d{6}$/);
    const left = await db
      .select()
      .from(loginThrottle)
      .where(inArray(loginThrottle.key, studentThrottleKeys(number)));
    expect(left).toHaveLength(0);
    const rows = await auditRows("student.pin_reset", student.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toEqual({ count: 1 });
    expect(JSON.stringify(rows[0])).not.toContain(res.pin);
  });
});
