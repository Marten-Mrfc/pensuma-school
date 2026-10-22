/**
 * Vragenbank: search every question of every toets by text, type and topic
 * (tags), copy questions into a test, and start from an example test.
 * Teachers only. Questions are shared between all teachers of the school,
 * like tests.
 */
import { TRPCError } from "@trpc/server";
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { EXAMPLE_TEST_IDS, EXAMPLE_TESTS } from "@/lib/questions/examples";
import { markdownExcerpt } from "@/lib/questions/excerpt";
import {
  type CodeQuestionData,
  questionTypeSchema,
} from "@/lib/questions/schema";
import { normalizeTags } from "@/lib/questions/tags";
import {
  type SolutionCheck,
  solutionCheckState,
} from "@/lib/questions/validate";
import {
  countTestAttempts,
  requireTest,
  safeQuestionData,
} from "@/server/api/routers/test";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { answers, attempts, questions, tests } from "@/server/db/schema";
import {
  copyQuestionsToTest,
  insertPortableTest,
} from "@/server/services/portable-tests";

const PAGE_SIZE_MAX = 50;

/** Escape LIKE wildcards in user input. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const bankRouter = createTRPCRouter({
  /** Search questions; newest edits first, paginated with an offset cursor. */
  search: adminProcedure
    .input(
      z.object({
        query: z.string().trim().max(200).optional(),
        types: z.array(questionTypeSchema).max(3).optional(),
        tags: z.array(z.string().max(100)).max(10).optional(),
        /** Leave out the questions of this test (the one being edited). */
        excludeTestId: z.uuid().optional(),
        includeArchived: z.boolean().optional(),
        cursor: z.number().int().min(0).max(100_000).nullish(),
        limit: z.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: SQL[] = [];
      if (!input.includeArchived) where.push(ne(tests.status, "archived"));
      if (input.excludeTestId) {
        where.push(ne(questions.testId, input.excludeTestId));
      }
      if (input.types?.length) where.push(inArray(questions.type, input.types));
      const tags = normalizeTags(input.tags ?? []);
      if (tags.length > 0) {
        where.push(
          sql`${questions.tags} @> ARRAY[${sql.join(
            tags.map((t) => sql`${t}`),
            sql`, `,
          )}]::text[]`,
        );
      }
      if (input.query) {
        const term = `%${likeEscape(input.query)}%`;
        const match = or(
          ilike(questions.title, term),
          ilike(questions.prompt, term),
        );
        if (match) where.push(match);
      }

      const offset = input.cursor ?? 0;
      const rows = await ctx.db
        .select({
          id: questions.id,
          title: questions.title,
          type: questions.type,
          points: questions.points,
          tags: questions.tags,
          prompt: questions.prompt,
          data: questions.data,
          solutionCheck: questions.solutionCheck,
          testId: tests.id,
          testTitle: tests.title,
          testStatus: tests.status,
        })
        .from(questions)
        .innerJoin(tests, eq(tests.id, questions.testId))
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(questions.updatedAt), desc(questions.id))
        .limit(input.limit + 1)
        .offset(offset);

      const page = rows.slice(0, input.limit);
      const ids = page.map((r) => r.id);
      const usageRows =
        ids.length === 0
          ? []
          : await ctx.db
              .select({
                questionId: answers.questionId,
                students: sql<number>`count(distinct ${attempts.userId})::int`,
                avgPercentage: sql<
                  number | null
                >`avg(coalesce(${answers.manualScore}, ${answers.autoScore}) / nullif(${answers.maxScore}, 0) * 100) filter (where ${answers.status} = 'graded' or ${answers.manualScore} is not null)`.mapWith(
                  (v) => (v == null ? null : Number(v)),
                ),
              })
              .from(answers)
              .innerJoin(attempts, eq(attempts.id, answers.attemptId))
              .where(
                and(
                  inArray(answers.questionId, ids),
                  eq(attempts.status, "submitted"),
                  ne(answers.status, "empty"),
                ),
              )
              .groupBy(answers.questionId);
      const usage = new Map(usageRows.map((u) => [u.questionId, u]));

      return {
        items: page.map((r) => {
          const u = usage.get(r.id);
          return {
            id: r.id,
            title: r.title,
            type: r.type,
            points: r.points,
            tags: r.tags,
            promptExcerpt: markdownExcerpt(r.prompt, 180),
            test: { id: r.testId, title: r.testTitle, status: r.testStatus },
            usage: {
              answers: u?.students ?? 0,
              avgPercentage:
                u?.avgPercentage == null ? null : Math.round(u.avgPercentage),
            },
            solutionChecked:
              r.type === "code"
                ? solutionCheckState(
                    safeQuestionData("code", r.data) as CodeQuestionData,
                    r.solutionCheck as SolutionCheck | null,
                  ) === "passed"
                : null,
          };
        }),
        nextCursor: rows.length > input.limit ? offset + input.limit : null,
      };
    }),

  /** One question with its full teacher data, for the preview pane. */
  get: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ question: questions, testTitle: tests.title })
        .from(questions)
        .innerJoin(tests, eq(tests.id, questions.testId))
        .where(eq(questions.id, input.id));
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze vraag bestaat niet (meer).",
        });
      }
      const q = row.question;
      return {
        id: q.id,
        type: q.type,
        title: q.title,
        prompt: q.prompt,
        points: q.points,
        tags: q.tags,
        data: safeQuestionData(q.type, q.data) as Record<string, unknown>,
        testId: q.testId,
        testTitle: row.testTitle,
      };
    }),

  /** Every tag in use (not counting archived tests), most used first. */
  tags: adminProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.execute<{ tag: string; count: number }>(sql`
      select t.tag as tag, count(*)::int as count
      from ${questions}
      inner join ${tests} on ${tests.id} = ${questions.testId}
      cross join lateral unnest(${questions.tags}) as t(tag)
      where ${tests.status} <> 'archived'
      group by t.tag
      order by count(*) desc, t.tag asc
      limit 200
    `);
    return result.rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  }),

  /** Copy questions (in this order) to the end of a test. */
  copyToTest: adminProcedure
    .input(
      z.object({
        questionIds: z
          .array(z.uuid())
          .min(1, "Kies minstens één vraag.")
          .max(50, "Je kunt maximaal 50 vragen tegelijk toevoegen."),
        targetTestId: z.uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.transaction(async (tx) => {
        await requireTest(tx, input.targetTestId);
        return copyQuestionsToTest(tx, input.questionIds, input.targetTestId);
      });
      const attemptCount = await countTestAttempts(ctx.db, input.targetTestId);
      return {
        created: created.length,
        questionIds: created.map((q) => q.id),
        hasAttempts: attemptCount > 0,
      };
    }),

  /** The ready-made example tests. */
  examples: adminProcedure.query(() =>
    EXAMPLE_TESTS.map((e) => {
      const qs = e.test.questions;
      return {
        id: e.id,
        title: e.test.test.title,
        description: e.test.test.description,
        summary: e.summary,
        level: e.level,
        questionCount: qs.length,
        totalPoints: qs.reduce((s, q) => s + q.points, 0),
        typeCounts: {
          code: qs.filter((q) => q.type === "code").length,
          multiple_choice: qs.filter((q) => q.type === "multiple_choice")
            .length,
          open: qs.filter((q) => q.type === "open").length,
        },
        tags: [...new Set(qs.flatMap((q) => q.tags ?? []))].slice(0, 8),
        questionTitles: qs.map((q) => q.title),
      };
    }),
  ),

  /** Add an example as a new draft test. */
  importExample: adminProcedure
    .input(z.object({ exampleId: z.enum(EXAMPLE_TEST_IDS) }))
    .mutation(async ({ ctx, input }) => {
      const example = EXAMPLE_TESTS.find((e) => e.id === input.exampleId);
      if (!example) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze voorbeeldtoets bestaat niet.",
        });
      }
      const { id } = await ctx.db.transaction((tx) =>
        insertPortableTest(tx, example.test, ctx.user.id),
      );
      return { id };
    }),
});
