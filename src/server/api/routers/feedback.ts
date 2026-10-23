/**
 * Faster grading: feedback snippets ("Snelle opmerkingen"), grading several
 * answers at once (identical answers, rubric criteria) and the data the
 * grading view needs for criteria and grouping. Teachers only; every
 * teacher sees and edits only their own snippets.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { groupKey } from "@/lib/grading/answer-groups";
import { unknownRubricIds } from "@/lib/grading/rubric";
import type { OpenQuestionData, RubricItem } from "@/lib/questions/schema";
import { safeQuestionData } from "@/server/api/routers/test";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import type { DB } from "@/server/db";
import {
  answers,
  assignments,
  attempts,
  feedbackSnippets,
  questions,
  user,
} from "@/server/db/schema";
import { logServerError } from "@/server/privacy/error-log";
import {
  RESTRICTED_MESSAGE,
  restrictedUserIds,
} from "@/server/privacy/restriction";
import { auditFromCtx } from "@/server/services/audit";
import { recomputeAttemptScore } from "@/server/services/grading";

const MAX_SNIPPETS_PER_TEACHER = 500;

const snippetTextSchema = z
  .string()
  .trim()
  .min(1, "Schrijf eerst een opmerking.")
  .max(2000, "Een snelle opmerking mag hoogstens 2000 tekens lang zijn.");

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** NOT_FOUND unless the question exists (snippets may be tied to one). */
async function requireQuestion(db: DB, id: string) {
  const [q] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.id, id));
  if (!q) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze vraag bestaat niet (meer).",
    });
  }
}

function rubricItemsOf(type: string, data: unknown): RubricItem[] {
  if (type !== "open") return [];
  return (safeQuestionData("open", data) as OpenQuestionData).rubricItems;
}

