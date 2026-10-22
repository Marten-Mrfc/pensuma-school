/**
 * Resultaten & nakijken for teachers: the results matrix, reviewing one
 * attempt, manual score overrides with feedback, regrading and CSV export.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  type CsvCell,
  formatDateTimeNl,
  formatFixedNl,
  slugifyFilename,
  toCsv,
} from "@/lib/export/csv";
import { round1 } from "@/lib/grading/grade-scale";
import {
  type AnswerResponse,
  type GradingResult,
  parseQuestionData,
  type QuestionType,
} from "@/lib/questions/schema";
import {
  answeredCondition,
  getAssignmentOrThrow,
  gradeAttemptsSafely,
  rosterForAssignment,
} from "@/server/api/routers/assignment";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import type { DB } from "@/server/db";
import {
  answers,
  assignments,
  attemptEvents,
  attempts,
  classes,
  questionNeutralizations,
  questions,
  tests,
  user,
} from "@/server/db/schema";
import { getPrivacySettings } from "@/server/privacy/settings-store";
import {
  dutchGrade,
  effectiveAssignmentStatus,
  parseAssignmentSettings,
} from "@/server/services/assignment-status";
import { auditFromCtx, auditRead } from "@/server/services/audit";
import {
  effectiveScore,
  gradeAttempt,
  recomputeAttemptScore,
} from "@/server/services/grading";

const idSchema = z.uuid("Ongeldige id.");
const round2 = (n: number) => Math.round(n * 100) / 100;

type AnswerStatus = "empty" | "saved" | "graded" | "needs_review";
type AttemptRow = typeof attempts.$inferSelect;

/**
 * The attempt that represents a student in results: the latest submitted
 * attempt, or the latest attempt when none was submitted yet.
 */
export function representativeAttempts<
  T extends Pick<AttemptRow, "userId" | "attemptNumber" | "status">,
>(rows: T[]) {
  const map = new Map<string, T>();
  for (const r of rows) {
    const current = map.get(r.userId);
    if (!current) {
      map.set(r.userId, r);
      continue;
    }
    const rSubmitted = r.status === "submitted";
    const cSubmitted = current.status === "submitted";
    if (rSubmitted !== cSubmitted) {
      if (rSubmitted) map.set(r.userId, r);
    } else if (r.attemptNumber > current.attemptNumber) {
      map.set(r.userId, r);
    }
  }
  return map;
}

/** Integer grade bins 1–2, 2–3, …, 9–10 (10 falls in the last bin). */
function gradeDistribution(grades: number[]) {
  const bins = Array.from({ length: 9 }, (_, i) => ({
    from: i + 1,
    to: i + 2,
    label: `${i + 1}–${i + 2}`,
    count: 0,
  }));
  for (const g of grades) {
    const idx = Math.min(8, Math.max(0, Math.floor(g) - 1));
    bins[idx].count++;
  }
  return bins;
}

export type ResultCell = {
  answerId: string;
  score: number;
  maxScore: number;
  status: AnswerStatus;
  autoScore: number | null;
  manualScore: number | null;
  hasFeedback: boolean;
  /** False for blank answers (0 points without grading). */
  answered: boolean;
};

/**
 * Everything the results matrix, the CSV export and the toetsanalyse need.
 * Grades are computed on the fly with the afname's grading scale, so
 * changing the scale updates every view without regrading.
 */
