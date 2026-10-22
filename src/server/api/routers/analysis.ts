/**
 * Toetsanalyse for teachers: p-values, Rit/Rir and Cronbach's alpha per
 * afname, common code errors, the answer distribution of multiple-choice
 * questions, and "vraag laten vervallen" (neutralising a question).
 */
import { inArray } from "drizzle-orm";
import { z } from "zod";
import {
  aggregateChoices,
  aggregateCodeResults,
  type ChoiceSummary,
  type CodeErrorSummary,
} from "@/lib/analytics/common-errors";
import { alphaLevel, isSmallSample, itemFlags } from "@/lib/analytics/flags";
import { analyzeItems } from "@/lib/analytics/item-analysis";
import {
  type GradingResult,
  parseQuestionData,
  type QuestionType,
} from "@/lib/questions/schema";
import { computeResults } from "@/server/api/routers/review";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { answers, questions } from "@/server/db/schema";
import { neutralizeQuestion } from "@/server/services/neutralization";

const idSchema = z.uuid("Ongeldige id.");

function safeData<T extends QuestionType>(type: T, data: unknown) {
  try {
    return parseQuestionData(type, data);
  } catch {
    return null;
  }
}

export const analysisRouter = createTRPCRouter({
  assignment: adminProcedure
    .input(z.object({ assignmentId: idSchema }))
    .query(async ({ ctx, input }) => {
      const results = await computeResults(ctx.db, input.assignmentId);
      const submitted = results.rows.filter(
        (r) => r.attempt?.status === "submitted",
      );
      const questionIds = results.questions.map((q) => q.id);
      const analysis = analyzeItems(
        submitted.map((r) => ({
          items: Object.fromEntries(
            questionIds.map((qid) => {
              const cell = r.perQuestion[qid];
              return [
                qid,
                cell ? { score: cell.score, max: cell.maxScore } : null,
              ];
            }),
          ),
        })),
        questionIds,
      );
      const statsById = new Map(analysis.items.map((i) => [i.questionId, i]));
      const reviewById = new Map(
        results.stats.perQuestion.map((s) => [s.questionId, s.needsReview]),
      );

      // Stored responses and grading results of the submitted attempts.
      const answerIds = submitted.flatMap((r) =>
        Object.values(r.perQuestion)
          .filter((c): c is NonNullable<typeof c> => c != null)
          .map((c) => c.answerId),
      );
      const [answerRows, questionRows] = await Promise.all([
        answerIds.length
          ? ctx.db
              .select({
                id: answers.id,
                questionId: answers.questionId,
                response: answers.response,
                result: answers.result,
              })
              .from(answers)
              .where(inArray(answers.id, answerIds))
          : Promise.resolve([]),
        questionIds.length
          ? ctx.db
              .select({
                id: questions.id,
                type: questions.type,
                data: questions.data,
              })
              .from(questions)
              .where(inArray(questions.id, questionIds))
          : Promise.resolve([]),
      ]);
      const dataById = new Map(questionRows.map((q) => [q.id, q]));
      const answersByQuestion = new Map<string, typeof answerRows>();
      for (const a of answerRows) {
        const list = answersByQuestion.get(a.questionId) ?? [];
        list.push(a);
        answersByQuestion.set(a.questionId, list);
      }

      const codeErrors: {
        questionId: string;
        number: number;
        title: string;
        summary: CodeErrorSummary;
      }[] = [];
      const choices: {
        questionId: string;
        number: number;
        title: string;
        summary: ChoiceSummary;
      }[] = [];

      const items = results.questions.map((q, index) => {
        const stats = statsById.get(q.id);
        const number = index + 1;
        const list = answersByQuestion.get(q.id) ?? [];
        const raw = dataById.get(q.id);
        if (q.type === "code" && raw) {
          const data = safeData("code", raw.data);
          codeErrors.push({
            questionId: q.id,
            number,
            title: q.title,
            summary: aggregateCodeResults(
              list.map((a) => {
                const r = a.result as GradingResult | null;
                return r?.kind === "code" ? r : null;
              }),
              data ? { tests: data.tests, checks: data.checks } : undefined,
            ),
          });
        } else if (q.type === "multiple_choice" && raw) {
          const data = safeData("multiple_choice", raw.data);
          if (data) {
            choices.push({
              questionId: q.id,
              number,
              title: q.title,
              summary: aggregateChoices(
                data.options,
                list.map((a) => {
                  const selected = (a.response as { selected?: unknown } | null)
                    ?.selected;
                  return Array.isArray(selected)
                    ? selected.filter((s): s is string => typeof s === "string")
                    : null;
                }),
                data.multiple,
              ),
            });
          }
        }
        const p = stats?.p ?? null;
        const rir = stats?.rir ?? null;
        // Answers that still wait for the teacher count as 0 points for now.
        const pendingReview = reviewById.get(q.id) ?? 0;
        return {
          questionId: q.id,
          number,
          title: q.title,
          type: q.type,
          points: q.points,
          p,
          sd: stats?.sd ?? null,
          rit: stats?.rit ?? null,
          rir,
          excluded: stats?.excluded ?? true,
          pendingReview,
          flags: pendingReview ? [] : itemFlags({ p, rir }),
          neutralized: results.neutralized[q.id] ?? null,
        };
      });

      return {
        assignment: {
          id: results.assignment.id,
          title: results.assignment.title,
          className: results.assignment.className,
          testTitle: results.assignment.testTitle,
          effectiveStatus: results.assignment.effectiveStatus,
          mode: results.assignment.mode,
        },
        test: {
          ...analysis.test,
          alphaLevel: alphaLevel(analysis.test.alpha),
          students: results.stats.students,
          smallSample: isSmallSample(analysis.test.n),
        },
        items,
        codeErrors,
        choices,
      };
    }),

  neutralizeQuestion: adminProcedure
    .input(
      z.object({
        assignmentId: idSchema,
        questionId: idSchema,
        mode: z.enum(["full_points", "drop"]).nullable(),
      }),
    )
    .mutation(({ ctx, input }) => neutralizeQuestion(ctx, input)),
});
