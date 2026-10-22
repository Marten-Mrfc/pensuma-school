/**
 * Afnames (assignments) for teachers: plan, open, close, monitor live and
 * manage individual attempts (extra time, reopen, reset).
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import {
  ACCESS_CODE_REGEX,
  defaultAccessCodeForMode,
  defaultSettingsForMode,
  normalizeAccessCode,
} from "@/components/docent/assignments/defaults";
import { ROLES } from "@/lib/auth-shared";
import {
  type AssignmentSettings,
  assignmentSettingsSchema,
  gradingMethodSchema,
  showResultsSchema,
  showSolutionsSchema,
} from "@/lib/questions/schema";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import type { DB } from "@/server/db";
import {
  answers,
  assignmentStudents,
  assignments,
  attemptEvents,
  attempts,
  classes,
  classMembers,
  questions,
  studentAccommodations,
  tests,
  user,
} from "@/server/db/schema";
import {
  computeAttemptDeadline,
  effectiveAssignmentStatus,
  generateAccessCode,
  isPastDeadline,
  parseAssignmentSettings,
  totalExtraMinutes,
} from "@/server/services/assignment-status";
import { targetedStudentIds } from "@/server/services/assignment-targets";
import { gradeAttempt } from "@/server/services/grading";

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

const idSchema = z.uuid("Ongeldige id.");
const modeSchema = z.enum(["exam", "practice"]);
const statusFilterSchema = z.enum(["planned", "open", "closed"]);

/**
 * Run work after the response has been sent (Next.js `after`). Outside a
 * request scope (scripts, tests) it simply runs detached. Errors are logged,
 * never thrown.
 */