export const feedbackRouter = createTRPCRouter({
  /** My snippets for this question and my general ones, most used first. */
  list: adminProcedure
    .input(z.object({ questionId: z.uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const questionId = input?.questionId;
      const rows = await ctx.db
        .select({
          id: feedbackSnippets.id,
          text: feedbackSnippets.text,
          questionId: feedbackSnippets.questionId,
          useCount: feedbackSnippets.useCount,
        })
        .from(feedbackSnippets)
        .where(
          and(
            eq(feedbackSnippets.ownerId, ctx.user.id),
            questionId
              ? sql`(${feedbackSnippets.questionId} is null or ${feedbackSnippets.questionId} = ${questionId})`
              : isNull(feedbackSnippets.questionId),
          ),
        )
        .orderBy(
          desc(feedbackSnippets.useCount),
          desc(feedbackSnippets.updatedAt),
        )
        .limit(MAX_SNIPPETS_PER_TEACHER);
      return {
        forQuestion: rows.filter((r) => r.questionId !== null),
        general: rows.filter((r) => r.questionId === null),
      };
    }),

  create: adminProcedure
    .input(
      z.object({ text: snippetTextSchema, questionId: z.uuid().optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.questionId) await requireQuestion(ctx.db, input.questionId);
      const [{ n }] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(feedbackSnippets)
        .where(eq(feedbackSnippets.ownerId, ctx.user.id));
      if (n >= MAX_SNIPPETS_PER_TEACHER) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Je hebt al ${MAX_SNIPPETS_PER_TEACHER} snelle opmerkingen. Verwijder er eerst een paar.`,
        });
      }
      const questionId = input.questionId ?? null;
      const [existing] = await ctx.db
        .select({ id: feedbackSnippets.id })
        .from(feedbackSnippets)
        .where(
          and(
            eq(feedbackSnippets.ownerId, ctx.user.id),
            eq(feedbackSnippets.text, input.text),
            questionId
              ? eq(feedbackSnippets.questionId, questionId)
              : isNull(feedbackSnippets.questionId),
          ),
        );
      if (existing) return { id: existing.id, created: false };
      const [row] = await ctx.db
        .insert(feedbackSnippets)
        .values({ ownerId: ctx.user.id, questionId, text: input.text })
        .returning({ id: feedbackSnippets.id });
      return { id: row.id, created: true };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        text: snippetTextSchema.optional(),
        /** null = make it a general snippet. */
        questionId: z.uuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.questionId) await requireQuestion(ctx.db, input.questionId);
      const patch: Partial<typeof feedbackSnippets.$inferInsert> = {};
      if (input.text !== undefined) patch.text = input.text;
      if (input.questionId !== undefined) patch.questionId = input.questionId;
      const [row] = await ctx.db
        .update(feedbackSnippets)
        .set(patch)
        .where(
          and(
            eq(feedbackSnippets.id, input.id),
            eq(feedbackSnippets.ownerId, ctx.user.id),
          ),
        )
        .returning({ id: feedbackSnippets.id });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze opmerking bestaat niet (meer).",
        });
      }
      return { id: row.id };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .delete(feedbackSnippets)
        .where(
          and(
            eq(feedbackSnippets.id, input.id),
            eq(feedbackSnippets.ownerId, ctx.user.id),
          ),
        )
        .returning({ id: feedbackSnippets.id });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze opmerking bestaat niet (meer).",
        });
      }
      return { id: row.id };
    }),

  /** A snippet was used: count it, so the most used ones come first. */
  used: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(feedbackSnippets)
        .set({ useCount: sql`${feedbackSnippets.useCount} + 1` })
        .where(
          and(
            eq(feedbackSnippets.id, input.id),
            eq(feedbackSnippets.ownerId, ctx.user.id),
          ),
        );
      return { id: input.id };
    }),

  /**
   * Grade one or more answers with the same score (identical answers, or
   * one answer with rubric criteria). Every answer is checked first; any
   * problem rejects the whole request. Answers of students whose
   * processing is restricted (AVG art. 18) are skipped and counted.
   */
  gradeMany: adminProcedure
    .input(
      z.object({
        answerIds: z
          .array(z.uuid())
          .min(1, "Kies minstens één antwoord.")
          .max(200, "Je kunt maximaal 200 antwoorden tegelijk beoordelen."),
        manualScore: z
          .number()
          .min(0, "De score kan niet negatief zijn.")
          .max(1000),
        feedback: z
          .string()
          .max(10_000, "De feedback is te lang (maximaal 10.000 tekens).")
          .nullish(),
        rubricChecked: z.array(z.string().min(1).max(64)).max(20).optional(),
        /**
         * Also grade the answers of students whose processing is restricted
         * (AVG art. 18), e.g. to rectify a disputed score. Recorded in the
         * log. Without it those answers are skipped (`skippedRestricted`).
         */
        overrideRestriction: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const requested = [...new Set(input.answerIds)];
      const allRows = await ctx.db
        .select({
          id: answers.id,
          attemptId: answers.attemptId,
          maxScore: answers.maxScore,
          previousScore: answers.manualScore,
          attemptStatus: attempts.status,
          userId: attempts.userId,
          studentNumber: user.username,
          questionType: questions.type,
          questionData: questions.data,
        })
        .from(answers)
        .innerJoin(attempts, eq(attempts.id, answers.attemptId))
        .innerJoin(user, eq(user.id, attempts.userId))
        .innerJoin(questions, eq(questions.id, answers.questionId))
        .where(inArray(answers.id, requested));
      if (allRows.length !== requested.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Een of meer antwoorden bestaan niet (meer).",
        });
      }
      // AVG art. 18: a restricted student's scores stay as they are, unless
      // the teacher explicitly overrides the restriction.
      const restricted = await restrictedUserIds(
        ctx.db,
        allRows.map((r) => r.userId),
      );
      const overridden = !!input.overrideRestriction && restricted.size > 0;
      const rows = overridden
        ? allRows
        : allRows.filter((r) => !restricted.has(r.userId));
      if (rows.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            restricted.size === 1
              ? RESTRICTED_MESSAGE
              : "Voor deze leerlingen is de verwerking beperkt (AVG art. 18). Hef de beperking op via Privacy & gegevens.",
        });
      }
      const ids = rows.map((r) => r.id);
      const manualScore = round2(input.manualScore);
      for (const row of rows) {
        if (row.attemptStatus !== "submitted") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Een leerling is nog bezig met deze poging. Beoordeel na het inleveren.",
          });
        }
        if (manualScore > row.maxScore + 1e-9) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `De score mag hoogstens ${row.maxScore.toLocaleString("nl-NL")} zijn.`,
          });
        }
        if (input.rubricChecked?.length) {
          const unknown = unknownRubricIds(
            rubricItemsOf(row.questionType, row.questionData),
            input.rubricChecked,
          );
          if (unknown.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Een of meer criteria horen niet (meer) bij deze vraag. Vernieuw de pagina.",
            });
          }
        }
      }

      const feedback =
        input.feedback === undefined
          ? undefined
          : input.feedback?.trim()
            ? input.feedback
            : null;
      const now = new Date();
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(answers)
          .set({
            manualScore,
            status: "graded",
            reviewedById: ctx.user.id,
            reviewedAt: now,
            ...(feedback !== undefined ? { feedback } : {}),
            ...(input.rubricChecked !== undefined
              ? { rubricChecked: [...new Set(input.rubricChecked)] }
              : {}),
          })
          .where(inArray(answers.id, ids));
        // One row per answer whose score changed, with the student, like
        // review.setManualScore: it shows up under that student in the
        // audit log and in their own inzage export.
        let audited = 0;
        for (const row of rows) {
          if (row.previousScore === manualScore) continue;
          audited++;
          await auditFromCtx(
            ctx,
            {
              action: "answer.score_changed",
              subjectType: "answer",
              subjectId: row.id,
              subjectUserId: row.userId,
              subjectLabel: row.studentNumber,
              details: {
                answerId: row.id,
                attemptId: row.attemptId,
                from: row.previousScore,
                to: manualScore,
                bulk: true,
                ...(overridden && restricted.has(row.userId)
                  ? { restrictionOverridden: true }
                  : {}),
              },
            },
            tx,
          );
        }
        if (audited === 0) {
          // Only feedback or criteria changed: one summary row.
          await auditFromCtx(
            ctx,
            {
              action: "trpc.mutation",
              subjectType: "answer",
              subjectId: ids.length === 1 ? ids[0] : null,
              details: {
                path: "feedback.gradeMany",
                answerIdsCount: ids.length,
                ...(overridden ? { restrictionOverridden: true } : {}),
              },
            },
            tx,
          );
        }
      });

      const attemptIds = [...new Set(rows.map((r) => r.attemptId))];
      let recomputed = true;
      for (const attemptId of attemptIds) {
        try {
          await recomputeAttemptScore(attemptId);
        } catch (error) {
          recomputed = false;
          logServerError("feedback.grade_many_recompute_failed", error, {
            attemptId,
          });
        }
      }
      return {
        updated: ids.length,
        attemptIds,
        manualScore,
        recomputed,
        /** Answers left alone: the student's processing is restricted. */
        skippedRestricted: requested.length - ids.length,
      };
    }),

  /**
   * For the grading view: the question's rubric criteria plus, per
   * submitted answer, the ticked criteria and a key to group identical
   * answers.
   */
  groups: adminProcedure
    .input(z.object({ assignmentId: z.uuid(), questionId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ type: questions.type, data: questions.data })
        .from(questions)
        .innerJoin(assignments, eq(assignments.testId, questions.testId))
        .where(
          and(
            eq(questions.id, input.questionId),
            eq(assignments.id, input.assignmentId),
          ),
        );
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze vraag hoort niet bij deze afname.",
        });
      }
      const answerRows = await ctx.db
        .select({
          answerId: answers.id,
          response: answers.response,
          rubricChecked: answers.rubricChecked,
        })
        .from(answers)
        .innerJoin(attempts, eq(attempts.id, answers.attemptId))
        .where(
          and(
            eq(answers.questionId, input.questionId),
            eq(attempts.assignmentId, input.assignmentId),
            eq(attempts.status, "submitted"),
          ),
        )
        .orderBy(asc(answers.createdAt));
      return {
        rubricItems: rubricItemsOf(row.type, row.data),
        items: answerRows.map((a) => ({
          answerId: a.answerId,
          rubricChecked: a.rubricChecked ?? null,
          groupKey: groupKey(row.type, a.response),
        })),
      };
    }),

  /**
   * For a single answer (e.g. in the attempt review): its question, the
   * question's criteria and the ticked criteria.
   */
  answerContext: adminProcedure
    .input(z.object({ answerId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          questionId: questions.id,
          type: questions.type,
          data: questions.data,
          rubricChecked: answers.rubricChecked,
        })
        .from(answers)
        .innerJoin(questions, eq(questions.id, answers.questionId))
        .where(eq(answers.id, input.answerId));
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dit antwoord bestaat niet (meer).",
        });
      }
      return {
        questionId: row.questionId,
        type: row.type,
        rubricItems: rubricItemsOf(row.type, row.data),
        rubricChecked: row.rubricChecked ?? null,
      };
    }),
});