export async function computeResults(db: DB, assignmentId: string) {
  const a = await getAssignmentOrThrow(db, assignmentId);
  const settings = parseAssignmentSettings(a.settings);
  const [[test], [klas], neutralizationRows] = await Promise.all([
    db
      .select({ id: tests.id, title: tests.title })
      .from(tests)
      .where(eq(tests.id, a.testId)),
    db
      .select({ id: classes.id, name: classes.name })
      .from(classes)
      .where(eq(classes.id, a.classId)),
    db
      .select({
        questionId: questionNeutralizations.questionId,
        mode: questionNeutralizations.mode,
      })
      .from(questionNeutralizations)
      .where(eq(questionNeutralizations.assignmentId, a.id)),
  ]);
  const neutralized: Record<string, "full_points" | "drop"> =
    Object.fromEntries(neutralizationRows.map((n) => [n.questionId, n.mode]));
  const questionRows = await db
    .select({
      id: questions.id,
      title: questions.title,
      type: questions.type,
      points: questions.points,
      position: questions.position,
    })
    .from(questions)
    .where(eq(questions.testId, a.testId))
    .orderBy(asc(questions.position), asc(questions.createdAt));
  const pointsById = new Map(questionRows.map((q) => [q.id, q.points]));
  const totalPoints = questionRows.reduce((s, q) => s + q.points, 0);

  const [roster, attemptRows] = await Promise.all([
    rosterForAssignment(db, a.classId, a.id),
    db.select().from(attempts).where(eq(attempts.assignmentId, a.id)),
  ]);
  const chosen = representativeAttempts(attemptRows);
  const attemptCounts = new Map<string, number>();
  for (const r of attemptRows)
    attemptCounts.set(r.userId, (attemptCounts.get(r.userId) ?? 0) + 1);

  const chosenIds = [...chosen.values()].map((r) => r.id);
  const answerRows = chosenIds.length
    ? await db
        .select({
          id: answers.id,
          attemptId: answers.attemptId,
          questionId: answers.questionId,
          status: answers.status,
          autoScore: answers.autoScore,
          manualScore: answers.manualScore,
          maxScore: answers.maxScore,
          feedback: answers.feedback,
          answered: sql<boolean>`${answeredCondition}`,
        })
        .from(answers)
        .where(inArray(answers.attemptId, chosenIds))
    : [];
  const answersByAttempt = new Map<string, typeof answerRows>();
  for (const r of answerRows) {
    const list = answersByAttempt.get(r.attemptId) ?? [];
    list.push(r);
    answersByAttempt.set(r.attemptId, list);
  }

  const rows = roster.map((student) => {
    const at = chosen.get(student.id);
    const perQuestion: Record<string, ResultCell | null> = {};
    for (const q of questionRows) perQuestion[q.id] = null;
    if (!at) {
      return { student, attemptCount: 0, attempt: null, perQuestion };
    }
    const list = answersByAttempt.get(at.id) ?? [];
    let score = 0;
    const answeredMax = new Map<string, number>();
    let reviewCount = 0;
    for (const r of list) {
      const s = effectiveScore(r);
      score += s;
      answeredMax.set(r.questionId, r.maxScore);
      if (r.status === "needs_review" && r.manualScore == null) reviewCount++;
      perQuestion[r.questionId] = {
        answerId: r.id,
        score: s,
        maxScore: r.maxScore,
        status: r.status,
        autoScore: r.autoScore,
        manualScore: r.manualScore,
        hasFeedback: !!r.feedback?.trim(),
        answered: r.answered,
      };
    }
    const order = at.questionOrder.length
      ? at.questionOrder
      : questionRows.map((q) => q.id);
    let maxScore = 0;
    for (const qid of order)
      maxScore += answeredMax.get(qid) ?? pointsById.get(qid) ?? 0;
    for (const [qid, m] of answeredMax) if (!order.includes(qid)) maxScore += m;
    score = round2(score);
    maxScore = round2(maxScore);
    const submitted = at.status === "submitted";
    return {
      student,
      attemptCount: attemptCounts.get(student.id) ?? 1,
      attempt: {
        id: at.id,
        attemptNumber: at.attemptNumber,
        status: at.status,
        startedAt: at.startedAt,
        submittedAt: at.submittedAt,
        autoSubmitted: at.autoSubmitted,
        gradingStatus: at.gradingStatus,
        focusLossCount: at.focusLossCount,
        score,
        maxScore,
        percentage: maxScore ? score / maxScore : 0,
        grade: submitted ? dutchGrade(score, maxScore, a.settings) : null,
        provisional: !submitted || at.gradingStatus !== "graded",
        reviewCount,
      },
      perQuestion,
    };
  });

  const submittedRows = rows.filter((r) => r.attempt?.status === "submitted");
  const questionStats = questionRows.map((q) => {
    let sum = 0;
    let full = 0;
    let answered = 0;
    let needsReview = 0;
    for (const r of submittedRows) {
      const cell = r.perQuestion[q.id];
      if (!cell) continue;
      sum += cell.score;
      if (cell.maxScore > 0 && cell.score >= cell.maxScore - 1e-9) full++;
      if (cell.answered) answered++;
      if (cell.status === "needs_review" && cell.manualScore == null)
        needsReview++;
    }
    const n = submittedRows.length;
    return {
      questionId: q.id,
      averageScore: n ? round2(sum / n) : null,
      // A dropped question ("vervallen") has no meaningful average.
      averagePercentage:
        n && q.points && neutralized[q.id] !== "drop"
          ? sum / n / q.points
          : null,
      fullMarksPercentage: n ? full / n : null,
      answered,
      needsReview,
    };
  });
  const grades = submittedRows
    .map((r) => r.attempt?.grade)
    .filter((g): g is number => g != null);
  const scores = submittedRows.map((r) => r.attempt?.score ?? 0);
  const percentages = submittedRows.map((r) => r.attempt?.percentage ?? 0);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  const averageGradeRaw = avg(grades);

  return {
    assignment: {
      id: a.id,
      title: a.title?.trim() || test?.title || "Afname",
      testTitle: test?.title ?? "",
      className: klas?.name ?? "",
      classId: a.classId,
      testId: a.testId,
      mode: a.mode,
      effectiveStatus: effectiveAssignmentStatus(a),
      showResults: settings.showResults,
      resultsReleased: a.resultsReleased,
      totalPoints,
      grading: settings.grading,
      logFocusEvents: settings.logFocusEvents,
      retakeOfId: a.retakeOfId,
    },
    questions: questionRows,
    /** Questions that "vervallen" for this afname: questionId → mode. */
    neutralized,
    rows,
    stats: {
      students: rows.length,
      submitted: submittedRows.length,
      inProgress: rows.filter((r) => r.attempt?.status === "in_progress")
        .length,
      notStarted: rows.filter((r) => !r.attempt).length,
      needsReview: submittedRows.reduce(
        (s, r) => s + (r.attempt?.reviewCount ?? 0),
        0,
      ),
      averageScore: avg(scores) == null ? null : round2(avg(scores) ?? 0),
      averagePercentage: avg(percentages),
      averageGrade: averageGradeRaw == null ? null : round1(averageGradeRaw),
      passed: grades.filter((g) => g >= 5.5).length,
      perQuestion: questionStats,
      distribution: gradeDistribution(grades),
    },
  };
}