export function runInBackground(label: string, task: () => Promise<void>) {
  const wrapped = async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[${label}]`, err);
    }
  };
  try {
    after(wrapped);
  } catch {
    void wrapped();
  }
}

/** Grade attempts one by one; failures are logged and counted. */
export async function gradeAttemptsSafely(
  attemptIds: string[],
  concurrency = 2,
) {
  let graded = 0;
  let failed = 0;
  const queue = [...attemptIds];
  const worker = async () => {
    for (;;) {
      const id = queue.shift();
      if (!id) return;
      try {
        await gradeAttempt(id);
        graded++;
      } catch (err) {
        failed++;
        console.error(`[grading] attempt ${id} failed`, err);
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, queue.length)) },
      worker,
    ),
  );
  return { graded, failed };
}

export async function getAssignmentOrThrow(db: DB, id: string) {
  const [row] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, id));
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze afname bestaat niet (meer).",
    });
  }
  return row;
}

async function getAttemptWithAssignmentOrThrow(db: DB, attemptId: string) {
  const [row] = await db
    .select({ attempt: attempts, assignment: assignments })
    .from(attempts)
    .innerJoin(assignments, eq(assignments.id, attempts.assignmentId))
    .where(eq(attempts.id, attemptId));
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze poging bestaat niet (meer).",
    });
  }
  return row;
}

/** Question count and total points per test. */
async function testTotals(db: DB, testIds: string[]) {
  const map = new Map<string, { questionCount: number; totalPoints: number }>();
  if (!testIds.length) return map;
  const rows = await db
    .select({
      testId: questions.testId,
      questionCount: sql<number>`count(*)::int`,
      totalPoints: sql<number>`coalesce(sum(${questions.points}), 0)::float8`,
    })
    .from(questions)
    .where(inArray(questions.testId, testIds))
    .groupBy(questions.testId);
  for (const r of rows)
    map.set(r.testId, {
      questionCount: r.questionCount,
      totalPoints: r.totalPoints,
    });
  return map;
}

/** Number of students per class (only accounts with the student role). */
export async function studentCountsByClass(db: DB, classIds: string[]) {
  const map = new Map<string, number>();
  if (!classIds.length) return map;
  const rows = await db
    .select({
      classId: classMembers.classId,
      count: sql<number>`count(*)::int`,
    })
    .from(classMembers)
    .innerJoin(user, eq(user.id, classMembers.userId))
    .where(
      and(
        inArray(classMembers.classId, classIds),
        eq(user.role, ROLES.student),
      ),
    )
    .groupBy(classMembers.classId);
  for (const r of rows) map.set(r.classId, r.count);
  return map;
}

/** Distinct students that started / are busy / submitted, per assignment. */
export async function attemptCountsByAssignment(
  db: DB,
  assignmentIds: string[],
) {
  const map = new Map<
    string,
    { started: number; inProgress: number; submitted: number }
  >();
  if (!assignmentIds.length) return map;
  const rows = await db
    .select({
      assignmentId: attempts.assignmentId,
      started: sql<number>`count(distinct ${attempts.userId})::int`,
      inProgress: sql<number>`(count(distinct ${attempts.userId}) filter (where ${attempts.status} = 'in_progress'))::int`,
      submitted: sql<number>`(count(distinct ${attempts.userId}) filter (where ${attempts.status} = 'submitted'))::int`,
    })
    .from(attempts)
    .where(inArray(attempts.assignmentId, assignmentIds))
    .groupBy(attempts.assignmentId);
  for (const r of rows) {
    map.set(r.assignmentId, {
      started: r.started,
      inProgress: r.inProgress,
      submitted: r.submitted,
    });
  }
  return map;
}

/** Keep only the attempt with the highest attempt number per user. */
export function latestPerUser<
  T extends { userId: string; attemptNumber: number },
>(rows: T[]) {
  const map = new Map<string, T>();
  for (const r of rows) {
    const current = map.get(r.userId);
    if (!current || r.attemptNumber > current.attemptNumber)
      map.set(r.userId, r);
  }
  return map;
}

/**
 * Students of a class plus anyone (no longer in the class) with an attempt.
 * A targeted afname (inhaaltoets/herkansing) only lists its selected
 * students, plus anyone who already has an attempt.
 */
export async function rosterForAssignment(
  db: DB,
  classId: string,
  assignmentId: string,
) {
  const targets = (await targetedStudentIds(db, [assignmentId])).get(
    assignmentId,
  );
  const members = await db
    .select({ id: user.id, name: user.name, studentNumber: user.username })
    .from(classMembers)
    .innerJoin(user, eq(user.id, classMembers.userId))
    .where(
      and(
        eq(classMembers.classId, classId),
        eq(user.role, ROLES.student),
        targets ? inArray(user.id, targets) : undefined,
      ),
    );
  const others = await db
    .selectDistinct({
      id: user.id,
      name: user.name,
      studentNumber: user.username,
    })
    .from(attempts)
    .innerJoin(user, eq(user.id, attempts.userId))
    .where(eq(attempts.assignmentId, assignmentId));
  const map = new Map<
    string,
    { id: string; name: string; studentNumber: string | null; inClass: boolean }
  >();
  for (const m of members) map.set(m.id, { ...m, inClass: true });
  for (const o of others)
    if (!map.has(o.id)) map.set(o.id, { ...o, inClass: false });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

/** Display title of an afname: its own title or the test title. */
function displayTitle(a: { title: string | null }, testTitle: string) {
  return a.title?.trim() || testTitle;
}

/**
 * Targeted students per afname plus the afname each one is a herkansing
 * of, for list/get/monitor.
 */
async function targetingInfo(
  db: DB,
  rows: { id: string; retakeOfId: string | null }[],
) {
  const retakeIds = [
    ...new Set(rows.map((r) => r.retakeOfId).filter((x): x is string => !!x)),
  ];
  const [targets, retakes] = await Promise.all([
    targetedStudentIds(
      db,
      rows.map((r) => r.id),
    ),
    retakeIds.length
      ? db
          .select({
            id: assignments.id,
            title: assignments.title,
            testTitle: tests.title,
          })
          .from(assignments)
          .innerJoin(tests, eq(tests.id, assignments.testId))
          .where(inArray(assignments.id, retakeIds))
      : Promise.resolve([]),
  ]);
  const retakeById = new Map(
    retakes.map((r) => [
      r.id,
      { id: r.id, title: displayTitle(r, r.testTitle) },
    ]),
  );
  return {
    targets,
    retakeOf: (retakeOfId: string | null) =>
      retakeOfId ? (retakeById.get(retakeOfId) ?? null) : null,
  };
}

/** Verlengde tijd (percent) per student; students without one are absent. */
async function extraTimeByUser(db: DB, userIds: string[]) {
  const map = new Map<string, number>();
  if (!userIds.length) return map;
  const rows = await db
    .select({
      userId: studentAccommodations.userId,
      extraTimePercent: studentAccommodations.extraTimePercent,
    })
    .from(studentAccommodations)
    .where(inArray(studentAccommodations.userId, userIds));
  for (const r of rows)
    if (r.extraTimePercent > 0) map.set(r.userId, r.extraTimePercent);
  return map;
}

/**
 * Throws unless every id is a student member of the class. Returns the
 * unique ids.
 */
async function assertStudentsOfClass(
  db: DB,
  classId: string,
  userIds: string[],
): Promise<string[]> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return unique;
  const rows = await db
    .select({ id: classMembers.userId })
    .from(classMembers)
    .innerJoin(user, eq(user.id, classMembers.userId))
    .where(
      and(
        eq(classMembers.classId, classId),
        eq(user.role, ROLES.student),
        inArray(classMembers.userId, unique),
      ),
    );
  if (rows.length !== unique.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Kies leerlingen uit deze klas.",
    });
  }
  return unique;
}

/** Classes by id, in the requested order; throws when one is missing. */
async function classesOrThrow(db: DB, classIds: string[]) {
  const rows = await db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(inArray(classes.id, classIds));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return classIds.map((id) => {
    const klas = byId.get(id);
    if (!klas) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Deze klas bestaat niet (meer).",
      });
    }
    return klas;
  });
}

/** Validate the window: closesAt after opensAt and not in the past. */
function assertWindow(
  opensAt: Date | null | undefined,
  closesAt: Date | null | undefined,
  now = new Date(),
) {
  if (opensAt && closesAt && closesAt <= opensAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Het einde moet na de start liggen.",
    });
  }
  if (closesAt && closesAt <= now) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Het einde ligt in het verleden.",
    });
  }
}

function resolveAccessCode(
  input: { accessCode?: string | null; generateAccessCode?: boolean },
  fallbackGenerate: boolean,
): string | null {
  if (typeof input.accessCode === "string" && input.accessCode.trim() !== "") {
    const code = normalizeAccessCode(input.accessCode);
    if (!ACCESS_CODE_REGEX.test(code)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Een toegangscode bestaat uit 3 tot 20 letters, cijfers of streepjes.",
      });
    }
    return code;
  }
  if (input.generateAccessCode === true) return generateAccessCode();
  if (
    input.generateAccessCode === false ||
    input.accessCode === null ||
    input.accessCode === ""
  )
    return null;
  return fallbackGenerate ? generateAccessCode() : null;
}

/** Recompute deadlines of running attempts after the window/time limit changed. */
async function recomputeRunningDeadlines(
  db: DB,
  assignment: {
    id: string;
    timeLimitMinutes: number | null;
    closesAt: Date | null;
  },
) {
  const running = await db
    .select({
      id: attempts.id,
      startedAt: attempts.startedAt,
      extraMinutes: attempts.extraMinutes,
      accommodationMinutes: attempts.accommodationMinutes,
    })
    .from(attempts)
    .where(
      and(
        eq(attempts.assignmentId, assignment.id),
        eq(attempts.status, "in_progress"),
      ),
    );
  for (const a of running) {
    await db
      .update(attempts)
      .set({
        deadlineAt: computeAttemptDeadline(
          assignment,
          a.startedAt,
          totalExtraMinutes(a),
        ),
      })
      .where(eq(attempts.id, a.id));
  }
  return running.length;
}

/**
 * Submit attempts on behalf of the student (assignment closed, or the
 * deadline passed while the student was gone) and grade them afterwards.
 * Only rows that are still in progress are touched, so this is safe to run
 * concurrently with the student's own submit.
 */
export async function autoSubmitAttempts(
  db: DB,
  where: SQL,
  reason: "assignment_closed" | "deadline_passed",
) {
  const now = new Date();
  const submitted = await db
    .update(attempts)
    .set({
      status: "submitted",
      submittedAt: now,
      autoSubmitted: true,
      gradingStatus: "pending",
    })
    .where(and(eq(attempts.status, "in_progress"), where))
    .returning({ id: attempts.id });
  if (!submitted.length) return [];
  await db.insert(attemptEvents).values(
    submitted.map((s) => ({
      attemptId: s.id,
      type: "submitted" as const,
      details: {
        auto: true,
        by: reason === "assignment_closed" ? "teacher" : "server",
        reason,
      },
      createdAt: now,
    })),
  );
  const ids = submitted.map((s) => s.id);
  runInBackground("auto-submit grading", async () => {
    await gradeAttemptsSafely(ids);
  });
  return ids;
}

/**
 * Partial settings without defaults (zod's `.partial()` would still fill in
 * every default and overwrite the existing/mode values).
 */
/**
 * SQL condition for "the student actually answered this question". Blank
 * answers are saved as "empty" and become "graded" without a result (0 points)
 * after grading, so the status alone is not enough.
 */
export const answeredCondition = sql`(
  ${answers.savedAt} is not null
  and ${answers.status} <> 'empty'
  and not (${answers.status} = 'graded' and ${answers.result} is null and ${answers.manualScore} is null)
  and coalesce(jsonb_array_length(${answers.response}->'selected'), 1) > 0
)`;

const settingsPatchSchema = z.object({
  shuffleQuestions: z.boolean().optional(),
  showResults: showResultsSchema.optional(),
  allowCodeRun: z.boolean().optional(),
  allowSelfTest: z.boolean().optional(),
  requireFullscreen: z.boolean().optional(),
  logFocusEvents: z.boolean().optional(),
  blockPaste: z.boolean().optional(),
  maxAttempts: z
    .number()
    .int()
    .min(1, "Minstens 1 poging.")
    .max(100, "Hoogstens 100 pogingen.")
    .optional(),
  allowHints: z.boolean().optional(),
  showSolutions: showSolutionsSchema.optional(),
  codeTips: z.boolean().optional(),
  grading: z
    .object({
      method: gradingMethodSchema.optional(),
      passPercentage: z
        .number()
        .min(10, "Kies een percentage van minstens 10.")
        .max(90, "Kies een percentage van hoogstens 90.")
        .optional(),
      nTerm: z
        .number()
        .min(0, "De N-term is minstens 0,0.")
        .max(3, "De N-term is hoogstens 3,0.")
        .optional(),
    })
    .optional(),
});

/** Drop keys that are undefined so they don't overwrite existing values. */
function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** Merge a settings patch into full settings (the grading scale field by field). */
export function mergeSettings(
  base: AssignmentSettings,
  patch: z.infer<typeof settingsPatchSchema> | undefined,
): AssignmentSettings {
  if (!patch) return assignmentSettingsSchema.parse(base);
  const { grading, ...rest } = patch;
  return assignmentSettingsSchema.parse({
    ...base,
    ...definedOnly(rest),
    grading: { ...base.grading, ...definedOnly(grading ?? {}) },
  });
}

const windowFields = {
  opensAt: z.date().nullable().optional(),
  closesAt: z.date().nullable().optional(),
  timeLimitMinutes: z
    .number()
    .int("Vul een heel aantal minuten in.")
    .min(1, "De tijdslimiet is minstens 1 minuut.")
    .max(24 * 60, "De tijdslimiet is hoogstens 24 uur.")
    .nullable()
    .optional(),
};

const titleSchema = z
  .string()
  .trim()
  .max(150, "De titel is te lang.")
  .nullable()
  .optional();

/* -------------------------------------------------------------------------- */
/*                                   Router                                   */
/* -------------------------------------------------------------------------- */

export const assignmentRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z
        .object({
          status: statusFilterSchema.optional(),
          classId: idSchema.optional(),
          testId: idSchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const filters = [];
      if (input?.classId) filters.push(eq(assignments.classId, input.classId));
      if (input?.testId) filters.push(eq(assignments.testId, input.testId));
      const rows = await ctx.db
        .select({
          assignment: assignments,
          testTitle: tests.title,
          className: classes.name,
        })
        .from(assignments)
        .innerJoin(tests, eq(tests.id, assignments.testId))
        .innerJoin(classes, eq(classes.id, assignments.classId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(assignments.createdAt));

      const now = new Date();
      const [students, counts, totals, targeting] = await Promise.all([
        studentCountsByClass(ctx.db, [
          ...new Set(rows.map((r) => r.assignment.classId)),
        ]),
        attemptCountsByAssignment(
          ctx.db,
          rows.map((r) => r.assignment.id),
        ),
        testTotals(ctx.db, [...new Set(rows.map((r) => r.assignment.testId))]),
        targetingInfo(
          ctx.db,
          rows.map((r) => r.assignment),
        ),
      ]);

      const items = rows.map(({ assignment: a, testTitle, className }) => {
        const c = counts.get(a.id) ?? {
          started: 0,
          inProgress: 0,
          submitted: 0,
        };
        const t = totals.get(a.testId) ?? { questionCount: 0, totalPoints: 0 };
        const targeted = targeting.targets.get(a.id);
        return {
          id: a.id,
          title: displayTitle(a, testTitle),
          customTitle: a.title,
          testId: a.testId,
          testTitle,
          classId: a.classId,
          className,
          mode: a.mode,
          status: a.status,
          effectiveStatus: effectiveAssignmentStatus(a, now),
          opensAt: a.opensAt,
          closesAt: a.closesAt,
          timeLimitMinutes: a.timeLimitMinutes,
          hasAccessCode: a.accessCode != null,
          resultsReleased: a.resultsReleased,
          showResults: parseAssignmentSettings(a.settings).showResults,
          questionCount: t.questionCount,
          totalPoints: t.totalPoints,
          createdAt: a.createdAt,
          targetedStudentCount: targeted ? targeted.length : null,
          retakeOf: targeting.retakeOf(a.retakeOfId),
          counts: {
            students: targeted
              ? targeted.length
              : (students.get(a.classId) ?? 0),
            ...c,
          },
        };
      });
      const filtered = input?.status
        ? items.filter((i) => i.effectiveStatus === input.status)
        : items;

      // Open: closing soonest first. Planned: opening soonest first. Closed: most recent first.
      const time = (d: Date | null, fallback: number) =>
        d ? d.getTime() : fallback;
      return filtered.sort((a, b) => {
        const order = { open: 0, planned: 1, closed: 2 } as const;
        if (a.effectiveStatus !== b.effectiveStatus)
          return order[a.effectiveStatus] - order[b.effectiveStatus];
        if (a.effectiveStatus === "open")
          return time(a.closesAt, Infinity) - time(b.closesAt, Infinity);
        if (a.effectiveStatus === "planned")
          return time(a.opensAt, Infinity) - time(b.opensAt, Infinity);
        return (
          time(b.closesAt, b.createdAt.getTime()) -
          time(a.closesAt, a.createdAt.getTime())
        );
      });
    }),

  get: adminProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.id);
      const [[test], [klas], totals, students, counts, targeting, roster] =
        await Promise.all([
          ctx.db
            .select({
              id: tests.id,
              title: tests.title,
              status: tests.status,
              description: tests.description,
            })
            .from(tests)
            .where(eq(tests.id, a.testId)),
          ctx.db
            .select({ id: classes.id, name: classes.name })
            .from(classes)
            .where(eq(classes.id, a.classId)),
          testTotals(ctx.db, [a.testId]),
          studentCountsByClass(ctx.db, [a.classId]),
          attemptCountsByAssignment(ctx.db, [a.id]),
          targetingInfo(ctx.db, [a]),
          rosterForAssignment(ctx.db, a.classId, a.id),
        ]);
      const extraTime = await extraTimeByUser(
        ctx.db,
        roster.map((r) => r.id),
      );
      const t = totals.get(a.testId) ?? { questionCount: 0, totalPoints: 0 };
      const targeted = targeting.targets.get(a.id) ?? null;
      const now = new Date();
      return {
        id: a.id,
        title: a.title?.trim() || test?.title || "Afname",
        customTitle: a.title,
        mode: a.mode,
        status: a.status,
        effectiveStatus: effectiveAssignmentStatus(a, now),
        opensAt: a.opensAt,
        closesAt: a.closesAt,
        timeLimitMinutes: a.timeLimitMinutes,
        accessCode: a.accessCode,
        resultsReleased: a.resultsReleased,
        settings: parseAssignmentSettings(a.settings),
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        test: {
          id: a.testId,
          title: test?.title ?? "",
          status: test?.status ?? "draft",
          description: test?.description ?? "",
          questionCount: t.questionCount,
          totalPoints: t.totalPoints,
        },
        class: { id: a.classId, name: klas?.name ?? "" },
        counts: {
          students: targeted ? targeted.length : (students.get(a.classId) ?? 0),
          ...(counts.get(a.id) ?? { started: 0, inProgress: 0, submitted: 0 }),
        },
        /** Selected students (inhaaltoets/herkansing); null = the whole class. */
        targetedStudentIds: targeted,
        targetedStudentCount: targeted ? targeted.length : null,
        retakeOf: targeting.retakeOf(a.retakeOfId),
        /** Students on the roster with verlengde tijd. */
        accommodationCount: extraTime.size,
        serverTime: now,
      };
    }),

  /** Student members of one class, for the student picker. */
  classStudents: adminProcedure
    .input(z.object({ classId: idSchema }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: user.id,
          name: user.name,
          studentNumber: user.username,
        })
        .from(classMembers)
        .innerJoin(user, eq(user.id, classMembers.userId))
        .where(
          and(
            eq(classMembers.classId, input.classId),
            eq(user.role, ROLES.student),
          ),
        );
      const extraTime = await extraTimeByUser(
        ctx.db,
        rows.map((r) => r.id),
      );
      return rows
        .map((r) => ({ ...r, extraTimePercent: extraTime.get(r.id) ?? 0 }))
        .sort((x, y) => x.name.localeCompare(y.name, "nl"));
    }),

  /** Published tests and active classes for the "Afname plannen" form. */
  formOptions: adminProcedure.query(async ({ ctx }) => {
    const [testRows, classRows] = await Promise.all([
      ctx.db
        .select({
          id: tests.id,
          title: tests.title,
          topic: tests.topic,
          updatedAt: tests.updatedAt,
        })
        .from(tests)
        .where(eq(tests.status, "published"))
        .orderBy(asc(tests.title)),
      ctx.db
        .select({
          id: classes.id,
          name: classes.name,
          schoolYear: classes.schoolYear,
        })
        .from(classes)
        .where(eq(classes.archived, false))
        .orderBy(asc(classes.name)),
    ]);
    const [totals, students] = await Promise.all([
      testTotals(
        ctx.db,
        testRows.map((t) => t.id),
      ),
      studentCountsByClass(
        ctx.db,
        classRows.map((c) => c.id),
      ),
    ]);
    return {
      tests: testRows.map((t) => ({
        ...t,
        ...(totals.get(t.id) ?? { questionCount: 0, totalPoints: 0 }),
      })),
      classes: classRows.map((c) => ({
        ...c,
        studentCount: students.get(c.id) ?? 0,
      })),
    };
  }),

  create: adminProcedure
    .input(
      z
        .object({
          testId: idSchema,
          /** Legacy single class; merged into `classIds`. */
          classId: idSchema.optional(),
          classIds: z
            .array(idSchema)
            .max(20, "Kies hoogstens 20 klassen.")
            .optional(),
          /** Only these students (inhaaltoets/herkansing); one class only. */
          studentIds: z
            .array(z.string().min(1).max(64))
            .max(500, "Kies hoogstens 500 leerlingen.")
            .optional(),
          retakeOfId: idSchema.nullable().optional(),
          /** Several classes: every class gets its own generated code. */
          accessCodePerClass: z.boolean().default(false),
          title: titleSchema,
          mode: modeSchema,
          ...windowFields,
          accessCode: z.string().max(40).nullable().optional(),
          generateAccessCode: z.boolean().optional(),
          settings: settingsPatchSchema.optional(),
          openNow: z.boolean().optional(),
        })
        .superRefine((value, refine) => {
          const ids = new Set([
            ...(value.classIds ?? []),
            ...(value.classId ? [value.classId] : []),
          ]);
          if (ids.size === 0) {
            refine.addIssue({
              code: "custom",
              path: ["classIds"],
              message: "Kies minstens één klas.",
            });
          } else if (ids.size > 20) {
            refine.addIssue({
              code: "custom",
              path: ["classIds"],
              message: "Kies hoogstens 20 klassen.",
            });
          }
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const classIds = [
        ...new Set([
          ...(input.classIds ?? []),
          ...(input.classId ? [input.classId] : []),
        ]),
      ];
      const [test] = await ctx.db
        .select()
        .from(tests)
        .where(eq(tests.id, input.testId));
      if (!test)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze toets bestaat niet.",
        });
      if (test.status !== "published") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Je kunt alleen een gepubliceerde toets inplannen. Publiceer de toets eerst.",
        });
      }
      const totals = await testTotals(ctx.db, [test.id]);
      if (!totals.get(test.id)?.questionCount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Deze toets heeft nog geen vragen.",
        });
      }
      const klassen = await classesOrThrow(ctx.db, classIds);

      let studentIds: string[] | null = null;
      if (input.studentIds?.length) {
        if (klassen.length !== 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Leerlingen kiezen kan alleen als de afname voor één klas is.",
          });
        }
        studentIds = await assertStudentsOfClass(
          ctx.db,
          klassen[0].id,
          input.studentIds,
        );
      }
      if (input.retakeOfId)
        await getAssignmentOrThrow(ctx.db, input.retakeOfId);

      const now = new Date();
      const opensAt = input.openNow ? now : (input.opensAt ?? null);
      const closesAt = input.closesAt ?? null;
      assertWindow(opensAt, closesAt, now);

      const settings = mergeSettings(
        defaultSettingsForMode(input.mode),
        input.settings,
      );
      const sharedCode = resolveAccessCode(
        input,
        defaultAccessCodeForMode(input.mode),
      );
      // A custom code is shared; a generated one can differ per class.
      const isCustom =
        typeof input.accessCode === "string" && input.accessCode.trim() !== "";
      const codeFor = (index: number) =>
        sharedCode &&
        index > 0 &&
        input.accessCodePerClass &&
        !isCustom &&
        klassen.length > 1
          ? generateAccessCode()
          : sharedCode;

      const created = await ctx.db.transaction(async (tx) => {
        const rows = await tx
          .insert(assignments)
          .values(
            klassen.map((klas, index) => ({
              testId: test.id,
              classId: klas.id,
              title: input.title?.trim() || null,
              mode: input.mode,
              status: input.openNow ? ("open" as const) : ("planned" as const),
              opensAt,
              closesAt,
              timeLimitMinutes: input.timeLimitMinutes ?? null,
              accessCode: codeFor(index),
              settings,
              retakeOfId: input.retakeOfId ?? null,
              createdById: ctx.user.id,
            })),
          )
          .returning();
        if (studentIds?.length && rows[0]) {
          await tx.insert(assignmentStudents).values(
            studentIds.map((userId) => ({
              assignmentId: rows[0].id,
              userId,
            })),
          );
        }
        return rows;
      });

      const nameById = new Map(klassen.map((k) => [k.id, k.name]));
      const first = created[0];
      return {
        id: first.id,
        accessCode: first.accessCode,
        effectiveStatus: effectiveAssignmentStatus(first, now),
        items: created.map((row) => ({
          id: row.id,
          classId: row.classId,
          className: nameById.get(row.classId) ?? "",
          accessCode: row.accessCode,
        })),
      };
    }),

  /** Copy an afname (test, title, mode, time limit, settings) to other classes. */
  duplicate: adminProcedure
    .input(
      z.object({
        id: idSchema,
        classIds: z
          .array(idSchema)
          .min(1, "Kies minstens één klas.")
          .max(20, "Kies hoogstens 20 klassen."),
        /** Keep the start and end time; otherwise the copy is planned without a window. */
        keepWindow: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const source = await getAssignmentOrThrow(ctx.db, input.id);
      // Same rules as create: only a published test with questions.
      const [test] = await ctx.db
        .select({ status: tests.status })
        .from(tests)
        .where(eq(tests.id, source.testId));
      if (test?.status !== "published") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Je kunt alleen een gepubliceerde toets inplannen. Publiceer de toets eerst.",
        });
      }
      if (
        !(await testTotals(ctx.db, [source.testId])).get(source.testId)
          ?.questionCount
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Deze toets heeft nog geen vragen.",
        });
      }
      const classIds = [...new Set(input.classIds)];
      const klassen = await classesOrThrow(ctx.db, classIds);
      const now = new Date();
      const opensAt = input.keepWindow ? source.opensAt : null;
      const closesAt = input.keepWindow ? source.closesAt : null;
      assertWindow(opensAt, closesAt, now);
      const settings = parseAssignmentSettings(source.settings);
      const created = await ctx.db
        .insert(assignments)
        .values(
          klassen.map((klas) => ({
            testId: source.testId,
            classId: klas.id,
            title: source.title,
            mode: source.mode,
            status: "planned" as const,
            opensAt,
            closesAt,
            timeLimitMinutes: source.timeLimitMinutes,
            accessCode: source.accessCode ? generateAccessCode() : null,
            settings,
            createdById: ctx.user.id,
          })),
        )
        .returning();
      const nameById = new Map(klassen.map((k) => [k.id, k.name]));
      return {
        items: created.map((row) => ({
          id: row.id,
          classId: row.classId,
          className: nameById.get(row.classId) ?? "",
          accessCode: row.accessCode,
          effectiveStatus: effectiveAssignmentStatus(row, now),
        })),
      };
    }),

  /**
   * Choose the students of an afname: a list (inhaaltoets/herkansing) or
   * null for the whole class. Attempts are never deleted; the result warns
   * when a removed student already has one (they stay in the results).
   */
  setStudents: adminProcedure
    .input(
      z.object({
        id: idSchema,
        userIds: z
          .array(z.string().min(1).max(64))
          .min(1, "Kies minstens één leerling.")
          .max(500, "Kies hoogstens 500 leerlingen.")
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.id);
      const userIds = input.userIds
        ? await assertStudentsOfClass(ctx.db, a.classId, input.userIds)
        : null;
      const before = await rosterForAssignment(ctx.db, a.classId, a.id);
      await ctx.db.transaction(async (tx) => {
        await tx
          .delete(assignmentStudents)
          .where(eq(assignmentStudents.assignmentId, a.id));
        if (userIds?.length) {
          await tx
            .insert(assignmentStudents)
            .values(userIds.map((userId) => ({ assignmentId: a.id, userId })));
        }
      });
      const keep = userIds ? new Set(userIds) : null;
      const removed = keep
        ? before.filter((s) => s.inClass && !keep.has(s.id)).map((s) => s.id)
        : [];
      let removedWithAttempts = 0;
      if (removed.length) {
        const [row] = await ctx.db
          .select({
            count: sql<number>`count(distinct ${attempts.userId})::int`,
          })
          .from(attempts)
          .where(
            and(
              eq(attempts.assignmentId, a.id),
              inArray(attempts.userId, removed),
            ),
          );
        removedWithAttempts = row?.count ?? 0;
      }
      return {
        id: a.id,
        targetedStudentCount: userIds ? userIds.length : null,
        removedWithAttempts,
      };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: idSchema,
        title: titleSchema,
        mode: modeSchema.optional(),
        ...windowFields,
        accessCode: z.string().max(40).nullable().optional(),
        settings: settingsPatchSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.id);
      const patch: Partial<typeof assignments.$inferInsert> = {};
      if (input.title !== undefined) patch.title = input.title?.trim() || null;
      if (input.mode !== undefined) patch.mode = input.mode;
      if (input.opensAt !== undefined) patch.opensAt = input.opensAt;
      if (input.closesAt !== undefined) patch.closesAt = input.closesAt;
      if (input.timeLimitMinutes !== undefined)
        patch.timeLimitMinutes = input.timeLimitMinutes;
      if (input.accessCode !== undefined) {
        patch.accessCode = resolveAccessCode(
          { accessCode: input.accessCode, generateAccessCode: false },
          false,
        );
      }
      if (input.settings) {
        patch.settings = mergeSettings(
          parseAssignmentSettings(a.settings),
          input.settings,
        );
      }
      const opensAt = patch.opensAt !== undefined ? patch.opensAt : a.opensAt;
      const closesAt =
        patch.closesAt !== undefined ? patch.closesAt : a.closesAt;
      if (input.closesAt !== undefined || input.opensAt !== undefined) {
        // Only validate "not in the past" when the end actually changes.
        assertWindow(
          a.status === "planned" ? opensAt : null,
          input.closesAt !== undefined ? closesAt : null,
        );
        if (opensAt && closesAt && closesAt <= opensAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Het einde moet na de start liggen.",
          });
        }
      }
      if (!Object.keys(patch).length)
        return { id: a.id, recomputedDeadlines: 0 };

      const [updated] = await ctx.db
        .update(assignments)
        .set(patch)
        .where(eq(assignments.id, a.id))
        .returning();
      let recomputedDeadlines = 0;
      if (
        input.timeLimitMinutes !== undefined ||
        input.closesAt !== undefined
      ) {
        recomputedDeadlines = await recomputeRunningDeadlines(ctx.db, updated);
      }
      return { id: updated.id, recomputedDeadlines };
    }),

  open: adminProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.id);
      const now = new Date();
      const [updated] = await ctx.db
        .update(assignments)
        .set({
          status: "open",
          opensAt: a.opensAt && a.opensAt <= now ? a.opensAt : now,
          closesAt: a.closesAt && a.closesAt <= now ? null : a.closesAt,
        })
        .where(eq(assignments.id, a.id))
        .returning();
      return {
        id: updated.id,
        effectiveStatus: effectiveAssignmentStatus(updated, now),
      };
    }),

  /**
   * Close an afname. Nobody can start afterwards. Students who are still
   * busy hand in automatically, except students with verlengde tijd: they
   * keep working until their own end time (closing moment + their extra
   * minutes, never later than their time limit allows), unless
   * `respectAccommodations` is false.
   */
  close: adminProcedure
    .input(
      z.object({
        id: idSchema,
        respectAccommodations: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.id);
      const now = new Date();
      const closedAt = a.closesAt && a.closesAt <= now ? a.closesAt : now;
      await ctx.db
        .update(assignments)
        .set({ status: "closed", closesAt: closedAt })
        .where(eq(assignments.id, a.id));

      const stillWorking: string[] = [];
      const submitNow: string[] = [];
      if (input.respectAccommodations) {
        const running = await ctx.db
          .select({
            id: attempts.id,
            startedAt: attempts.startedAt,
            extraMinutes: attempts.extraMinutes,
            accommodationMinutes: attempts.accommodationMinutes,
          })
          .from(attempts)
          .where(
            and(
              eq(attempts.assignmentId, a.id),
              eq(attempts.status, "in_progress"),
              sql`${attempts.accommodationMinutes} > 0`,
            ),
          );
        for (const r of running) {
          const deadlineAt = computeAttemptDeadline(
            { timeLimitMinutes: a.timeLimitMinutes, closesAt: closedAt },
            r.startedAt,
            totalExtraMinutes(r),
          );
          if (!deadlineAt || deadlineAt <= now) {
            submitNow.push(r.id);
            continue;
          }
          const [updated] = await ctx.db
            .update(attempts)
            .set({ deadlineAt })
            .where(
              and(eq(attempts.id, r.id), eq(attempts.status, "in_progress")),
            )
            .returning({ id: attempts.id });
          if (updated) stillWorking.push(updated.id);
        }
      }

      const submitted = await autoSubmitAttempts(
        ctx.db,
        and(
          eq(attempts.assignmentId, a.id),
          input.respectAccommodations
            ? submitNow.length
              ? sql`(${attempts.accommodationMinutes} = 0 or ${inArray(attempts.id, submitNow)})`
              : eq(attempts.accommodationMinutes, 0)
            : undefined,
        ) as SQL,
        "assignment_closed",
      );
      return {
        id: a.id,
        autoSubmitted: submitted.length,
        stillWorking: stillWorking.length,
      };
    }),

  reopen: adminProcedure
    .input(z.object({ id: idSchema, closesAt: z.date().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.id);
      const now = new Date();
      if (input.closesAt) assertWindow(null, input.closesAt, now);
      const closesAt =
        input.closesAt !== undefined
          ? input.closesAt
          : a.closesAt && a.closesAt <= now
            ? null
            : a.closesAt;
      const [updated] = await ctx.db
        .update(assignments)
        .set({
          status: "open",
          closesAt,
          opensAt: a.opensAt && a.opensAt <= now ? a.opensAt : now,
        })
        .where(eq(assignments.id, a.id))
        .returning();
      return {
        id: updated.id,
        effectiveStatus: effectiveAssignmentStatus(updated, now),
      };
    }),

  delete: adminProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.id);
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(attempts)
        .where(eq(attempts.assignmentId, a.id));
      await ctx.db.delete(assignments).where(eq(assignments.id, a.id));
      return { id: a.id, deletedAttempts: count };
    }),

  regenerateAccessCode: adminProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.id);
      const accessCode = generateAccessCode();
      await ctx.db
        .update(assignments)
        .set({ accessCode })
        .where(eq(assignments.id, a.id));
      return { id: a.id, accessCode };
    }),

  setResultsReleased: adminProcedure
    .input(z.object({ id: idSchema, released: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.id);
      await ctx.db
        .update(assignments)
        .set({ resultsReleased: input.released })
        .where(eq(assignments.id, a.id));
      return { id: a.id, released: input.released };
    }),

  /** Live overview for the control room, polled every few seconds. */
  monitor: adminProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.id);
      const now = new Date();

      // Attempts whose deadline passed while the student was away are submitted for them.
      const running = await ctx.db
        .select({ id: attempts.id, deadlineAt: attempts.deadlineAt })
        .from(attempts)
        .where(
          and(
            eq(attempts.assignmentId, a.id),
            eq(attempts.status, "in_progress"),
          ),
        );
      const expired = running
        .filter((r) => isPastDeadline(r.deadlineAt, now))
        .map((r) => r.id);
      if (expired.length) {
        await autoSubmitAttempts(
          ctx.db,
          inArray(attempts.id, expired),
          "deadline_passed",
        );
      }

      const [roster, attemptRows, totals, targeting] = await Promise.all([
        rosterForAssignment(ctx.db, a.classId, a.id),
        ctx.db
          .select({
            id: attempts.id,
            userId: attempts.userId,
            attemptNumber: attempts.attemptNumber,
            status: attempts.status,
            startedAt: attempts.startedAt,
            deadlineAt: attempts.deadlineAt,
            submittedAt: attempts.submittedAt,
            autoSubmitted: attempts.autoSubmitted,
            extraMinutes: attempts.extraMinutes,
            accommodationMinutes: attempts.accommodationMinutes,
            questionOrder: attempts.questionOrder,
            focusLossCount: attempts.focusLossCount,
            lastSeenAt: attempts.lastSeenAt,
            score: attempts.score,
            maxScore: attempts.maxScore,
            gradingStatus: attempts.gradingStatus,
          })
          .from(attempts)
          .where(eq(attempts.assignmentId, a.id)),
        testTotals(ctx.db, [a.testId]),
        targetingInfo(ctx.db, [a]),
      ]);
      const extraTime = await extraTimeByUser(
        ctx.db,
        roster.map((r) => r.id),
      );
      const latest = latestPerUser(attemptRows);
      const attemptCounts = new Map<string, number>();
      for (const r of attemptRows)
        attemptCounts.set(r.userId, (attemptCounts.get(r.userId) ?? 0) + 1);

      const latestIds = [...latest.values()].map((r) => r.id);
      const answered = new Map<string, number>();
      if (latestIds.length) {
        const rows = await ctx.db
          .select({
            attemptId: answers.attemptId,
            count: sql<number>`count(*)::int`,
          })
          .from(answers)
          .where(and(inArray(answers.attemptId, latestIds), answeredCondition))
          .groupBy(answers.attemptId);
        for (const r of rows) answered.set(r.attemptId, r.count);
      }
      const questionCount = totals.get(a.testId)?.questionCount ?? 0;

      const students = roster.map((s) => {
        const at = latest.get(s.id);
        return {
          student: {
            id: s.id,
            name: s.name,
            studentNumber: s.studentNumber,
            inClass: s.inClass,
          },
          /** Verlengde tijd from the student's facilities (0 = none). */
          extraTimePercent: extraTime.get(s.id) ?? 0,
          attemptCount: attemptCounts.get(s.id) ?? 0,
          attempt: at
            ? {
                id: at.id,
                attemptNumber: at.attemptNumber,
                status: at.status,
                startedAt: at.startedAt,
                deadlineAt: at.deadlineAt,
                submittedAt: at.submittedAt,
                autoSubmitted: at.autoSubmitted,
                extraMinutes: at.extraMinutes,
                accommodationMinutes: at.accommodationMinutes,
                answeredCount: answered.get(at.id) ?? 0,
                totalQuestions: at.questionOrder.length || questionCount,
                focusLossCount: at.focusLossCount,
                lastSeenAt: at.lastSeenAt,
                score: at.score,
                maxScore: at.maxScore,
                gradingStatus: at.gradingStatus,
              }
            : null,
        };
      });

      const summary = {
        students: students.length,
        notStarted: students.filter((s) => !s.attempt).length,
        inProgress: students.filter((s) => s.attempt?.status === "in_progress")
          .length,
        submitted: students.filter((s) => s.attempt?.status === "submitted")
          .length,
        focusWarnings: students.filter(
          (s) => (s.attempt?.focusLossCount ?? 0) > 0,
        ).length,
        withAccommodation: students.filter(
          (s) =>
            s.extraTimePercent > 0 ||
            (s.attempt?.accommodationMinutes ?? 0) > 0,
        ).length,
        inProgressWithAccommodation: students.filter(
          (s) =>
            s.attempt?.status === "in_progress" &&
            s.attempt.accommodationMinutes > 0,
        ).length,
      };
      const targeted = targeting.targets.get(a.id) ?? null;

      return {
        assignment: {
          id: a.id,
          status: a.status,
          effectiveStatus: effectiveAssignmentStatus(a, now),
          timeLimitMinutes: a.timeLimitMinutes,
          closesAt: a.closesAt,
          questionCount,
          targetedStudentCount: targeted ? targeted.length : null,
          retakeOf: targeting.retakeOf(a.retakeOfId),
        },
        students,
        summary,
        serverTime: now,
      };
    }),

  extendTime: adminProcedure
    .input(
      z.object({
        attemptId: idSchema,
        minutes: z
          .number()
          .int()
          .min(1, "Minstens 1 minuut.")
          .max(600, "Hoogstens 600 minuten."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { attempt, assignment } = await getAttemptWithAssignmentOrThrow(
        ctx.db,
        input.attemptId,
      );
      if (attempt.status !== "in_progress") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Deze poging is al ingeleverd. Heropen de poging om de leerling verder te laten werken.",
        });
      }
      const extraMinutes = attempt.extraMinutes + input.minutes;
      const computed = computeAttemptDeadline(
        assignment,
        attempt.startedAt,
        extraMinutes + attempt.accommodationMinutes,
      );
      // A reopened attempt can have a custom deadline; extend from that one when it is later.
      const fromCurrent = attempt.deadlineAt
        ? new Date(attempt.deadlineAt.getTime() + input.minutes * 60_000)
        : null;
      const deadlineAt =
        computed && fromCurrent
          ? new Date(Math.max(computed.getTime(), fromCurrent.getTime()))
          : (computed ?? fromCurrent);
      if (!deadlineAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Deze afname heeft geen tijdslimiet; verlengen is niet nodig.",
        });
      }
      await ctx.db
        .update(attempts)
        .set({ extraMinutes, deadlineAt })
        .where(eq(attempts.id, attempt.id));
      await ctx.db.insert(attemptEvents).values({
        attemptId: attempt.id,
        type: "time_extended",
        details: {
          minutes: input.minutes,
          totalExtraMinutes: extraMinutes,
          by: ctx.user.name,
        },
      });
      return { attemptId: attempt.id, extraMinutes, deadlineAt };
    }),

  reopenAttempt: adminProcedure
    .input(
      z.object({
        attemptId: idSchema,
        minutes: z.number().int().min(1).max(600).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { attempt, assignment } = await getAttemptWithAssignmentOrThrow(
        ctx.db,
        input.attemptId,
      );
      if (attempt.status === "in_progress") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Deze poging is nog bezig.",
        });
      }
      const [newer] = await ctx.db
        .select({ id: attempts.id })
        .from(attempts)
        .where(
          and(
            eq(attempts.assignmentId, attempt.assignmentId),
            eq(attempts.userId, attempt.userId),
            sql`${attempts.attemptNumber} > ${attempt.attemptNumber}`,
          ),
        )
        .limit(1);
      if (newer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "De leerling heeft al een nieuwere poging. Alleen de laatste poging kan worden heropend.",
        });
      }
      const now = new Date();
      let deadlineAt: Date | null;
      if (input.minutes) {
        deadlineAt = new Date(now.getTime() + input.minutes * 60_000);
      } else {
        const futureClose =
          assignment.closesAt && assignment.closesAt > now
            ? assignment.closesAt
            : null;
        deadlineAt = computeAttemptDeadline(
          {
            timeLimitMinutes: assignment.timeLimitMinutes,
            closesAt: futureClose,
          },
          now,
          totalExtraMinutes(attempt),
        );
        // The afname is closed and has no time limit: don't leave it open-ended.
        if (
          !deadlineAt &&
          effectiveAssignmentStatus(assignment, now) === "closed"
        ) {
          deadlineAt = new Date(now.getTime() + 15 * 60_000);
        }
      }
      await ctx.db
        .update(attempts)
        .set({
          status: "in_progress",
          submittedAt: null,
          autoSubmitted: false,
          deadlineAt,
          gradingStatus: "pending",
        })
        .where(eq(attempts.id, attempt.id));
      await ctx.db.insert(attemptEvents).values({
        attemptId: attempt.id,
        type: "reopened",
        details: {
          minutes: input.minutes ?? null,
          deadlineAt: deadlineAt?.toISOString() ?? null,
          by: ctx.user.name,
        },
      });
      return {
        attemptId: attempt.id,
        deadlineAt,
        assignmentClosed:
          effectiveAssignmentStatus(assignment, now) === "closed",
      };
    }),

  resetAttempt: adminProcedure
    .input(z.object({ attemptId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const { attempt } = await getAttemptWithAssignmentOrThrow(
        ctx.db,
        input.attemptId,
      );
      await ctx.db.delete(attempts).where(eq(attempts.id, attempt.id));
      return { attemptId: attempt.id, userId: attempt.userId };
    }),
});
