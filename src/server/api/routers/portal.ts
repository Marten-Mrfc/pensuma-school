/**
 * Student portal: everything a student (leerling) does.
 *
 * Every procedure checks that the student is a member of the assignment's
 * class and, for attempts, that the attempt belongs to them. Nothing a
 * student may not see (correct options, solutions, hidden tests, model
 * answers, the access code) ever leaves this router.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  type AnswerResponse,
  answerResponseSchema,
  type CodeGradingResult,
  codeGradingResultSchema,
  codeResponseSchema,
  multipleChoiceResponseSchema,
  openResponseSchema,
  parseQuestionData,
  type QuestionDataByType,
  type QuestionType,
  questionDataForStudent,
  redactCodeResultForStudent,
  type ShowResults,
  type TypedQuestionData,
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
  questions,
  tests,
} from "@/server/db/schema";
import {
  DEADLINE_GRACE_MS,
  dutchGrade,
  effectiveAssignmentStatus,
  parseAssignmentSettings,
  resultsVisible,
} from "@/server/services/assignment-status";
import {
  AttemptStartError,
  autoSubmitIfExpired,
  createOrResumeAttempt,
  findResumableAttempt,
  isAttemptExpired,
  isClassMember,
  logServerEvent,
  optionOrderFor,
  scheduleGrading,
  submitAttempt,
} from "@/server/services/attempts";
import {
  effectiveScore,
  isBlankResponse,
  isGradingInFlight,
} from "@/server/services/grading";

/* --------------------------------- Helpers -------------------------------- */

/** Ids from URLs: a friendly message instead of zod's "Invalid UUID". */
const idSchema = z.uuid({ error: "Deze link klopt niet." });

type AssignmentRow = typeof assignments.$inferSelect;
type AttemptRow = typeof attempts.$inferSelect;
type QuestionRow = typeof questions.$inferSelect;

/** Event types a student's browser may log (server-only types excluded). */
const CLIENT_EVENT_TYPES = [
  "focus_lost",
  "focus_gained",
  "visibility_hidden",
  "visibility_visible",
  "fullscreen_enter",
  "fullscreen_exit",
  "paste",
  "copy",
  "code_run",
  "self_test",
] as const;
const FOCUS_LOSS_EVENTS = new Set<string>([
  "focus_lost",
  "visibility_hidden",
  "fullscreen_exit",
]);

const notFound = (
  message = "Deze toets bestaat niet of is niet voor jouw klas.",
) => new TRPCError({ code: "NOT_FOUND", message });

