/** Retention engine: expired rows go, held rows stay, counts add up. */
import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  attemptEvents,
  attempts,
  auditLog,
  classes,
  loginThrottle,
  rateLimit,
  retentionHolds,
  retentionRuns,
  session,
  user,
  verification,
} from "@/server/db/schema";
import {
  previewRetention,
  runRetention,
} from "@/server/privacy/retention-core";
import { savePrivacySettings } from "@/server/privacy/settings-store";
import type { TestUser } from "../support/caller";
import { countRows, resetDatabase } from "../support/db";
import {
  createAssignment,
  createClass,
  createTest,
  insertStudent,
} from "../support/factories";

const NOW = new Date();
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

beforeEach(resetDatabase);

async function addSession(userId: string, expiresAt: Date) {
  await db.insert(session).values({
    id: randomUUID(),
    token: randomUUID(),
    userId,
    expiresAt,
    updatedAt: NOW,
  });
}

async function oldAttempt(student: TestUser, classId: string, ageDays: number) {
  const { test, questions } = await createTest();
  const assignment = await createAssignment({
    testId: test.id,
    classId,
    status: "closed",
    closesAt: daysAgo(ageDays),
  });
  const [attempt] = await db
    .insert(attempts)
    .values({
      assignmentId: assignment.id,
      userId: student.id,
      status: "submitted",
      startedAt: daysAgo(ageDays),
      submittedAt: daysAgo(ageDays),
      focusLossCount: 2,
    })
    .returning();
  await db.insert(answers).values({
    attemptId: attempt.id,
    questionId: questions[0].id,
    response: { selected: ["a"] },
    maxScore: 1,
  });
  await db.insert(attemptEvents).values([
    { attemptId: attempt.id, type: "focus_lost", createdAt: daysAgo(ageDays) },
    {
      attemptId: attempt.id,
      type: "focus_gained",
      createdAt: daysAgo(ageDays),
    },
  ]);
  return { assignment, attempt };
}

