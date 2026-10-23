/**
 * Loads everything Pensuma stores about one student and turns it into the
 * export JSON (AVG art. 15 inzage, art. 20 overdraagbaarheid). The shape
 * and the redaction rules live in the pure buildStudentExport.
 */
import { TRPCError } from "@trpc/server";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ROLES } from "@/lib/auth-shared";
import {
  buildStudentExport,
  type ExportAnswerRow,
  type ExportAudience,
  type ExportEventRow,
  type StudentExport,
} from "@/lib/privacy/export-format";
import {
  codeQuestionDataSchema,
  multipleChoiceDataSchema,
} from "@/lib/questions/schema";
import {
  answers,
  assignmentStudents,
  assignments,
  attemptEvents,
  attempts,
  auditLog,
  classes,
  classMembers,
  questions,
  retentionHolds,
  session,
  studentAccommodations,
  tests,
  user,
  userActivity,
  userPreferences,
} from "@/server/db/schema";
import { stillWorkingByAssignment } from "@/server/services/assignment-targets";
import type { AuditDb } from "./audit-writer";
import { getPrivacySettings } from "./settings-store";

/** Last sign-in: user_activity, else the newest session (before pruning). */
export function lastSignInSql(userIdColumn: unknown) {
  return sql<Date | null>`greatest(
    (select ${userActivity.lastSignInAt} from ${userActivity} where ${userActivity.userId} = ${userIdColumn}),
    (select max(${session.createdAt}) at time zone 'UTC' from ${session} where ${session.userId} = ${userIdColumn})
  )`.mapWith(userActivity.lastSignInAt);
}