/** Question data parsed leniently (bad data falls back to defaults). */
function typedData(q: Pick<QuestionRow, "type" | "data">): TypedQuestionData {
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

function studentSettings(settings: unknown) {
  const s = parseAssignmentSettings(settings);
  return {
    requireFullscreen: s.requireFullscreen,
    logFocusEvents: s.logFocusEvents,
    blockPaste: s.blockPaste,
    allowCodeRun: s.allowCodeRun,
    allowSelfTest: s.allowSelfTest,
    maxAttempts: s.maxAttempts,
    showResults: s.showResults,
  };
}

/** Count and total points of the questions per test. */
async function testStats(testIds: string[]) {
  const map = new Map<
    string,
    {
      questionCount: number;
      totalPoints: number;
      types: Record<QuestionType, number>;
    }
  >();
  if (testIds.length === 0) return map;
  const rows = await db
    .select({
      testId: questions.testId,
      type: questions.type,
      count: sql<number>`count(*)::int`,
      points: sql<number>`coalesce(sum(${questions.points}), 0)::float8`,
    })
    .from(questions)
    .where(inArray(questions.testId, testIds))
    .groupBy(questions.testId, questions.type);
  for (const r of rows) {
    const entry = map.get(r.testId) ?? {
      questionCount: 0,
      totalPoints: 0,
      types: { code: 0, multiple_choice: 0, open: 0 },
    };
    entry.questionCount += Number(r.count);
    entry.totalPoints += Number(r.points);
    entry.types[r.type] += Number(r.count);
    map.set(r.testId, entry);
  }
  return map;
}

/** Load an assignment of one of the student's classes (hidden if not visible yet). */
async function loadAssignmentForStudent(userId: string, assignmentId: string) {
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
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (!row) throw notFound();
  const status = effectiveAssignmentStatus(row.assignment);
  if (status === "planned" && !row.assignment.opensAt) throw notFound();
  return { ...row, status };
}

/** Load an attempt owned by the student, whose class they still belong to. */
async function loadOwnedAttempt(userId: string, attemptId: string) {
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
): string {
  switch (showResults) {
    case "after_close":
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

/* --------------------------------- Router --------------------------------- */

export const portalRouter = createTRPCRouter({
  /** Open, upcoming and finished assignments of the student's classes. */
  dashboard: studentProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const now = new Date();

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
      .where(eq(classMembers.userId, userId));

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
        const visible = resultsVisible(a, now);
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
                attemptNumber: last.attemptNumber,
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
                    ? dutchGrade(last.score, last.maxScore)
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
      else if (item.status === "open" && (item.inProgress || item.canStart))
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
      const settings = studentSettings(a.settings);
      const stats = (await testStats([a.testId])).get(a.testId);

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
        serverNow: new Date(),
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
        const given = (input.accessCode ?? "").trim().toUpperCase();
        if (given !== a.accessCode.trim().toUpperCase()) {
          // Small delay makes guessing codes unattractive.
          await new Promise((r) => setTimeout(r, 400));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Onjuiste toegangscode",
          });
        }
      }

      try {
        return await createOrResumeAttempt(a, ctx.user.id);
      } catch (err) {
        if (err instanceof AttemptStartError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
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

      const order = attempt.questionOrder ?? [];
      const qRows = order.length
        ? await db.select().from(questions).where(inArray(questions.id, order))
        : [];
      const byId = new Map(qRows.map((q) => [q.id, q]));
      const aRows = await db
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
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          startedAt: attempt.startedAt,
          deadlineAt: attempt.deadlineAt,
          submittedAt: attempt.submittedAt,
          autoSubmitted: attempt.autoSubmitted,
        },
        serverNow: new Date(),
        graceMs: DEADLINE_GRACE_MS,
        assignment: {
          id: a.id,
          title: assignmentTitle(a, row.testTitle),
          mode: a.mode,
          settings: studentSettings(a.settings),
        },
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
      if (!q) throw notFound("Deze vraag bestaat niet meer.");

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
          set: { response, status, savedAt: now },
        });
      await db
        .update(attempts)
        .set({ lastSeenAt: now })
        .where(eq(attempts.id, attempt.id));
      return { savedAt: now, status };
    }),

  /** Batched activity log (focus, fullscreen, paste, runs). */
  logEvents: studentProcedure
    .input(
      z.object({
        attemptId: idSchema,
        events: z
          .array(
            z.object({
              type: z.enum(CLIENT_EVENT_TYPES),
              at: z.coerce.date().optional(),
              details: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { attempt } = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      if (attempt.status !== "in_progress") return { logged: 0 };
      const now = new Date();
      const earliest = attempt.startedAt.getTime() - 60_000;
      const values = input.events.map((e) => {
        const at =
          e.at && !Number.isNaN(e.at.getTime())
            ? e.at.getTime()
            : now.getTime();
        const clamped = Math.min(Math.max(at, earliest), now.getTime());
        let details = e.details;
        if (details && JSON.stringify(details).length > 2000)
          details = { truncated: true };
        return {
          attemptId: attempt.id,
          type: e.type,
          details: details ?? null,
          createdAt: new Date(clamped),
        };
      });
      await db.insert(attemptEvents).values(values);
      const losses = values.filter((v) => FOCUS_LOSS_EVENTS.has(v.type)).length;
      await db
        .update(attempts)
        .set({
          lastSeenAt: now,
          ...(losses
            ? { focusLossCount: sql`${attempts.focusLossCount} + ${losses}` }
            : {}),
        })
        .where(eq(attempts.id, attempt.id));
      return { logged: values.length };
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
    .input(z.object({ attemptId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const { attempt } = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      if (attempt.status === "submitted") {
        return { submittedAt: attempt.submittedAt, alreadySubmitted: true };
      }
      await submitAttempt(attempt.id, { auto: false, by: "student" });
      const [fresh] = await db
        .select({ submittedAt: attempts.submittedAt })
        .from(attempts)
        .where(eq(attempts.id, attempt.id));
      return {
        submittedAt: fresh?.submittedAt ?? new Date(),
        alreadySubmitted: false,
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

      const attemptsUsed = await db.$count(
        attempts,
        and(eq(attempts.assignmentId, a.id), eq(attempts.userId, ctx.user.id)),
      );
      const base = {
        attemptId: attempt.id,
        assignmentId: a.id,
        title: assignmentTitle(a, row.testTitle),
        mode: a.mode,
        attemptNumber: attempt.attemptNumber,
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
      if (!resultsVisible(a, now)) {
        return {
          ...base,
          visible: false as const,
          message: hiddenResultMessage(settings.showResults, a.closesAt),
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
            if (parsed.success)
              codeResult = redactCodeResultForStudent(parsed.data);
          }

          let choice: {
            multiple: boolean;
            correct: boolean;
            options: {
              id: string;
              text: string;
              selected: boolean;
              correct: boolean;
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
                correct: o.correct,
              })),
            };
          }

          return {
            id: q.id,
            position: index + 1,
            type: q.type,
            title: q.title,
            prompt: q.prompt,
            points: ans?.maxScore ?? q.points,
            earned: graded && ans ? effectiveScore(ans) : null,
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
            : dutchGrade(score, maxScore),
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
          attemptNumber: attempts.attemptNumber,
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

    return rows.map(({ attempt: t, assignment: a, testTitle, className }) => {
      const visible = resultsVisible(a, now);
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
            ? dutchGrade(t.score, t.maxScore)
            : null,
      };
    });
  }),
});