describe("runRetention", () => {
  test("technical data and old logs are deleted; holds are respected", async () => {
    const s1 = await insertStudent();
    const s2 = await insertStudent();
    const klas = await createClass(undefined, [s1.id, s2.id]);

    await addSession(s1.id, daysAgo(1));
    await addSession(s1.id, new Date(NOW.getTime() + DAY));
    await db.insert(verification).values([
      {
        id: randomUUID(),
        identifier: "x",
        value: "y",
        expiresAt: daysAgo(1),
      },
    ]);
    await db.insert(rateLimit).values([
      {
        id: randomUUID(),
        key: "old",
        count: 1,
        lastRequest: NOW.getTime() - 2 * DAY,
      },
      { id: randomUUID(), key: "new", count: 1, lastRequest: NOW.getTime() },
    ]);
    await db.insert(loginThrottle).values([
      { key: "/sign-in/username:old", failures: 3, updatedAt: daysAgo(2) },
      {
        key: "/sign-in/username:locked",
        failures: 8,
        updatedAt: daysAgo(2),
        lockedUntil: new Date(NOW.getTime() + DAY),
      },
    ]);
    const free = await oldAttempt(s1, klas.id, 200);
    const held = await oldAttempt(s2, klas.id, 200);
    const recent = await oldAttempt(s1, klas.id, 5);
    await db.insert(retentionHolds).values({
      assignmentId: held.assignment.id,
      kind: "dispute",
      reason: "Bezwaar",
    });
    await db.insert(auditLog).values([
      {
        actorRole: "system",
        action: "privacy.retention_run",
        createdAt: new Date(NOW.getTime() - 900 * DAY),
      },
      { actorRole: "system", action: "privacy.retention_run" },
    ]);

    const preview = await previewRetention(db, NOW);
    expect(preview.dryRun).toBe(true);
    expect(await countRows("session")).toBe(2);

    const report = await runRetention(db, { now: NOW, trigger: "cli" });
    expect(report).toMatchObject({
      sessions: 1,
      verification: 1,
      rateLimit: 1,
      loginThrottle: 1,
      attemptEvents: 2,
      attemptsReset: 1,
      attempts: 0,
      inactiveStudents: 0,
      auditLog: 1,
      skippedByHold: 2,
    });
    expect(preview.sessions).toBe(report.sessions);
    expect(preview.attemptEvents).toBe(report.attemptEvents);

    const eventsOf = async (attemptId: string) =>
      (
        await db
          .select()
          .from(attemptEvents)
          .where(eq(attemptEvents.attemptId, attemptId))
      ).length;
    expect(await eventsOf(free.attempt.id)).toBe(0);
    expect(await eventsOf(held.attempt.id)).toBe(2);
    expect(await eventsOf(recent.attempt.id)).toBe(2);
    const [reset] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, free.attempt.id));
    expect(reset?.focusLossCount).toBe(0);
    // Attempts themselves stay until the school confirms the periods.
    expect(await countRows("attempt")).toBe(3);
    expect(await countRows("login_throttle")).toBe(1);

    const runs = await db.select().from(retentionRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.report?.sessions).toBe(1);
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "privacy.retention_run"));
    // One recent seeded row survived, plus the new system row.
    expect(audits).toHaveLength(2);
  });

  test("confirmed auto-delete removes old attempts and inactive students", async () => {
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
    const active = await insertStudent();
    const leaver = await insertStudent();
    const heldLeaver = await insertStudent();
    const klas = await createClass(undefined, [active.id]);
    const archived = await createClass(undefined, [leaver.id, heldLeaver.id]);
    await db
      .update(classes)
      .set({ archived: true })
      .where(eq(classes.id, archived.id));
    await db
      .update(user)
      .set({ createdAt: daysAgo(400) })
      .where(eq(user.id, leaver.id));
    await db
      .update(user)
      .set({ createdAt: daysAgo(400) })
      .where(eq(user.id, heldLeaver.id));
    await db.insert(retentionHolds).values({
      userId: heldLeaver.id,
      kind: "exam_dossier",
      reason: "Examendossier",
    });
    const old = await oldAttempt(active, klas.id, 300);
    const young = await oldAttempt(active, klas.id, 30);

    const report = await runRetention(db, { now: NOW, trigger: "manual" });
    expect(report.attempts).toBe(1);
    expect(report.answers).toBe(1);
    expect(report.inactiveStudents).toBe(1);
    expect(report.skippedByHold).toBeGreaterThanOrEqual(1);

    expect(
      await db.select().from(attempts).where(eq(attempts.id, old.attempt.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(attempts).where(eq(attempts.id, young.attempt.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(user).where(eq(user.id, leaver.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(user).where(eq(user.id, heldLeaver.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(user).where(eq(user.id, active.id)),
    ).toHaveLength(1);
    const [proof] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.subjectUserId, leaver.id));
    expect(proof?.action).toBe("student.deleted");
    expect(proof?.details).toEqual({ via: "retention" });
  });

  test("dry run changes nothing and is not audited", async () => {
    const s = await insertStudent();
    await addSession(s.id, daysAgo(1));
    const report = await runRetention(db, {
      now: NOW,
      trigger: "cli",
      dryRun: true,
    });
    expect(report.sessions).toBe(1);
    expect(await countRows("session")).toBe(1);
    expect(await countRows("audit_log")).toBe(0);
    const [run] = await db.select().from(retentionRuns);
    expect(run?.dryRun).toBe(true);
  });
});

describe("scheduler lock", () => {
  test("a second server skips while the lock is held", async () => {
    const { Pool } = await import("pg");
    const { runLockedRetention } = await import(
      "@/server/privacy/retention-scheduler"
    );
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
    });
    const holder = await pool.connect();
    try {
      await holder.query(
        "select pg_advisory_lock(hashtext('pensuma:retention'))",
      );
      expect(await runLockedRetention(pool)).toBe("skipped");
      await holder.query(
        "select pg_advisory_unlock(hashtext('pensuma:retention'))",
      );
      expect(await runLockedRetention(pool)).toBe("ran");
      const runs = await db.select().from(retentionRuns);
      expect(runs.map((r) => r.trigger)).toEqual(["schedule"]);
    } finally {
      holder.release();
      await pool.end();
    }
  });
});