export async function loadStudentExport(
  db: AuditDb,
  userId: string,
  audience: ExportAudience,
  now: Date = new Date(),
): Promise<StudentExport> {
  const [student] = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      banned: user.banned,
      lastSignInAt: lastSignInSql(user.id),
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!student || student.role !== ROLES.student) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Leerling niet gevonden.",
    });
  }

  const [
    { settings },
    classRows,
    attemptRows,
    accommodation,
    preferences,
    accessRows,
    holdRows,
    assignmentHoldRows,
    targetedRows,
  ] = await Promise.all([
    getPrivacySettings(db),
    db
      .select({
        name: classes.name,
        schoolYear: classes.schoolYear,
        archived: classes.archived,
        joinedAt: classMembers.createdAt,
      })
      .from(classMembers)
      .innerJoin(classes, eq(classes.id, classMembers.classId))
      .where(eq(classMembers.userId, userId))
      .orderBy(asc(classes.name)),
    db
      .select({
        id: attempts.id,
        assignmentId: attempts.assignmentId,
        attemptNumber: attempts.attemptNumber,
        status: attempts.status,
        startedAt: attempts.startedAt,
        submittedAt: attempts.submittedAt,
        score: attempts.score,
        maxScore: attempts.maxScore,
        assignmentTitle: assignments.title,
        mode: assignments.mode,
        assignmentStatus: assignments.status,
        opensAt: assignments.opensAt,
        closesAt: assignments.closesAt,
        settings: assignments.settings,
        resultsReleased: assignments.resultsReleased,
        testTitle: tests.title,
      })
      .from(attempts)
      .innerJoin(assignments, eq(assignments.id, attempts.assignmentId))
      .innerJoin(tests, eq(tests.id, assignments.testId))
      .where(eq(attempts.userId, userId))
      .orderBy(asc(attempts.startedAt)),
    db
      .select({
        extraTimePercent: studentAccommodations.extraTimePercent,
        allowPaste: studentAccommodations.allowPaste,
        ignoreFocusEvents: studentAccommodations.ignoreFocusEvents,
      })
      .from(studentAccommodations)
      .where(eq(studentAccommodations.userId, userId))
      .limit(1),
    db
      .select({ prefs: userPreferences.prefs })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1),
    db
      .select({
        createdAt: auditLog.createdAt,
        action: auditLog.action,
        actorRole: auditLog.actorRole,
      })
      .from(auditLog)
      .where(eq(auditLog.subjectUserId, userId))
      .orderBy(desc(auditLog.id))
      .limit(5000),
    // Never who created a hold (teacher names stay out of the export).
    db
      .select({
        kind: retentionHolds.kind,
        reason: retentionHolds.reason,
        until: retentionHolds.until,
        createdAt: retentionHolds.createdAt,
      })
      .from(retentionHolds)
      .where(eq(retentionHolds.userId, userId))
      .orderBy(asc(retentionHolds.createdAt)),
    db
      .select({
        kind: retentionHolds.kind,
        until: retentionHolds.until,
        createdAt: retentionHolds.createdAt,
        assignmentTitle: assignments.title,
        testTitle: tests.title,
      })
      .from(retentionHolds)
      .innerJoin(assignments, eq(assignments.id, retentionHolds.assignmentId))
      .innerJoin(tests, eq(tests.id, assignments.testId))
      .where(
        inArray(
          retentionHolds.assignmentId,
          db
            .select({ id: attempts.assignmentId })
            .from(attempts)
            .where(eq(attempts.userId, userId)),
        ),
      )
      .orderBy(asc(retentionHolds.createdAt)),
    db
      .select({
        assignmentTitle: assignments.title,
        testTitle: tests.title,
        mode: assignments.mode,
        opensAt: assignments.opensAt,
        closesAt: assignments.closesAt,
      })
      .from(assignmentStudents)
      .innerJoin(
        assignments,
        eq(assignments.id, assignmentStudents.assignmentId),
      )
      .innerJoin(tests, eq(tests.id, assignments.testId))
      .where(eq(assignmentStudents.userId, userId))
      .orderBy(asc(assignments.createdAt)),
  ]);

  const attemptIds = attemptRows.map((a) => a.id);
  // Only the student's own export hides results; it holds them back while
  // a classmate with verlengde tijd is still working (as the portal does).
  const working =
    audience === "student"
      ? await stillWorkingByAssignment(
          db,
          attemptRows.map((a) => ({
            id: a.assignmentId,
            status: a.assignmentStatus,
            opensAt: a.opensAt,
            closesAt: a.closesAt,
          })),
          now,
        )
      : new Map<string, boolean>();
  const [answerRows, eventRows] = attemptIds.length
    ? await Promise.all([
        db
          .select({
            attemptId: answers.attemptId,
            questionTitle: questions.title,
            questionType: questions.type,
            questionData: questions.data,
            position: questions.position,
            response: answers.response,
            autoScore: answers.autoScore,
            manualScore: answers.manualScore,
            maxScore: answers.maxScore,
            feedback: answers.feedback,
            result: answers.result,
            hintsUsed: answers.hintsUsed,
          })
          .from(answers)
          .innerJoin(questions, eq(questions.id, answers.questionId))
          .where(inArray(answers.attemptId, attemptIds))
          .orderBy(asc(questions.position)),
        db
          .select({
            attemptId: attemptEvents.attemptId,
            type: attemptEvents.type,
            createdAt: attemptEvents.createdAt,
            details: attemptEvents.details,
          })
          .from(attemptEvents)
          .where(inArray(attemptEvents.attemptId, attemptIds))
          .orderBy(asc(attemptEvents.createdAt)),
      ])
    : [[], []];

  const answersByAttempt = new Map<string, ExportAnswerRow[]>();
  for (const a of answerRows) {
    let optionTexts: Record<string, string> | undefined;
    let hints: { id: string; penalty: number }[] | undefined;
    if (a.questionType === "code") {
      // Ids and penalties only: hint texts and the model solution stay out.
      const parsed = codeQuestionDataSchema.safeParse(a.questionData);
      if (parsed.success) {
        hints = parsed.data.hints.map((h) => ({
          id: h.id,
          penalty: h.penalty,
        }));
      }
    }
    if (a.questionType === "multiple_choice") {
      const parsed = multipleChoiceDataSchema.safeParse(a.questionData);
      if (parsed.success) {
        optionTexts = Object.fromEntries(
          parsed.data.options.map((o) => [o.id, o.text]),
        );
      }
    }
    const list = answersByAttempt.get(a.attemptId) ?? [];
    list.push({
      questionTitle: a.questionTitle,
      questionType: a.questionType,
      response: a.response,
      autoScore: a.autoScore,
      manualScore: a.manualScore,
      maxScore: a.maxScore,
      feedback: a.feedback,
      result: a.result,
      optionTexts,
      hintsUsed: a.hintsUsed,
      hints,
    });
    answersByAttempt.set(a.attemptId, list);
  }
  const eventsByAttempt = new Map<string, ExportEventRow[]>();
  for (const e of eventRows) {
    const list = eventsByAttempt.get(e.attemptId) ?? [];
    list.push({ type: e.type, createdAt: e.createdAt, details: e.details });
    eventsByAttempt.set(e.attemptId, list);
  }

  return buildStudentExport(
    {
      settings,
      student: {
        name: student.name,
        studentNumber: student.username ?? "",
        createdAt: student.createdAt,
        banned: student.banned,
        lastSignInAt: toDate(student.lastSignInAt),
      },
      classes: classRows,
      accommodation: accommodation[0] ?? null,
      preferences: preferences[0]?.prefs ?? null,
      attempts: attemptRows.map((a) => ({
        attemptNumber: a.attemptNumber,
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        score: a.score,
        maxScore: a.maxScore,
        assignment: {
          title: a.assignmentTitle,
          mode: a.mode,
          status: a.assignmentStatus,
          opensAt: a.opensAt,
          closesAt: a.closesAt,
          settings: a.settings,
          resultsReleased: a.resultsReleased,
          othersWorking: working.get(a.assignmentId) ?? false,
        },
        testTitle: a.testTitle,
        answers: answersByAttempt.get(a.id) ?? [],
        events: eventsByAttempt.get(a.id) ?? [],
      })),
      accessLog: accessRows,
      holds: holdRows,
      assignmentHolds: assignmentHoldRows,
      targetedAssignments: targetedRows,
    },
    { audience, now },
  );
}

/** Raw SQL timestamps come back as strings; normalise to Date. */
export function toDate(value: unknown): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}
