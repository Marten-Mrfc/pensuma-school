/**
 * Student portal: everything a student (leerling) does.
 *
 * Every procedure checks that the student is a member of the assignment's
 * class (and is targeted by it) and, for attempts, that the attempt belongs
 * to them. Nothing a student may not see (correct options, solutions,
 * hidden tests, model answers, the access code) ever leaves this router.
 *
 * After a teacher closes an afname, attempts with a personal deadline in
 * the future (verlengde tijd) keep working: saving, logging, heartbeats and
 * submitting follow the attempt's status and deadline, not the afname.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { accommodationMinutes } from "@/lib/accommodations";
import { hintPenaltyFraction } from "@/lib/grading/hint-penalty";
import {
  countFocusLosses,
  isEventAllowed,
  MONITORING_EVENT_TYPES,
  sanitizeEventDetails,
} from "@/lib/privacy/event-details";
import {
  type AnswerResponse,
  answerResponseSchema,
  type CodeGradingResult,
  codeGradingResultSchema,
  codeResponseSchema,
  multipleChoiceResponseSchema,
  openResponseSchema,
  type QuestionDataByType,
  type QuestionType,
  questionDataForStudent,
  redactCodeResultForStudent,
  type ShowResults,
} from "@/lib/questions/schema";
import { createTRPCRouter, studentProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
  answers,
  assignments,
  attemptEvents,
  attempts,
  classes,
  classMembers,
  questionNeutralizations,
  questions,
  tests,
} from "@/server/db/schema";
import { logServerError } from "@/server/privacy/error-log";
import {
  ACCESS_CODE_FAILURE_DELAY_MS,
  ACCESS_CODE_LOCKED_MESSAGE,
  ACCESS_CODE_WRONG_MESSAGE,
  accessCodeKey,
  accessCodesMatch,
  clearAccessCodeFailures,
  isAccessCodeLocked,
  recordAccessCodeFailure,
} from "@/server/services/access-code-guard";
import {
  DEADLINE_GRACE_MS,
  dutchGrade,
  effectiveAssignmentStatus,
  parseAssignmentSettings,
  resultsVisible,
} from "@/server/services/assignment-status";
import {
  assignmentVisibleToStudent,
  ensureTargetingBackfill,
  stillWorking,
  stillWorkingByAssignment,
} from "@/server/services/assignment-targets";
import {
  attemptDisplayNumberOf,
  attemptDisplayNumberSql,
} from "@/server/services/attempt-number";
import {
  AttemptStartError,
  autoSubmitIfExpired,
  createOrResumeAttempt,
  findResumableAttempt,
  isAttemptExpired,
  logServerEvent,
  optionOrderFor,
  scheduleGrading,
  submitAttempt,
} from "@/server/services/attempts";
import { auditFromCtx } from "@/server/services/audit";
import {
  effectiveScore,
  isBlankResponse,
  isGradingInFlight,
} from "@/server/services/grading";
import {
  loadAccommodation,
  loadAssignmentForStudent,
  loadOwnedAttempt,
  notFound,
  studentSettings,
  typedData,
} from "@/server/services/student-access";

/* --------------------------------- Helpers -------------------------------- */

/** Ids from URLs: a friendly message instead of zod's "Invalid UUID". */
const idSchema = z.uuid({ error: "Deze link klopt niet." });

type AssignmentRow = typeof assignments.$inferSelect;
type AttemptRow = typeof attempts.$inferSelect;
type QuestionRow = typeof questions.$inferSelect;

/**
 * Flat event details from the browser: at most 10 keys, short strings,
 * numbers, booleans or null. Nested objects are rejected (BAD_REQUEST).
 */
const eventDetailsSchema = z
  .record(
    z.string().max(40),
    z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
  )
  .refine((details) => Object.keys(details).length <= 10, {
    error: "Te veel details bij een gebeurtenis.",
  });

/** Shown instead of the grader's own message when grading broke down. */
const INTERNAL_ERROR_MESSAGE =
  "Er ging iets mis bij het nakijken. Je docent kijkt deze vraag na.";
const ANSWERS_HIDDEN_MESSAGE =
  "De juiste antwoorden zie je pas als je geen pogingen meer hebt of de toets gesloten is.";
/** Classmates (e.g. with verlengde tijd) are still taking the exam. */
const ANSWERS_HIDDEN_OTHERS_MESSAGE =
  "De juiste antwoorden zie je zodra iedereen klaar is met de toets.";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Count and total points of the questions per test. */