function attemptStatusLabel(
  attempt: { status: string; gradingStatus: string } | null,
) {
  if (!attempt) return "Niet begonnen";
  if (attempt.status === "in_progress") return "Bezig";
  if (attempt.gradingStatus === "needs_review")
    return "Ingeleverd – nog nakijken";
  if (attempt.gradingStatus === "pending")
    return "Ingeleverd – wordt nagekeken";
  return "Ingeleverd";
}

function safeQuestionData(type: QuestionType, data: unknown) {
  try {
    return parseQuestionData(type, data) as Record<string, unknown>;
  } catch {
    return (data ?? {}) as Record<string, unknown>;
  }
}

async function getAnswerContext(db: DB, answerId: string) {
  const [row] = await db
    .select({
      answer: answers,
      attemptStatus: attempts.status,
      attemptId: attempts.id,
      attemptUserId: attempts.userId,
      studentNumber: user.username,
      questionType: questions.type,
    })
    .from(answers)
    .innerJoin(attempts, eq(attempts.id, answers.attemptId))
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .innerJoin(user, eq(user.id, attempts.userId))
    .where(eq(answers.id, answerId));
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Dit antwoord bestaat niet (meer).",
    });
  return row;
}

/* -------------------------------------------------------------------------- */
/*                                   Router                                   */
/* -------------------------------------------------------------------------- */

