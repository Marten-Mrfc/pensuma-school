import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  parseQuestionData,
  type ShowSolutions,
  type TypedQuestionData,
} from "@/lib/questions/schema";
import { db } from "@/server/db";
import {
  assignments,
  attempts,
  classes,
  classMembers,
  type questions,
  studentAccommodations,
  tests,
} from "@/server/db/schema";
import {
  effectiveAssignmentStatus,
  parseAssignmentSettings,
} from "@/server/services/assignment-status";
import { assignmentVisibleToStudent } from "@/server/services/assignment-targets";
import { isClassMember } from "@/server/services/attempts";

/**
 * Access checks and student-safe views shared by the student routers
 * (portal, help). Every loader checks class membership; assignments are
 * also filtered by targeting (assignment_student).
 */

type AssignmentRow = typeof assignments.$inferSelect;
type QuestionRow = typeof questions.$inferSelect;

export const notFound = (
  message = "Deze toets bestaat niet of is niet voor jouw klas.",
) => new TRPCError({ code: "NOT_FOUND", message });

/** Question data parsed leniently (bad data falls back to defaults). */
export function typedData(
  q: Pick<QuestionRow, "type" | "data">,
): TypedQuestionData {
  try {
    return {
      type: q.type,
      data: parseQuestionData(q.type, q.data),
    } as TypedQuestionData;
  } catch {
    return {
      type: q.type,
      data: parseQuestionData(q.type, {}),
    } as TypedQuestionData;
  }
}

/** Facilities of a student (faciliteitenpas); null when none are set. */
export type StudentAccommodation = {
  extraTimePercent: number;
  allowPaste: boolean;
  ignoreFocusEvents: boolean;
};

export async function loadAccommodation(
  userId: string,
): Promise<StudentAccommodation | null> {
  const [row] = await db
    .select({
      extraTimePercent: studentAccommodations.extraTimePercent,
      allowPaste: studentAccommodations.allowPaste,
      ignoreFocusEvents: studentAccommodations.ignoreFocusEvents,
    })
    .from(studentAccommodations)
    .where(eq(studentAccommodations.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * The settings a student's browser gets, with the effective values for
 * this student:
 *  - exams never offer hints, code tips or solutions (whatever is stored);
 *  - allowPaste switches blockPaste off, ignoreFocusEvents switches
 *    logFocusEvents off (requireFullscreen stays).
 */
export function studentSettings(
  assignment: Pick<AssignmentRow, "settings" | "mode">,
  accommodation?: Pick<
    StudentAccommodation,
    "allowPaste" | "ignoreFocusEvents"
  > | null,
) {
  const s = parseAssignmentSettings(assignment.settings);
  const exam = assignment.mode === "exam";
  return {
    requireFullscreen: s.requireFullscreen,
    logFocusEvents: s.logFocusEvents && !accommodation?.ignoreFocusEvents,
    blockPaste: s.blockPaste && !accommodation?.allowPaste,
    allowCodeRun: s.allowCodeRun,
    allowSelfTest: s.allowSelfTest,
    maxAttempts: s.maxAttempts,
    showResults: s.showResults,
    allowHints: !exam && s.allowHints,
    codeTips: !exam && s.codeTips,
    showSolutions: (exam ? "never" : s.showSolutions) as ShowSolutions,
  };
}
export type StudentSettings = ReturnType<typeof studentSettings>;

/**
 * Load an assignment of one of the student's classes. Hidden (NOT_FOUND)
 * when it is planned without an opening time, or targeted at other
 * students of the class.
 */
export async function loadAssignmentForStudent(
  userId: string,
  assignmentId: string,
) {
  const [row] = await db
    .select({
      assignment: assignments,
      testTitle: tests.title,
      testDescription: tests.description,
      className: classes.name,
    })
    .from(assignments)
    .innerJoin(tests, eq(tests.id, assignments.testId))
    .innerJoin(classes, eq(classes.id, assignments.classId))
    .innerJoin(
      classMembers,
      and(
        eq(classMembers.classId, assignments.classId),
        eq(classMembers.userId, userId),
      ),
    )
    .where(
      and(eq(assignments.id, assignmentId), assignmentVisibleToStudent(userId)),
    )
    .limit(1);
  if (!row) throw notFound();
  const status = effectiveAssignmentStatus(row.assignment);
  if (status === "planned" && !row.assignment.opensAt) throw notFound();
  return { ...row, status };
}

/**
 * Load an attempt owned by the student, whose class they still belong to.
 * Targeting is not checked: attempts that exist stay visible.
 */
export async function loadOwnedAttempt(userId: string, attemptId: string) {
  const [row] = await db
    .select({
      attempt: attempts,
      assignment: assignments,
      testTitle: tests.title,
    })
    .from(attempts)
    .innerJoin(assignments, eq(assignments.id, attempts.assignmentId))
    .innerJoin(tests, eq(tests.id, assignments.testId))
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Deze poging bestaat niet.");
  if (!(await isClassMember(userId, row.assignment.classId))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Deze toets is niet (meer) voor jouw klas.",
    });
  }
  return row;
}
