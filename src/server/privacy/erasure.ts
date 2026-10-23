/**
 * Erasure of a student (AVG art. 17): preview the data concerned, then
 * delete the account in one transaction. Foreign keys cascade to sessions,
 * accounts, class memberships, attempts, answers, events, PINs,
 * accommodations and preferences. Active retention holds block erasure.
 * The audit log has no foreign keys: earlier rows about the student stay
 * (who did what, when, with the leerlingnummer and without a name), but
 * their scores and facilities are stripped (redactErasedStudentsAudit).
 */
import { TRPCError } from "@trpc/server";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { ROLES } from "@/lib/auth-shared";
import type { RetentionHoldKind } from "@/lib/privacy/retention";
import {
  answers,
  attemptEvents,
  attempts,
  classMembers,
  retentionHolds,
  user,
} from "@/server/db/schema";
import { clearStudentLoginThrottle } from "@/server/security/login-throttle";
import {
  type AuditContext,
  type AuditDb,
  auditFromCtx,
} from "@/server/services/audit";
import { redactErasedStudentsAudit } from "./audit-writer";

export type ErasureCounts = {
  classes: number;
  attempts: number;
  answers: number;
  events: number;
};

export type ErasePreview = ErasureCounts & {
  name: string;
  studentNumber: string;
  /** Active holds on the student, or on an assignment they have an attempt in. */
  holds: {
    id: string;
    kind: RetentionHoldKind;
    reason: string;
    until: Date | null;
  }[];
};

async function loadStudent(db: AuditDb, userId: string) {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row || row.role !== ROLES.student) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Leerling niet gevonden.",
    });
  }
  return row;
}

async function countData(db: AuditDb, userId: string): Promise<ErasureCounts> {
  const result = await db.execute<{
    classes: number;
    attempts: number;
    answers: number;
    events: number;
  }>(sql`
    select
      (select count(*)::int from ${classMembers} where ${classMembers.userId} = ${userId}) as classes,
      (select count(*)::int from ${attempts} where ${attempts.userId} = ${userId}) as attempts,
      (select count(*)::int from ${answers}
        inner join ${attempts} on ${attempts.id} = ${answers.attemptId}
        where ${attempts.userId} = ${userId}) as answers,
      (select count(*)::int from ${attemptEvents}
        inner join ${attempts} on ${attempts.id} = ${attemptEvents.attemptId}
        where ${attempts.userId} = ${userId}) as events
  `);
  const row = result.rows[0];
  return {
    classes: Number(row?.classes ?? 0),
    attempts: Number(row?.attempts ?? 0),
    answers: Number(row?.answers ?? 0),
    events: Number(row?.events ?? 0),
  };
}

/** Active holds (until null or in the future) that cover this student. */
async function activeHolds(db: AuditDb, userId: string) {
  return db
    .select({
      id: retentionHolds.id,
      kind: retentionHolds.kind,
      reason: retentionHolds.reason,
      until: retentionHolds.until,
    })
    .from(retentionHolds)
    .where(
      and(
        or(isNull(retentionHolds.until), gt(retentionHolds.until, sql`now()`)),
        or(
          eq(retentionHolds.userId, userId),
          inArray(
            retentionHolds.assignmentId,
            db
              .select({ id: attempts.assignmentId })
              .from(attempts)
              .where(eq(attempts.userId, userId)),
          ),
        ),
      ),
    )
    .orderBy(retentionHolds.createdAt);
}

/** What erasing this student would delete, and which holds block it. */
export async function erasePreview(
  db: AuditDb,
  userId: string,
): Promise<ErasePreview> {
  const student = await loadStudent(db, userId);
  const [counts, holds] = await Promise.all([
    countData(db, userId),
    activeHolds(db, userId),
  ]);
  return {
    name: student.name,
    studentNumber: student.username ?? "",
    ...counts,
    holds,
  };
}

/**
 * Delete a student and everything that cascades from the account, clear
 * their login lockouts and write `student.deleted` (counts only), all in
 * one transaction. Refused while an active retention hold applies.
 */
export async function eraseStudentById(
  db: AuditDb,
  userId: string,
  auditCtx: AuditContext,
): Promise<ErasureCounts> {
  return db.transaction(async (tx) => {
    const student = await loadStudent(tx, userId);
    const holds = await activeHolds(tx, userId);
    if (holds.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Voor deze leerling geldt een bewaarblokkade. Hef die eerst op.",
      });
    }
    const counts = await countData(tx, userId);
    await tx.delete(user).where(eq(user.id, userId));
    await redactErasedStudentsAudit(tx, [userId]);
    const studentNumber = student.username ?? "";
    if (studentNumber) await clearStudentLoginThrottle(tx, studentNumber);
    await auditFromCtx(
      auditCtx,
      {
        action: "student.deleted",
        subjectType: "student",
        subjectId: userId,
        subjectUserId: userId,
        subjectLabel: studentNumber || null,
        details: counts,
      },
      tx,
    );
    return counts;
  });
}