export const reviewRouter = createTRPCRouter({
  results: adminProcedure
    .input(z.object({ assignmentId: idSchema }))
    .query(async ({ ctx, input }) => {
      const [data, privacy] = await Promise.all([
        computeResults(ctx.db, input.assignmentId),
        getPrivacySettings(ctx.db),
      ]);
      return {
        ...data,
        exportOptions: {
          /** The afname logged focus events, so the export can include them. */
          logFocusEvents: data.assignment.logFocusEvents,
          includeFocusByDefault: privacy.settings.exports.includeFocusByDefault,
        },
      };
    }),

  attempt: adminProcedure
    .input(z.object({ attemptId: idSchema }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          attempt: attempts,
          assignment: assignments,
          student: {
            id: user.id,
            name: user.name,
            studentNumber: user.username,
          },
          testTitle: tests.title,
          className: classes.name,
        })
        .from(attempts)
        .innerJoin(assignments, eq(assignments.id, attempts.assignmentId))
        .innerJoin(user, eq(user.id, attempts.userId))
        .innerJoin(tests, eq(tests.id, assignments.testId))
        .innerJoin(classes, eq(classes.id, assignments.classId))
        .where(eq(attempts.id, input.attemptId));
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze poging bestaat niet (meer).",
        });
      const { attempt: at, assignment: a } = row;
      auditRead(ctx, {
        action: "attempt.viewed",
        subjectType: "attempt",
        subjectId: at.id,
        subjectUserId: row.student.id,
        subjectLabel: row.student.studentNumber,
      });

      const [questionRows, answerRows, events, siblings] = await Promise.all([
        ctx.db
          .select()
          .from(questions)
          .where(eq(questions.testId, a.testId))
          .orderBy(asc(questions.position), asc(questions.createdAt)),
        ctx.db
          .select({ answer: answers, reviewerName: user.name })
          .from(answers)
          .leftJoin(user, eq(user.id, answers.reviewedById))
          .where(eq(answers.attemptId, at.id)),
        ctx.db
          .select()
          .from(attemptEvents)
          .where(eq(attemptEvents.attemptId, at.id))
          .orderBy(asc(attemptEvents.createdAt), asc(attemptEvents.id)),
        ctx.db
          .select({
            id: attempts.id,
            userId: attempts.userId,
            attemptNumber: attempts.attemptNumber,
            status: attempts.status,
            name: user.name,
          })
          .from(attempts)
          .innerJoin(user, eq(user.id, attempts.userId))
          .where(eq(attempts.assignmentId, a.id)),
      ]);

      const byId = new Map(questionRows.map((q) => [q.id, q]));
      const answerByQuestion = new Map(
        answerRows.map((r) => [r.answer.questionId, r]),
      );
      const orderIds = at.questionOrder.length
        ? at.questionOrder.filter((id) => byId.has(id))
        : questionRows.map((q) => q.id);
      for (const r of answerRows)
        if (!orderIds.includes(r.answer.questionId))
          orderIds.push(r.answer.questionId);

      const items = orderIds.flatMap((qid, index) => {
        const q = byId.get(qid);
        if (!q) return [];
        const ans = answerByQuestion.get(qid);
        return [
          {
            number: index + 1,
            question: {
              id: q.id,
              type: q.type,
              title: q.title,
              prompt: q.prompt,
              points: q.points,
              position: q.position,
              data: safeQuestionData(q.type, q.data),
            },
            answer: ans
              ? {
                  id: ans.answer.id,
                  response: ans.answer.response as AnswerResponse | null,
                  status: ans.answer.status,
                  autoScore: ans.answer.autoScore,
                  manualScore: ans.answer.manualScore,
                  score: effectiveScore(ans.answer),
                  maxScore: ans.answer.maxScore,
                  feedback: ans.answer.feedback,
                  result: ans.answer.result as GradingResult | null,
                  savedAt: ans.answer.savedAt,
                  gradedAt: ans.answer.gradedAt,
                  reviewedAt: ans.answer.reviewedAt,
                  reviewerName: ans.reviewerName,
                  hintsUsed: ans.answer.hintsUsed ?? [],
                  rubricChecked: ans.answer.rubricChecked,
                }
              : null,
          },
        ];
      });

      const score = round2(
        items.reduce((s, i) => s + (i.answer?.score ?? 0), 0),
      );
      const maxScore = round2(
        items.reduce(
          (s, i) => s + (i.answer?.maxScore ?? i.question.points),
          0,
        ),
      );

      // Navigation: one attempt per student, sorted by name.
      const representative = [
        ...representativeAttempts(siblings).values(),
      ].sort(
        (x, y) =>
          x.name.localeCompare(y.name, "nl") ||
          x.userId.localeCompare(y.userId),
      );
      const index = representative.findIndex((s) => s.userId === at.userId);
      const studentAttempts = siblings
        .filter((s) => s.userId === at.userId)
        .sort((x, y) => x.attemptNumber - y.attemptNumber)
        .map((s) => ({
          id: s.id,
          attemptNumber: s.attemptNumber,
          status: s.status,
        }));

      return {
        attempt: {
          id: at.id,
          attemptNumber: at.attemptNumber,
          status: at.status,
          startedAt: at.startedAt,
          deadlineAt: at.deadlineAt,
          submittedAt: at.submittedAt,
          autoSubmitted: at.autoSubmitted,
          extraMinutes: at.extraMinutes,
          accommodationMinutes: at.accommodationMinutes,
          focusLossCount: at.focusLossCount,
          lastSeenAt: at.lastSeenAt,
          gradingStatus: at.gradingStatus,
          storedScore: at.score,
          storedMaxScore: at.maxScore,
          score,
          maxScore,
          grade:
            at.status === "submitted"
              ? dutchGrade(score, maxScore, a.settings)
              : null,
        },
        student: row.student,
        assignment: {
          id: a.id,
          title: a.title?.trim() || row.testTitle,
          testTitle: row.testTitle,
          className: row.className,
          mode: a.mode,
          effectiveStatus: effectiveAssignmentStatus(a),
          settings: parseAssignmentSettings(a.settings),
        },
        items,
        events: events.map((e) => ({
          id: e.id,
          type: e.type,
          details: e.details,
          createdAt: e.createdAt,
        })),
        navigation: {
          index: index < 0 ? null : index,
          total: representative.length,
          prevAttemptId: index > 0 ? representative[index - 1].id : null,
          nextAttemptId:
            index >= 0 && index < representative.length - 1
              ? representative[index + 1].id
              : null,
          prevName: index > 0 ? representative[index - 1].name : null,
          nextName:
            index >= 0 && index < representative.length - 1
              ? representative[index + 1].name
              : null,
        },
        studentAttempts,
      };
    }),

  setManualScore: adminProcedure
    .input(
      z.object({
        answerId: idSchema,
        manualScore: z
          .number()
          .min(0, "De score kan niet negatief zijn.")
          .nullable(),
        feedback: z
          .string()
          .max(20_000, "De feedback is te lang.")
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { answer, attemptStatus, attemptId, attemptUserId, studentNumber } =
        await getAnswerContext(ctx.db, input.answerId);
      if (attemptStatus !== "submitted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "De leerling is nog bezig met deze poging. Beoordeel na het inleveren.",
        });
      }
      if (
        input.manualScore != null &&
        input.manualScore > answer.maxScore + 1e-9
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `De score mag hoogstens ${answer.maxScore} zijn.`,
        });
      }
      const manualScore =
        input.manualScore == null ? null : round2(input.manualScore);
      let status: AnswerStatus;
      if (manualScore != null) status = "graded";
      else if (answer.autoScore != null) status = "graded";
      else if (
        answer.result ||
        answer.status === "needs_review" ||
        answer.status === "graded"
      )
        status = "needs_review";
      else status = answer.status;

      const patch: Partial<typeof answers.$inferInsert> = {
        manualScore,
        status,
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
      };
      if (input.feedback !== undefined)
        patch.feedback = input.feedback?.trim() ? input.feedback : null;
      await ctx.db.update(answers).set(patch).where(eq(answers.id, answer.id));
      if (answer.manualScore !== manualScore) {
        await auditFromCtx(ctx, {
          action: "answer.score_changed",
          subjectType: "answer",
          subjectId: answer.id,
          subjectUserId: attemptUserId,
          subjectLabel: studentNumber,
          details: {
            answerId: answer.id,
            attemptId,
            from: answer.manualScore,
            to: manualScore,
          },
        });
      }

      let recomputed = true;
      try {
        await recomputeAttemptScore(attemptId);
      } catch (err) {
        recomputed = false;
        console.error("[review] recomputeAttemptScore failed", err);
      }
      return {
        answerId: answer.id,
        attemptId,
        manualScore,
        score: effectiveScore({ autoScore: answer.autoScore, manualScore }),
        status,
        recomputed,
      };
    }),

  regradeAttempt: adminProcedure
    .input(z.object({ attemptId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const [at] = await ctx.db
        .select({ id: attempts.id, status: attempts.status })
        .from(attempts)
        .where(eq(attempts.id, input.attemptId));
      if (!at)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze poging bestaat niet (meer).",
        });
      if (at.status !== "submitted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Deze poging is nog niet ingeleverd.",
        });
      }
      try {
        await gradeAttempt(at.id);
      } catch (err) {
        console.error("[review] regradeAttempt failed", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Opnieuw nakijken is mislukt. Probeer het later nog eens.",
        });
      }
      return { attemptId: at.id };
    }),

  regradeAssignment: adminProcedure
    .input(z.object({ assignmentId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.assignmentId);
      const rows = await ctx.db
        .select({ id: attempts.id })
        .from(attempts)
        .where(
          and(
            eq(attempts.assignmentId, a.id),
            eq(attempts.status, "submitted"),
          ),
        );
      const { graded, failed } = await gradeAttemptsSafely(
        rows.map((r) => r.id),
        3,
      );
      return { total: rows.length, graded, failed };
    }),

  /** Answers that wait for the teacher (open questions), question by question. */
  gradingQueue: adminProcedure
    .input(
      z.object({
        assignmentId: idSchema,
        questionId: idSchema.optional(),
        includeGraded: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.assignmentId);
      const [questionRows, answerRows] = await Promise.all([
        ctx.db
          .select()
          .from(questions)
          .where(eq(questions.testId, a.testId))
          .orderBy(asc(questions.position), asc(questions.createdAt)),
        ctx.db
          .select({
            answer: answers,
            attemptId: attempts.id,
            attemptNumber: attempts.attemptNumber,
            student: {
              id: user.id,
              name: user.name,
              studentNumber: user.username,
            },
          })
          .from(answers)
          .innerJoin(attempts, eq(attempts.id, answers.attemptId))
          .innerJoin(user, eq(user.id, attempts.userId))
          .where(
            and(
              eq(attempts.assignmentId, a.id),
              eq(attempts.status, "submitted"),
            ),
          ),
      ]);

      const needsReview = (r: (typeof answerRows)[number]) =>
        r.answer.status === "needs_review" && r.answer.manualScore == null;
      const reviewQuestionIds = new Set(
        answerRows.filter(needsReview).map((r) => r.answer.questionId),
      );
      const relevant = questionRows.filter(
        (q) => q.type === "open" || reviewQuestionIds.has(q.id),
      );

      const questionList = relevant.map((q) => {
        const forQ = answerRows.filter((r) => r.answer.questionId === q.id);
        const data = safeQuestionData(q.type, q.data);
        return {
          id: q.id,
          type: q.type,
          title: q.title,
          prompt: q.prompt,
          points: q.points,
          position: q.position,
          number: questionRows.findIndex((x) => x.id === q.id) + 1,
          modelAnswer: q.type === "open" ? String(data.modelAnswer ?? "") : "",
          rubric: q.type === "open" ? String(data.rubric ?? "") : "",
          solution: q.type === "code" ? String(data.solution ?? "") : "",
          needsReview: forQ.filter(needsReview).length,
          reviewed: forQ.filter(
            (r) => r.answer.reviewedAt != null && !needsReview(r),
          ).length,
          total: forQ.length,
        };
      });

      const questionIds = new Set(relevant.map((q) => q.id));
      const items = answerRows
        .filter((r) =>
          input.questionId
            ? r.answer.questionId === input.questionId
            : questionIds.has(r.answer.questionId),
        )
        .filter(
          (r) =>
            needsReview(r) ||
            (input.includeGraded &&
              r.answer.status !== "empty" &&
              (r.answer.result != null || r.answer.manualScore != null)),
        )
        .map((r) => ({
          answerId: r.answer.id,
          attemptId: r.attemptId,
          attemptNumber: r.attemptNumber,
          questionId: r.answer.questionId,
          student: r.student,
          response: r.answer.response as AnswerResponse | null,
          result: r.answer.result as GradingResult | null,
          status: r.answer.status,
          needsReview: needsReview(r),
          autoScore: r.answer.autoScore,
          manualScore: r.answer.manualScore,
          score: effectiveScore(r.answer),
          maxScore: r.answer.maxScore,
          feedback: r.answer.feedback,
          reviewedAt: r.answer.reviewedAt,
        }));
      const position = new Map(questionRows.map((q, i) => [q.id, i]));
      items.sort(
        (x, y) =>
          (position.get(x.questionId) ?? 0) -
            (position.get(y.questionId) ?? 0) ||
          x.student.name.localeCompare(y.student.name, "nl") ||
          x.attemptNumber - y.attemptNumber,
      );
      return { questions: questionList, items };
    }),

  exportCsv: adminProcedure
    .input(
      z.object({
        assignmentId: idSchema,
        /** Include the "Focusverlies" column (default: the school's privacy setting). */
        includeFocus: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const data = await computeResults(ctx.db, input.assignmentId);
      const requested =
        input.includeFocus ??
        (await getPrivacySettings(ctx.db)).settings.exports
          .includeFocusByDefault;
      // Only an afname that logged focus events has anything to export.
      const includeFocus = requested && data.assignment.logFocusEvents;
      const header: CsvCell[] = [
        "Leerlingnummer",
        "Naam",
        "Status",
        ...data.questions.map(
          (q, i) =>
            `V${i + 1} ${q.title} (${formatFixedNl(q.points, q.points % 1 ? 1 : 0)})`,
        ),
        "Totaal",
        "Max",
        "Cijfer",
        "Ingeleverd op",
        ...(includeFocus ? ["Focusverlies"] : []),
      ];
      const body: CsvCell[][] = data.rows.map((r) => [
        r.student.studentNumber ?? "",
        r.student.name,
        attemptStatusLabel(r.attempt),
        ...data.questions.map((q) => {
          const cell = r.perQuestion[q.id];
          return r.attempt?.status === "submitted" && cell ? cell.score : null;
        }),
        r.attempt?.status === "submitted" ? r.attempt.score : null,
        r.attempt ? r.attempt.maxScore : data.assignment.totalPoints,
        r.attempt?.grade != null ? formatFixedNl(r.attempt.grade, 1) : "",
        r.attempt?.submittedAt ? formatDateTimeNl(r.attempt.submittedAt) : "",
        ...(includeFocus ? [r.attempt ? r.attempt.focusLossCount : null] : []),
      ]);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `${slugifyFilename(data.assignment.title, "afname")}-${slugifyFilename(
        data.assignment.className,
        "klas",
      )}-${date}.csv`;
      await auditFromCtx(ctx, {
        action: "results.exported",
        subjectType: "assignment",
        subjectId: data.assignment.id,
        details: {
          assignmentId: data.assignment.id,
          rows: body.length,
          includeFocus,
        },
      });
      return { filename, csv: toCsv([header, ...body]), includeFocus };
    }),
});
