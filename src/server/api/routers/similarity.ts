/**
 * Code vergelijken (similarity check) for teachers. Computed on demand from
 * the submitted answers: nothing is stored and nothing is shown to students
 * (no profiling). A high score is a signal for a conversation, not proof.
 *
 * Views are audited like other views of student work: the overview once per
 * afname (`similarity.viewed`), a side-by-side comparison as
 * `attempt.viewed` for each named student (via "similarity"), so it shows
 * up in that student's access log.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { parseQuestionData } from "@/lib/questions/schema";
import {
  comparePair,
  compareSubmissions,
  SOLUTION_ID,
  toRanges,
} from "@/lib/similarity/compare";
import { getAssignmentOrThrow } from "@/server/api/routers/assignment";
import { representativeAttempts } from "@/server/api/routers/review";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import {
  answers,
  assignments,
  attemptEvents,
  attempts,
  classes,
  questions,
  tests,
  user,
} from "@/server/db/schema";
import { auditRead } from "@/server/services/audit";

const idSchema = z.uuid("Ongeldige id.");

function codeOf(response: unknown): string {
  const code = (response as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

function safeCodeData(data: unknown) {
  try {
    return parseQuestionData("code", data);
  } catch {
    return null;
  }
}

export type SimilaritySide = {
  answerId: string;
  attemptId: string;
  assignmentId: string;
  studentId: string;
  name: string;
  studentNumber: string | null;
  className: string;
  pasteCount: number;
};

export const similarityRouter = createTRPCRouter({
  assignment: adminProcedure
    .input(
      z.object({
        assignmentId: idSchema,
        questionId: idSchema.optional(),
        scope: z.enum(["assignment", "test"]).default("assignment"),
        threshold: z
          .number()
          .min(0.5, "De drempel is minstens 50%.")
          .max(1, "De drempel is hoogstens 100%.")
          .default(0.7),
      }),
    )
    .query(async ({ ctx, input }) => {
      const a = await getAssignmentOrThrow(ctx.db, input.assignmentId);
      const [test] = await ctx.db
        .select({ title: tests.title })
        .from(tests)
        .where(eq(tests.id, a.testId));
      const questionRows = await ctx.db
        .select({
          id: questions.id,
          title: questions.title,
          type: questions.type,
          data: questions.data,
        })
        .from(questions)
        .where(eq(questions.testId, a.testId))
        .orderBy(asc(questions.position), asc(questions.createdAt));
      const codeQuestions = questionRows
        .map((q, i) => ({ ...q, number: i + 1 }))
        .filter((q) => q.type === "code");
      if (
        input.questionId &&
        !codeQuestions.some((q) => q.id === input.questionId)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Kies een programmeervraag uit deze toets.",
        });
      }
      const selected = input.questionId
        ? codeQuestions.filter((q) => q.id === input.questionId)
        : codeQuestions;

      // Afnames in scope: this one, or every afname of the same test.
      const scopeRows =
        input.scope === "test"
          ? await ctx.db
              .select({
                id: assignments.id,
                classId: assignments.classId,
                className: classes.name,
              })
              .from(assignments)
              .innerJoin(classes, eq(classes.id, assignments.classId))
              .where(eq(assignments.testId, a.testId))
          : await ctx.db
              .select({
                id: assignments.id,
                classId: assignments.classId,
                className: classes.name,
              })
              .from(assignments)
              .innerJoin(classes, eq(classes.id, assignments.classId))
              .where(eq(assignments.id, a.id));
      const classNameByAssignment = new Map(
        scopeRows.map((r) => [r.id, r.className]),
      );

      const attemptRows = scopeRows.length
        ? await ctx.db
            .select({
              id: attempts.id,
              assignmentId: attempts.assignmentId,
              userId: attempts.userId,
              attemptNumber: attempts.attemptNumber,
              status: attempts.status,
              name: user.name,
              studentNumber: user.username,
            })
            .from(attempts)
            .innerJoin(user, eq(user.id, attempts.userId))
            .where(
              and(
                inArray(
                  attempts.assignmentId,
                  scopeRows.map((r) => r.id),
                ),
                eq(attempts.status, "submitted"),
              ),
            )
        : [];
      // One attempt per student per afname.
      const chosen = scopeRows.flatMap((s) => [
        ...representativeAttempts(
          attemptRows.filter((r) => r.assignmentId === s.id),
        ).values(),
      ]);
      const attemptById = new Map(chosen.map((r) => [r.id, r]));

      const selectedIds = selected.map((q) => q.id);
      const attemptIds = chosen.map((r) => r.id);
      const [answerRows, pasteRows] =
        attemptIds.length && selectedIds.length
          ? await Promise.all([
              ctx.db
                .select({
                  id: answers.id,
                  attemptId: answers.attemptId,
                  questionId: answers.questionId,
                  response: answers.response,
                })
                .from(answers)
                .where(
                  and(
                    inArray(answers.attemptId, attemptIds),
                    inArray(answers.questionId, selectedIds),
                  ),
                ),
              ctx.db
                .select({
                  attemptId: attemptEvents.attemptId,
                  questionId: sql<
                    string | null
                  >`${attemptEvents.details}->>'questionId'`,
                  count: sql<number>`count(*)::int`,
                })
                .from(attemptEvents)
                .where(
                  and(
                    inArray(attemptEvents.attemptId, attemptIds),
                    eq(attemptEvents.type, "paste"),
                  ),
                )
                .groupBy(
                  attemptEvents.attemptId,
                  sql`${attemptEvents.details}->>'questionId'`,
                ),
            ])
          : [[], []];
      const pastes = new Map(
        pasteRows.map((p) => [`${p.attemptId}:${p.questionId}`, p.count]),
      );

      const result = selected.map((q) => {
        const data = safeCodeData(q.data);
        const forQuestion = answerRows.filter((r) => r.questionId === q.id);
        const byAnswerId = new Map(forQuestion.map((r) => [r.id, r]));
        const compared = compareSubmissions(
          forQuestion.map((r) => ({ id: r.id, code: codeOf(r.response) })),
          {
            starterCode: data?.starterCode ?? "",
            solution: data?.solution ?? null,
            threshold: input.threshold,
          },
        );
        const side = (answerId: string): SimilaritySide | null => {
          const ans = byAnswerId.get(answerId);
          const at = ans ? attemptById.get(ans.attemptId) : undefined;
          if (!ans || !at) return null;
          return {
            answerId,
            attemptId: at.id,
            assignmentId: at.assignmentId,
            studentId: at.userId,
            name: at.name,
            studentNumber: at.studentNumber,
            className: classNameByAssignment.get(at.assignmentId) ?? "",
            pasteCount: pastes.get(`${at.id}:${q.id}`) ?? 0,
          };
        };
        const pairs = compared.pairs.flatMap((p) => {
          const left = side(p.a);
          if (!left) return [];
          const right =
            p.b === SOLUTION_ID ? ({ solution: true } as const) : side(p.b);
          if (!right) return [];
          // The same student in two afnames (e.g. a herkansing) is no pair.
          if (!("solution" in right) && right.studentId === left.studentId)
            return [];
          return [
            {
              a: left,
              b: right,
              score: p.score,
              jaccard: p.jaccard,
              identicalStructure: p.identicalStructure,
              exact: p.exact,
            },
          ];
        });
        return {
          questionId: q.id,
          number: q.number,
          title: q.title,
          analyzed: compared.analyzed,
          skippedShort: compared.skippedShort.length,
          truncated: compared.truncated,
          pairs,
        };
      });

      auditRead(ctx, {
        action: "similarity.viewed",
        subjectType: "assignment",
        subjectId: a.id,
        details: {
          scope: input.scope,
          questionId: input.questionId ?? null,
          attemptsCount: chosen.length,
        },
      });

      return {
        assignment: {
          id: a.id,
          title: a.title?.trim() || test?.title || "Afname",
          testId: a.testId,
          classId: a.classId,
        },
        scope: input.scope,
        threshold: input.threshold,
        afnameCount: scopeRows.length,
        codeQuestions: codeQuestions.map((q) => ({
          questionId: q.id,
          number: q.number,
          title: q.title,
        })),
        questions: result,
      };
    }),

  /** Two answers (or an answer and the model solution) side by side. */
  pair: adminProcedure
    .input(
      z.object({
        answerIdA: idSchema,
        answerIdB: z.union([idSchema, z.literal(SOLUTION_ID)]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const ids =
        input.answerIdB === SOLUTION_ID
          ? [input.answerIdA]
          : [input.answerIdA, input.answerIdB];
      const rows = await ctx.db
        .select({
          answerId: answers.id,
          response: answers.response,
          attemptId: attempts.id,
          attemptStatus: attempts.status,
          assignmentId: attempts.assignmentId,
          studentId: user.id,
          name: user.name,
          studentNumber: user.username,
          className: classes.name,
          testId: assignments.testId,
          questionId: questions.id,
          questionType: questions.type,
          questionTitle: questions.title,
          questionData: questions.data,
        })
        .from(answers)
        .innerJoin(attempts, eq(attempts.id, answers.attemptId))
        .innerJoin(assignments, eq(assignments.id, attempts.assignmentId))
        .innerJoin(classes, eq(classes.id, assignments.classId))
        .innerJoin(user, eq(user.id, attempts.userId))
        .innerJoin(questions, eq(questions.id, answers.questionId))
        .where(inArray(answers.id, ids));
      const left = rows.find((r) => r.answerId === input.answerIdA);
      const right =
        input.answerIdB === SOLUTION_ID
          ? null
          : rows.find((r) => r.answerId === input.answerIdB);
      if (!left || (input.answerIdB !== SOLUTION_ID && !right)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dit antwoord bestaat niet (meer).",
        });
      }
      if (
        left.questionType !== "code" ||
        (right &&
          (right.questionType !== "code" ||
            right.testId !== left.testId ||
            right.questionId !== left.questionId))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Je kunt alleen antwoorden op dezelfde programmeervraag vergelijken.",
        });
      }
      const data = safeCodeData(left.questionData);
      const codeA = codeOf(left.response);
      const codeB = right ? codeOf(right.response) : (data?.solution ?? "");
      const compared = comparePair(codeA, codeB, {
        starterCode: data?.starterCode ?? "",
      });
      const order = await ctx.db
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.testId, left.testId))
        .orderBy(asc(questions.position), asc(questions.createdAt));
      // Two named students' code side by side: log it for each of them.
      for (const side of right ? [left, right] : [left]) {
        auditRead(ctx, {
          action: "attempt.viewed",
          subjectType: "attempt",
          subjectId: side.attemptId,
          subjectUserId: side.studentId,
          subjectLabel: side.studentNumber || null,
          details: { via: "similarity", answerId: side.answerId },
        });
      }
      const sideOf = (r: typeof left) => ({
        answerId: r.answerId,
        attemptId: r.attemptId,
        assignmentId: r.assignmentId,
        studentId: r.studentId,
        name: r.name,
        studentNumber: r.studentNumber,
        className: r.className,
        code: codeOf(r.response),
      });
      return {
        question: {
          id: left.questionId,
          number: order.findIndex((q) => q.id === left.questionId) + 1,
          title: left.questionTitle,
        },
        a: sideOf(left),
        b: right ? sideOf(right) : { solution: true as const, code: codeB },
        score: compared.score,
        jaccard: compared.jaccard,
        identicalStructure: compared.identicalStructure,
        exact: compared.exact,
        linesA: compared.linesA,
        linesB: compared.linesB,
        rangesA: toRanges(compared.linesA),
        rangesB: toRanges(compared.linesB),
      };
    }),
});