async function testStats(testIds: string[]) {
  const map = new Map<
    string,
    {
      questionCount: number;
      totalPoints: number;
      types: Record<QuestionType, number>;
      /** Code questions that have at least one hint. */
      hintQuestions: number;
    }
  >();
  if (testIds.length === 0) return map;
  const rows = await db
    .select({
      testId: questions.testId,
      type: questions.type,
      count: sql<number>`count(*)::int`,
      points: sql<number>`coalesce(sum(${questions.points}), 0)::float8`,
      withHints: sql<number>`count(*) filter (where jsonb_typeof(${questions.data}->'hints') = 'array' and jsonb_array_length(${questions.data}->'hints') > 0)::int`,
    })
    .from(questions)
    .where(inArray(questions.testId, testIds))
    .groupBy(questions.testId, questions.type);
  for (const r of rows) {
    const entry = map.get(r.testId) ?? {
      questionCount: 0,
      totalPoints: 0,
      types: { code: 0, multiple_choice: 0, open: 0 },
      hintQuestions: 0,
    };
    entry.questionCount += Number(r.count);
    if (r.type === "code") entry.hintQuestions += Number(r.withHints);
    entry.totalPoints += Number(r.points);
    entry.types[r.type] += Number(r.count);
    map.set(r.testId, entry);
  }
  return map;
}

/** Auto-submit an expired attempt and return its fresh row. */
async function refreshIfExpired(
  attempt: AttemptRow,
  assignment: Pick<AssignmentRow, "status" | "opensAt" | "closesAt">,
): Promise<AttemptRow> {
  if (!(await autoSubmitIfExpired(attempt, assignment))) return attempt;
  const [fresh] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, attempt.id));
  return fresh ?? attempt;
}

function assignmentTitle(a: Pick<AssignmentRow, "title">, testTitle: string) {
  return a.title?.trim() || testTitle;
}

function hiddenResultMessage(
  showResults: ShowResults,
  closesAt: Date | null,
  closedButOthersWorking = false,
): string {
  switch (showResults) {
    case "after_close":
      if (closedButOthersWorking)
        return "Je ziet je resultaat zodra iedereen klaar is met de toets.";
      return closesAt
        ? "Je ziet je resultaat zodra de toets gesloten is."
        : "Je ziet je resultaat zodra je docent de toets sluit.";
    case "manual":
      return "Je docent kijkt je toets na. Je ziet je resultaat zodra je docent het vrijgeeft.";
    case "never":
      return "Bij deze toets wordt je resultaat niet online getoond. Je docent bespreekt het met je.";
    default:
      return "Je resultaat is nog niet beschikbaar.";
  }
}

/** Validate a response against its question type; returns the clean response. */
function validateResponse(
  type: QuestionType,
  data: QuestionDataByType[QuestionType],
  response: unknown,
): AnswerResponse {
  const bad = (message = "Dit antwoord past niet bij deze vraag.") =>
    new TRPCError({ code: "BAD_REQUEST", message });
  switch (type) {
    case "code": {
      const parsed = codeResponseSchema.safeParse(response);
      if (!parsed.success) throw bad();
      return parsed.data;
    }
    case "multiple_choice": {
      const parsed = multipleChoiceResponseSchema.safeParse(response);
      if (!parsed.success) throw bad();
      const mc = data as QuestionDataByType["multiple_choice"];
      const valid = new Set(mc.options.map((o) => o.id));
      const selected = [
        ...new Set(parsed.data.selected.filter((id) => valid.has(id))),
      ];
      if (!mc.multiple && selected.length > 1)
        throw bad("Kies maar één antwoord.");
      return { selected };
    }
    case "open": {
      const parsed = openResponseSchema.safeParse(response);
      if (!parsed.success) throw bad();
      const open = data as QuestionDataByType["open"];
      if (open.maxLength && parsed.data.text.length > open.maxLength) {
        throw bad(
          `Je antwoord is te lang (maximaal ${open.maxLength} tekens).`,
        );
      }
      return parsed.data;
    }
  }
}

/**
 * A code grading result as the student sees it: a grader breakdown gets a
 * friendly message (no traceback), and while the right answers are hidden
 * the expected output of the visible tests is left out.
 */
function studentCodeResult(
  result: CodeGradingResult,
  answersHidden: boolean,
): CodeGradingResult {
  const error =
    result.status === "internal_error" && result.error
      ? { ...result.error, message: INTERNAL_ERROR_MESSAGE, traceback: "" }
      : result.error;
  return {
    ...result,
    error,
    tests: answersHidden
      ? result.tests.map(({ expected: _e, feedback: _f, ...t }) => t)
      : result.tests,
  };
}

/**
 * For `saveAnswer`'s upsert: keep a column's value unless the stored
 * response differs from the new one (jsonb compares by value).
 */
function keepUnlessChanged(column: AnyPgColumn) {
  return sql`case when ${answers.response} is distinct from excluded.response then null else ${column} end`;
}

/** An auto hand-in this long before the deadline is too early (extra time). */
const AUTO_SUBMIT_EARLY_MS = 10_000;

/* --------------------------------- Router --------------------------------- */

export const portalRouter = createTRPCRouter({
  /**
   * Open, upcoming and finished assignments of the student's classes
   * (targeted afnames only when the student is one of the targets).
   */
  dashboard: studentProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const now = new Date();
    // Older targeted afnames get their flag (once per process).
    await ensureTargetingBackfill(db);

    const rows = await db
      .select({
        assignment: assignments,
        testTitle: tests.title,
        className: classes.name,
      })
      .from(classMembers)
      .innerJoin(assignments, eq(assignments.classId, classMembers.classId))
      .innerJoin(tests, eq(tests.id, assignments.testId))
      .innerJoin(classes, eq(classes.id, assignments.classId))
      .where(
        and(
          eq(classMembers.userId, userId),
          assignmentVisibleToStudent(userId),
        ),
      );

    const visibleRows = rows
      .map((r) => ({
        ...r,
        status: effectiveAssignmentStatus(r.assignment, now),
      }))
      .filter((r) => !(r.status === "planned" && !r.assignment.opensAt));

    const assignmentIds = visibleRows.map((r) => r.assignment.id);
    let myAttempts = assignmentIds.length
      ? await db
          .select()
          .from(attempts)
          .where(
            and(
              eq(attempts.userId, userId),
              inArray(attempts.assignmentId, assignmentIds),
            ),
          )
          .orderBy(asc(attempts.attemptNumber))
      : [];

    // Expired attempts are submitted on sight.
    const assignmentById = new Map(
      visibleRows.map((r) => [r.assignment.id, r.assignment]),
    );
    const expired = (a: AttemptRow) => {
      const asg = assignmentById.get(a.assignmentId);
      return asg ? isAttemptExpired(a, asg, now) : false;
    };
    if (myAttempts.some(expired)) {
      myAttempts = await Promise.all(
        myAttempts.map((a) => {
          const asg = assignmentById.get(a.assignmentId);
          return asg ? refreshIfExpired(a, asg) : a;
        }),
      );
    }

    const stats = await testStats([
      ...new Set(visibleRows.map((r) => r.assignment.testId)),
    ]);
    // Closed afnames with a hand-in of mine: are classmates still busy?
    const working = await stillWorkingByAssignment(
      db,
      visibleRows
        .filter(
          (r) =>
            r.status === "closed" &&
            myAttempts.some(
              (t) => t.assignmentId === r.assignment.id && t.submittedAt,
            ),
        )
        .map((r) => r.assignment),
      now,
    );

    const items = visibleRows.map(
      ({ assignment: a, testTitle, className, status }) => {
        const settings = parseAssignmentSettings(a.settings);
        const mine = myAttempts.filter((t) => t.assignmentId === a.id);
        const inProgress = mine.find((t) => t.status === "in_progress") ?? null;
        const submitted = mine
          .filter((t) => t.status === "submitted")
          .sort(
            (x, y) =>
              (y.submittedAt?.getTime() ?? 0) - (x.submittedAt?.getTime() ?? 0),
          );
        const last = submitted[0] ?? null;
        const visible = resultsVisible(a, now, working.get(a.id) ?? false);
        const s = stats.get(a.testId);
        return {
          id: a.id,
          title: assignmentTitle(a, testTitle),
          className,
          mode: a.mode,
          status,
          opensAt: a.opensAt,
          closesAt: a.closesAt,
          timeLimitMinutes: a.timeLimitMinutes,
          questionCount: s?.questionCount ?? 0,
          totalPoints: s?.totalPoints ?? 0,
          needsAccessCode: !!a.accessCode,
          maxAttempts: settings.maxAttempts,
          attemptsUsed: mine.length,
          canStart:
            status === "open" &&
            !inProgress &&
            mine.length < settings.maxAttempts,
          inProgress: inProgress
            ? { attemptId: inProgress.id, deadlineAt: inProgress.deadlineAt }
            : null,
          lastAttempt: last
            ? {
                attemptId: last.id,
                // "Poging X" counts the attempts that still exist.
                attemptNumber: mine.filter(
                  (t) => t.attemptNumber <= last.attemptNumber,
                ).length,
                submittedAt: last.submittedAt,
                resultsVisible: visible,
                gradingStatus: visible ? last.gradingStatus : null,
                score: visible ? last.score : null,
                maxScore: visible ? last.maxScore : null,
                grade:
                  visible &&
                  last.gradingStatus !== "pending" &&
                  last.score != null &&
                  last.maxScore
                    ? dutchGrade(last.score, last.maxScore, a.settings)
                    : null,
              }
            : null,
        };
      },
    );

    type Item = (typeof items)[number];
    const open: Item[] = [];
    const upcoming: Item[] = [];
    const finished: Item[] = [];
    for (const item of items) {
      if (item.status === "planned") upcoming.push(item);
      // A running attempt stays open after the afname closed (verlengde tijd).
      else if (item.inProgress || (item.status === "open" && item.canStart))
        open.push(item);
      else if (
        item.status === "open" ||
        item.attemptsUsed > 0 ||
        item.mode === "exam"
      ) {
        finished.push(item);
      }
    }
    const time = (d: Date | null | undefined, fallback: number) =>
      d?.getTime() ?? fallback;
    open.sort(
      (a, b) =>
        Number(!!b.inProgress) - Number(!!a.inProgress) ||
        time(a.closesAt, Number.MAX_SAFE_INTEGER) -
          time(b.closesAt, Number.MAX_SAFE_INTEGER),
    );
    upcoming.sort((a, b) => time(a.opensAt, 0) - time(b.opensAt, 0));
    finished.sort(
      (a, b) =>
        time(b.lastAttempt?.submittedAt ?? b.closesAt, 0) -
        time(a.lastAttempt?.submittedAt ?? a.closesAt, 0),
    );

    return { open, upcoming, finished: finished.slice(0, 30), serverNow: now };
  }),

  /** Everything the start screen needs. */
  getAssignment: studentProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ ctx, input }) => {
      const {
        assignment: a,
        testTitle,
        testDescription,
        className,
        status,
      } = await loadAssignmentForStudent(ctx.user.id, input.id);
      const accommodation = await loadAccommodation(ctx.user.id);
      const settings = studentSettings(a, accommodation);
      const stats = (await testStats([a.testId])).get(a.testId);
      const now = new Date();
      const extraTimePercent = accommodation?.extraTimePercent ?? 0;

      const inProgress = await findResumableAttempt(a, ctx.user.id);
      const mine = await db
        .select({
          id: attempts.id,
          status: attempts.status,
          submittedAt: attempts.submittedAt,
          attemptNumber: attempts.attemptNumber,
        })
        .from(attempts)
        .where(
          and(
            eq(attempts.assignmentId, a.id),
            eq(attempts.userId, ctx.user.id),
          ),
        )
        .orderBy(desc(attempts.attemptNumber));
      const lastSubmitted = mine.find((t) => t.status === "submitted") ?? null;

      return {
        id: a.id,
        title: assignmentTitle(a, testTitle),
        description: testDescription,
        className,
        mode: a.mode,
        status,
        opensAt: a.opensAt,
        closesAt: a.closesAt,
        timeLimitMinutes: a.timeLimitMinutes,
        questionCount: stats?.questionCount ?? 0,
        totalPoints: stats?.totalPoints ?? 0,
        questionTypes: stats?.types ?? { code: 0, multiple_choice: 0, open: 0 },
        needsAccessCode: !!a.accessCode,
        settings,
        attemptsUsed: mine.length,
        maxAttempts: settings.maxAttempts,
        canStart:
          status === "open" &&
          !inProgress &&
          mine.length < settings.maxAttempts,
        inProgressAttemptId: inProgress?.id ?? null,
        inProgressDeadlineAt: inProgress?.deadlineAt ?? null,
        lastSubmittedAttemptId: lastSubmitted?.id ?? null,
        /** Verlengde tijd of this student (0 = none). */
        extraTimePercent,
        /** Time limit including verlengde tijd; null without a limit. */
        personalTimeMinutes:
          a.timeLimitMinutes != null
            ? a.timeLimitMinutes +
              accommodationMinutes(a, now, extraTimePercent)
            : null,
        /** Whether hints can be revealed in this test (allowHints and hints). */
        hasHints: settings.allowHints && (stats?.hintQuestions ?? 0) > 0,
        serverNow: now,
      };
    }),

  /** Start (or resume) an attempt. */
  startAttempt: studentProcedure
    .input(
      z.object({
        assignmentId: idSchema,
        accessCode: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { assignment: a, status } = await loadAssignmentForStudent(
        ctx.user.id,
        input.assignmentId,
      );

      // Continuing never needs the access code again.
      const resumable = await findResumableAttempt(a, ctx.user.id);
      if (resumable) {
        await logServerEvent(resumable.id, "resumed");
        return { attemptId: resumable.id, resumed: true };
      }

      if (status !== "open") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            status === "planned"
              ? "Deze toets is nog niet geopend."
              : "Deze toets is gesloten.",
        });
      }
      if (a.accessCode) {
        const key = accessCodeKey(ctx.user.id, a.id);
        // Locked after 5 wrong codes, even when this one is right.
        if (isAccessCodeLocked(key)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: ACCESS_CODE_LOCKED_MESSAGE,
          });
        }
        if (!accessCodesMatch(input.accessCode ?? "", a.accessCode)) {
          const failure = recordAccessCodeFailure(key);
          if (failure.shouldAudit) {
            await auditFromCtx(ctx, {
              action: "security.access_code_failed",
              subjectType: "assignment",
              subjectId: a.id,
              subjectUserId: ctx.user.id,
              subjectLabel: ctx.user.username ?? null,
              details: { assignmentId: a.id },
            }).catch((error: unknown) => {
              logServerError("portal.access_code_audit_failed", error, {
                assignmentId: a.id,
              });
            });
          }
          // Small delay makes guessing codes unattractive.
          await new Promise((r) => setTimeout(r, ACCESS_CODE_FAILURE_DELAY_MS));
          throw new TRPCError(
            failure.locked
              ? {
                  code: "TOO_MANY_REQUESTS",
                  message: ACCESS_CODE_LOCKED_MESSAGE,
                }
              : { code: "BAD_REQUEST", message: ACCESS_CODE_WRONG_MESSAGE },
          );
        }
        clearAccessCodeFailures(key);
      }

      try {
        return await createOrResumeAttempt(a, ctx.user.id);
      } catch (err) {
        if (err instanceof AttemptStartError) {
          throw new TRPCError({
            code:
              err.reason === "cooldown"
                ? "TOO_MANY_REQUESTS"
                : "PRECONDITION_FAILED",
            message: err.message,
          });
        }
        throw err;
      }
    }),

  /** The exam page: attempt state, questions (student-safe) and saved answers. */
  getAttempt: studentProcedure
    .input(z.object({ attemptId: idSchema }))
    .query(async ({ ctx, input }) => {
      const row = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      const attempt = await refreshIfExpired(row.attempt, row.assignment);
      const a = row.assignment;
      const accommodation = await loadAccommodation(ctx.user.id);

      // Exam confidentiality: a handed-in exam shows no questions or
      // answers until its results are visible (for "after_close": also
      // not while classmates with verlengde tijd are still busy).
      const now = new Date();
      const contentHidden =
        attempt.status === "submitted" &&
        a.mode === "exam" &&
        !resultsVisible(a, now, await stillWorking(db, a, now));

      const order = contentHidden ? [] : (attempt.questionOrder ?? []);
      const qRows = order.length
        ? await db.select().from(questions).where(inArray(questions.id, order))
        : [];
      const byId = new Map(qRows.map((q) => [q.id, q]));
      const aRows = contentHidden
        ? []
        : await db
            .select({
              questionId: answers.questionId,
              response: answers.response,
              status: answers.status,
              savedAt: answers.savedAt,
            })
            .from(answers)
            .where(eq(answers.attemptId, attempt.id));

      const list = order
        .map((id) => byId.get(id))
        .filter((q): q is QuestionRow => !!q)
        .map((q, index) => {
          const typed = typedData(q);
          let data = questionDataForStudent(typed);
          if (typed.type === "multiple_choice") {
            const options = data.options as { id: string; text: string }[];
            data = {
              ...data,
              options: optionOrderFor(
                attempt.id,
                q.id,
                options,
                typed.data.shuffle,
              ),
            };
          }
          return {
            id: q.id,
            position: index + 1,
            type: q.type,
            title: q.title,
            prompt: q.prompt,
            points: q.points,
            data,
          };
        });

      return {
        attempt: {
          id: attempt.id,
          assignmentId: attempt.assignmentId,
          /** "Poging X" (see attempt-number.ts). */
          attemptNumber: await attemptDisplayNumberOf(db, attempt),
          status: attempt.status,
          startedAt: attempt.startedAt,
          deadlineAt: attempt.deadlineAt,
          submittedAt: attempt.submittedAt,
          autoSubmitted: attempt.autoSubmitted,
          /** Minutes of verlengde tijd included in deadlineAt. */
          accommodationMinutes: attempt.accommodationMinutes,
        },
        serverNow: new Date(),
        graceMs: DEADLINE_GRACE_MS,
        assignment: {
          id: a.id,
          title: assignmentTitle(a, row.testTitle),
          mode: a.mode,
          settings: studentSettings(a, accommodation),
        },
        /** True for a handed-in exam whose results are not visible yet. */
        contentHidden,
        questions: list,
        answers: aRows,
      };
    }),

  /** Autosave one answer. */
  saveAnswer: studentProcedure
    .input(
      z.object({
        attemptId: idSchema,
        questionId: idSchema,
        response: answerResponseSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      const { attempt } = row;
      const now = new Date();
      if (attempt.status !== "in_progress") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Deze poging is al ingeleverd. Je kunt niets meer wijzigen.",
        });
      }
      if (isAttemptExpired(attempt, row.assignment, now)) {
        await autoSubmitIfExpired(attempt, row.assignment, now);
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: attempt.deadlineAt
            ? "De tijd is om. Je antwoord kon niet meer worden opgeslagen."
            : "Deze toets is gesloten. Je antwoord kon niet meer worden opgeslagen.",
        });
      }
      if (!attempt.questionOrder.includes(input.questionId)) {
        throw notFound("Deze vraag hoort niet bij deze toets.");
      }
      const [q] = await db
        .select()
        .from(questions)
        .where(eq(questions.id, input.questionId))
        .limit(1);
      // The teacher deleted this question during the attempt: not an error
      // (the attempt goes on), the page drops the question.
      if (!q) return { savedAt: now, status: "removed" as const };

      const typed = typedData(q);
      const response = validateResponse(typed.type, typed.data, input.response);
      const starter = typed.type === "code" ? typed.data.starterCode : "";
      const status = isBlankResponse(typed.type, response, starter)
        ? "empty"
        : "saved";

      await db
        .insert(answers)
        .values({
          attemptId: attempt.id,
          questionId: q.id,
          response,
          status,
          savedAt: now,
          maxScore: q.points,
        })
        .onConflictDoUpdate({
          target: [answers.attemptId, answers.questionId],
          set: {
            response,
            status,
            savedAt: now,
            // A reopened attempt: an answer the teacher already reviewed
            // and that the student now changes loses its manual score,
            // criteria and feedback, so it is graded and reviewed again.
            // Saving the same answer again (autosave) keeps the review.
            manualScore: keepUnlessChanged(answers.manualScore),
            rubricChecked: keepUnlessChanged(answers.rubricChecked),
            feedback: keepUnlessChanged(answers.feedback),
            reviewedAt: keepUnlessChanged(answers.reviewedAt),
            reviewedById: keepUnlessChanged(answers.reviewedById),
          },
        });
      await db
        .update(attempts)
        .set({ lastSeenAt: now })
        .where(eq(attempts.id, attempt.id));
      return { savedAt: now, status };
    }),

  /**
   * Batched activity log (focus, fullscreen, paste, runs). Data
   * minimisation: only events the afname's settings ask for are stored
   * (effective settings, so a student with ignoreFocusEvents logs no focus
   * events), and only allowlisted details. A paste event carries only
   * { questionId, length, blocked }: never the pasted text.
   */
  logEvents: studentProcedure
    .input(
      z.object({
        attemptId: idSchema,
        events: z
          .array(
            z.object({
              type: z.enum(MONITORING_EVENT_TYPES),
              at: z.coerce.date().optional(),
              details: eventDetailsSchema.optional(),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      const { attempt } = row;
      if (attempt.status !== "in_progress") {
        return { logged: 0, dropped: input.events.length };
      }
      const accommodation = await loadAccommodation(ctx.user.id);
      const settings = studentSettings(row.assignment, accommodation);
      const allowed = input.events.filter((e) =>
        isEventAllowed(e.type, settings),
      );
      const now = new Date();
      const earliest = attempt.startedAt.getTime() - 60_000;
      const values = allowed.map((e) => {
        const at =
          e.at && !Number.isNaN(e.at.getTime())
            ? e.at.getTime()
            : now.getTime();
        const clamped = Math.min(Math.max(at, earliest), now.getTime());
        return {
          attemptId: attempt.id,
          type: e.type,
          details: sanitizeEventDetails(e.type, e.details),
          createdAt: new Date(clamped),
        };
      });
      if (values.length) await db.insert(attemptEvents).values(values);
      // With "vensterwissels niet registreren" a fullscreen exit is still
      // logged (when the toets requires fullscreen) but never counted.
      const losses = countFocusLosses(
        values.map((v) => v.type),
        settings,
      );
      await db
        .update(attempts)
        .set({
          lastSeenAt: now,
          ...(losses
            ? { focusLossCount: sql`${attempts.focusLossCount} + ${losses}` }
            : {}),
        })
        .where(eq(attempts.id, attempt.id));
      return {
        logged: values.length,
        dropped: input.events.length - values.length,
      };
    }),

  /** Cheap keep-alive: updates "last activity" and returns server time + deadline. */
  heartbeat: studentProcedure
    .input(z.object({ attemptId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      const attempt = await refreshIfExpired(row.attempt, row.assignment);
      const now = new Date();
      if (attempt.status === "in_progress") {
        await db
          .update(attempts)
          .set({ lastSeenAt: now })
          .where(eq(attempts.id, attempt.id));
      }
      return {
        serverNow: now,
        status: attempt.status,
        deadlineAt: attempt.deadlineAt,
      };
    }),

  /** Hand in. Grading runs after the response has been sent. */
  submitAttempt: studentProcedure
    .input(
      z.object({
        attemptId: idSchema,
        /** Sent by the exam page when the countdown reached zero. */
        auto: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { attempt } = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      if (attempt.status === "submitted") {
        return {
          submittedAt: attempt.submittedAt,
          alreadySubmitted: true,
          notYet: false as const,
        };
      }
      const now = new Date();
      // The page's timer ran out, but the teacher gave extra time that the
      // page has not heard about yet: don't hand in, send the new deadline.
      if (
        input.auto &&
        attempt.deadlineAt &&
        attempt.deadlineAt.getTime() - now.getTime() > AUTO_SUBMIT_EARLY_MS
      ) {
        return {
          submittedAt: null,
          alreadySubmitted: false,
          notYet: true as const,
          deadlineAt: attempt.deadlineAt,
          serverNow: now,
        };
      }
      // Only believe "time is up" when the deadline is (nearly) there.
      const timeUp =
        !!input.auto &&
        !!attempt.deadlineAt &&
        now.getTime() >= attempt.deadlineAt.getTime() - AUTO_SUBMIT_EARLY_MS;
      await submitAttempt(attempt.id, {
        auto: timeUp,
        by: timeUp ? "timer" : "student",
      });
      const [fresh] = await db
        .select({ submittedAt: attempts.submittedAt })
        .from(attempts)
        .where(eq(attempts.id, attempt.id));
      return {
        submittedAt: fresh?.submittedAt ?? now,
        alreadySubmitted: false,
        notYet: false as const,
      };
    }),

  /** Result of one attempt (only what the student may see). */
  getResult: studentProcedure
    .input(z.object({ attemptId: idSchema }))
    .query(async ({ ctx, input }) => {
      const row = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      const attempt = await refreshIfExpired(row.attempt, row.assignment);
      const a = row.assignment;
      const settings = parseAssignmentSettings(a.settings);
      const now = new Date();
      const status = effectiveAssignmentStatus(a, now);

      const mine = await db
        .select({
          status: attempts.status,
          attemptNumber: attempts.attemptNumber,
        })
        .from(attempts)
        .where(
          and(
            eq(attempts.assignmentId, a.id),
            eq(attempts.userId, ctx.user.id),
          ),
        );
      const attemptsUsed = mine.length;
      const hasRunningAttempt = mine.some((t) => t.status === "in_progress");
      const base = {
        attemptId: attempt.id,
        assignmentId: a.id,
        title: assignmentTitle(a, row.testTitle),
        mode: a.mode,
        /**
         * "Poging X van maxAttempts": the position among the attempts that
         * still exist, so a reset attempt never leaves a gap.
         */
        attemptNumber:
          mine.filter((t) => t.attemptNumber <= attempt.attemptNumber).length ||
          attempt.attemptNumber,
        attemptStatus: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        autoSubmitted: attempt.autoSubmitted,
        attemptsUsed,
        maxAttempts: settings.maxAttempts,
        canRetry:
          a.mode === "practice" &&
          status === "open" &&
          attempt.status === "submitted" &&
          attemptsUsed < settings.maxAttempts,
      };

      if (attempt.status !== "submitted") {
        return {
          ...base,
          visible: false as const,
          message: "Je bent nog bezig met deze toets.",
          closesAt: a.closesAt,
        };
      }
      // Classmates still taking the afname (verlengde tijd after the close,
      // or anyone while it is open): results and right answers wait.
      const othersWorking =
        a.mode === "exam" || settings.showResults === "after_close"
          ? await stillWorking(db, a, now)
          : false;
      if (!resultsVisible(a, now, othersWorking)) {
        return {
          ...base,
          visible: false as const,
          message: hiddenResultMessage(
            settings.showResults,
            a.closesAt,
            status === "closed" && othersWorking,
          ),
          closesAt: a.closesAt,
        };
      }

      // Self-healing: grading lost (e.g. server restart) is restarted.
      if (
        attempt.gradingStatus === "pending" &&
        !isGradingInFlight(attempt.id) &&
        attempt.submittedAt &&
        now.getTime() - attempt.submittedAt.getTime() > 20_000
      ) {
        scheduleGrading(attempt.id);
      }

      // Exam confidentiality: while another attempt is possible (or
      // running), or while classmates are still taking the exam, the right
      // answers stay hidden (unless the teacher released the results).
      const ownAttemptsLeft =
        hasRunningAttempt ||
        (status === "open" && attemptsUsed < settings.maxAttempts);
      const othersHoldBack = othersWorking && !a.resultsReleased;
      const answersHidden =
        a.mode === "exam" && (ownAttemptsLeft || othersHoldBack);

      const order = attempt.questionOrder ?? [];
      const qRows = order.length
        ? await db.select().from(questions).where(inArray(questions.id, order))
        : [];
      const byId = new Map(qRows.map((q) => [q.id, q]));
      const aRows = await db
        .select()
        .from(answers)
        .where(eq(answers.attemptId, attempt.id));
      const answerByQ = new Map(aRows.map((r) => [r.questionId, r]));
      const neutralized = new Map(
        (
          await db
            .select({
              questionId: questionNeutralizations.questionId,
              mode: questionNeutralizations.mode,
            })
            .from(questionNeutralizations)
            .where(eq(questionNeutralizations.assignmentId, a.id))
        ).map((n) => [n.questionId, n.mode]),
      );

      const list = order
        .map((id) => byId.get(id))
        .filter((q): q is QuestionRow => !!q)
        .map((q, index) => {
          const ans = answerByQ.get(q.id);
          const typed = typedData(q);
          const graded =
            !!ans && (ans.manualScore != null || ans.status === "graded");
          const response = (ans?.response ?? null) as AnswerResponse | null;

          let codeResult: CodeGradingResult | null = null;
          if (typed.type === "code" && ans?.result?.kind === "code") {
            const parsed = codeGradingResultSchema.safeParse(ans.result);
            if (parsed.success) {
              codeResult = studentCodeResult(
                redactCodeResultForStudent(parsed.data),
                answersHidden,
              );
            }
          }

          let choice: {
            multiple: boolean;
            correct: boolean;
            options: {
              id: string;
              text: string;
              selected: boolean;
              /** Null while the right answers are hidden. */
              correct: boolean | null;
            }[];
          } | null = null;
          if (typed.type === "multiple_choice") {
            const selected = new Set(
              response && "selected" in response ? response.selected : [],
            );
            const options = optionOrderFor(
              attempt.id,
              q.id,
              typed.data.options,
              typed.data.shuffle,
            );
            choice = {
              multiple: typed.data.multiple,
              correct:
                ans?.result?.kind === "multiple_choice"
                  ? ans.result.correct
                  : false,
              options: options.map((o) => ({
                id: o.id,
                text: o.text,
                selected: selected.has(o.id),
                correct: answersHidden ? null : o.correct,
              })),
            };
          }

          // Hints the student revealed, and what they cost.
          const points = ans?.maxScore ?? q.points;
          const hintsUsed = typed.type === "code" ? (ans?.hintsUsed ?? []) : [];
          const hints =
            typed.type === "code" && hintsUsed.length
              ? {
                  used: hintsUsed.filter((h) =>
                    typed.data.hints.some((d) => d.id === h.id),
                  ).length,
                  penaltyPoints: round2(
                    hintPenaltyFraction(typed.data.hints, hintsUsed) * points,
                  ),
                }
              : null;

          // Rubric criteria the teacher ticked (open questions).
          const rubric =
            typed.type === "open" &&
            typed.data.rubricItems.length &&
            ans?.rubricChecked
              ? typed.data.rubricItems.map((item) => ({
                  id: item.id,
                  label: item.label,
                  points: item.points,
                  achieved: ans.rubricChecked?.includes(item.id) ?? false,
                }))
              : null;

          return {
            id: q.id,
            position: index + 1,
            type: q.type,
            title: q.title,
            prompt: q.prompt,
            points,
            earned: graded && ans ? effectiveScore(ans) : null,
            /** The question "vervalt": dropped (max 0) or full points for all. */
            neutralized:
              neutralized.get(q.id) ??
              (ans && ans.maxScore === 0 && q.points > 0 ? "drop" : null),
            status: ans?.status ?? "empty",
            reviewed: ans?.manualScore != null,
            answered: !isBlankResponse(
              typed.type,
              response,
              typed.type === "code" ? typed.data.starterCode : "",
            ),
            feedback: ans?.feedback ?? null,
            response,
            codeResult,
            choice,
            hints,
            rubric,
          };
        });

      const score = attempt.score ?? 0;
      const maxScore =
        attempt.maxScore ?? list.reduce((s, q) => s + q.points, 0);
      return {
        ...base,
        visible: true as const,
        gradingStatus: attempt.gradingStatus,
        score: attempt.gradingStatus === "pending" ? null : score,
        maxScore,
        grade:
          attempt.gradingStatus === "pending"
            ? null
            : dutchGrade(score, maxScore, a.settings),
        /**
         * Exam score that may still change: not fully graded, or the
         * teacher can still review it (afname open, results not released).
         */
        provisional:
          a.mode === "exam" &&
          (attempt.gradingStatus !== "graded" ||
            (status !== "closed" && !a.resultsReleased)),
        answersHidden,
        answersHiddenMessage: !answersHidden
          ? null
          : ownAttemptsLeft
            ? ANSWERS_HIDDEN_MESSAGE
            : ANSWERS_HIDDEN_OTHERS_MESSAGE,
        /** While pending: how many answers have been graded so far. */
        gradingProgress: {
          done: aRows.filter(
            (r) =>
              r.gradedAt != null &&
              (!attempt.submittedAt || r.gradedAt >= attempt.submittedAt),
          ).length,
          total: aRows.length,
        },
        questions: list,
      };
    }),

  /** All submitted attempts of the student. */
  myResults: studentProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const rows = await db
      .select({
        attempt: {
          id: attempts.id,
          attemptNumber: attemptDisplayNumberSql,
          submittedAt: attempts.submittedAt,
          autoSubmitted: attempts.autoSubmitted,
          score: attempts.score,
          maxScore: attempts.maxScore,
          gradingStatus: attempts.gradingStatus,
        },
        assignment: assignments,
        testTitle: tests.title,
        className: classes.name,
      })
      .from(attempts)
      .innerJoin(assignments, eq(assignments.id, attempts.assignmentId))
      .innerJoin(tests, eq(tests.id, assignments.testId))
      .innerJoin(classes, eq(classes.id, assignments.classId))
      .innerJoin(
        classMembers,
        and(
          eq(classMembers.classId, assignments.classId),
          eq(classMembers.userId, ctx.user.id),
        ),
      )
      .where(
        and(eq(attempts.userId, ctx.user.id), eq(attempts.status, "submitted")),
      )
      .orderBy(desc(attempts.submittedAt));

    const working = await stillWorkingByAssignment(
      db,
      [
        ...new Map(
          rows
            .filter(
              (r) => effectiveAssignmentStatus(r.assignment, now) === "closed",
            )
            .map((r) => [r.assignment.id, r.assignment]),
        ).values(),
      ],
      now,
    );
    return rows.map(({ attempt: t, assignment: a, testTitle, className }) => {
      const visible = resultsVisible(a, now, working.get(a.id) ?? false);
      const done = visible && t.gradingStatus !== "pending";
      return {
        attemptId: t.id,
        assignmentId: a.id,
        title: assignmentTitle(a, testTitle),
        className,
        mode: a.mode,
        attemptNumber: t.attemptNumber,
        submittedAt: t.submittedAt,
        autoSubmitted: t.autoSubmitted,
        visible,
        gradingStatus: visible ? t.gradingStatus : null,
        score: done ? t.score : null,
        maxScore: done ? t.maxScore : null,
        grade:
          done && t.score != null && t.maxScore
            ? dutchGrade(t.score, t.maxScore, a.settings)
            : null,
      };
    });
  }),
});
