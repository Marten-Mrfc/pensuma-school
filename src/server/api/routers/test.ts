/**
 * Toetsen (tests) for teachers: list, builder data, publishing, sharing.
 */
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  parseQuestionData,
  type QuestionType,
  questionDataSchemas,
} from "@/lib/questions/schema";
import {
  capitalize,
  PORTABLE_TEST_FORMAT,
  PORTABLE_TEST_VERSION,
  type PortableTest,
  parsePortableTest,
  type SolutionCheck,
  type TestProblem,
  validateTest,
} from "@/lib/questions/validate";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import type { DB } from "@/server/db";
import {
  assignments,
  attempts,
  questions,
  tests,
  user,
} from "@/server/db/schema";
import { insertPortableTest } from "@/server/services/portable-tests";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Executor = DB | Tx;

const testStatusSchema = z.enum(["draft", "published", "archived"]);

const titleSchema = z
  .string()
  .trim()
  .min(1, "Geef de toets een titel.")
  .max(200, "De titel mag hoogstens 200 tekens lang zijn.");
const descriptionSchema = z.string().max(20_000, "De beschrijving is te lang.");
const topicSchema = z.string().trim().max(200, "Het onderwerp is te lang.");

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

export async function requireTest(db: Executor, id: string) {
  const [test] = await db.select().from(tests).where(eq(tests.id, id));
  if (!test) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze toets bestaat niet (meer).",
    });
  }
  return test;
}

/** Number of attempts (by students) on any assignment of this test. */
export async function countTestAttempts(
  db: Executor,
  testId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(attempts)
    .innerJoin(assignments, eq(attempts.assignmentId, assignments.id))
    .where(eq(assignments.testId, testId));
  return row?.n ?? 0;
}

/** Bump `updatedAt` so lists sort by "last edited". */
export async function touchTest(db: Executor, testId: string) {
  await db
    .update(tests)
    .set({ updatedAt: new Date() })
    .where(eq(tests.id, testId));
}

/** Parse stored question data; fall back to defaults if it is corrupt. */
export function safeQuestionData(type: QuestionType, data: unknown) {
  const parsed = questionDataSchemas[type].safeParse(data ?? {});
  return parsed.success ? parsed.data : parseQuestionData(type, {});
}

async function loadQuestions(db: Executor, testId: string) {
  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position), asc(questions.createdAt));
  return rows.map((q) => ({
    ...q,
    data: safeQuestionData(q.type, q.data) as Record<string, unknown>,
  }));
}

function toPortable(
  test: { title: string; description: string; topic: string | null },
  rows: Awaited<ReturnType<typeof loadQuestions>>,
): PortableTest {
  return {
    format: PORTABLE_TEST_FORMAT,
    version: PORTABLE_TEST_VERSION,
    exportedAt: new Date().toISOString(),
    test: {
      title: test.title,
      description: test.description,
      topic: test.topic,
    },
    questions: rows.map(
      (q) =>
        ({
          type: q.type,
          title: q.title,
          prompt: q.prompt,
          points: q.points,
          ...(q.tags.length > 0 ? { tags: q.tags } : {}),
          data: q.data,
        }) as PortableTest["questions"][number],
    ),
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Router                                   */
/* -------------------------------------------------------------------------- */

export const testRouter = createTRPCRouter({
  /** All tests with counts, newest edits first. */
  list: adminProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(200).optional(),
          /** "active" = draft + published. Omit for every status. */
          status: z
            .enum(["draft", "published", "archived", "active", "all"])
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const qStats = ctx.db
        .select({
          testId: questions.testId,
          questionCount: count().as("question_count"),
          totalPoints:
            sql<number>`coalesce(sum(${questions.points}), 0)::float8`.as(
              "total_points",
            ),
          codeCount:
            sql<number>`count(*) filter (where ${questions.type} = 'code')::int`.as(
              "code_count",
            ),
          choiceCount:
            sql<number>`count(*) filter (where ${questions.type} = 'multiple_choice')::int`.as(
              "choice_count",
            ),
          openCount:
            sql<number>`count(*) filter (where ${questions.type} = 'open')::int`.as(
              "open_count",
            ),
        })
        .from(questions)
        .groupBy(questions.testId)
        .as("q_stats");

      const aStats = ctx.db
        .select({
          testId: assignments.testId,
          assignmentCount: count().as("assignment_count"),
        })
        .from(assignments)
        .groupBy(assignments.testId)
        .as("a_stats");

      const attemptStats = ctx.db
        .select({
          testId: assignments.testId,
          attemptCount: count().as("attempt_count"),
        })
        .from(attempts)
        .innerJoin(assignments, eq(attempts.assignmentId, assignments.id))
        .groupBy(assignments.testId)
        .as("att_stats");

      const filters: SQL[] = [];
      const status = input?.status;
      if (status === "active")
        filters.push(inArray(tests.status, ["draft", "published"]));
      else if (status && status !== "all")
        filters.push(eq(tests.status, status));
      if (input?.search) {
        const term = `%${input.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const match = or(
          ilike(tests.title, term),
          ilike(tests.topic, term),
          ilike(tests.description, term),
        );
        if (match) filters.push(match);
      }

      const rows = await ctx.db
        .select({
          id: tests.id,
          title: tests.title,
          description: tests.description,
          status: tests.status,
          topic: tests.topic,
          createdAt: tests.createdAt,
          updatedAt: tests.updatedAt,
          createdById: tests.createdById,
          createdByName: user.name,
          questionCount: sql<number>`coalesce(${qStats.questionCount}, 0)::int`,
          totalPoints: sql<number>`coalesce(${qStats.totalPoints}, 0)::float8`,
          codeCount: sql<number>`coalesce(${qStats.codeCount}, 0)::int`,
          choiceCount: sql<number>`coalesce(${qStats.choiceCount}, 0)::int`,
          openCount: sql<number>`coalesce(${qStats.openCount}, 0)::int`,
          assignmentCount: sql<number>`coalesce(${aStats.assignmentCount}, 0)::int`,
          attemptCount: sql<number>`coalesce(${attemptStats.attemptCount}, 0)::int`,
        })
        .from(tests)
        .leftJoin(user, eq(tests.createdById, user.id))
        .leftJoin(qStats, eq(qStats.testId, tests.id))
        .leftJoin(aStats, eq(aStats.testId, tests.id))
        .leftJoin(attemptStats, eq(attemptStats.testId, tests.id))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(tests.updatedAt));

      return rows;
    }),

  /** One test with all questions (full teacher data, in order). */
  get: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ test: tests, createdByName: user.name })
        .from(tests)
        .leftJoin(user, eq(tests.createdById, user.id))
        .where(eq(tests.id, input.id));
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze toets bestaat niet (meer).",
        });
      }
      const [questionRows, [assignmentRow], attemptCount] = await Promise.all([
        loadQuestions(ctx.db, input.id),
        ctx.db
          .select({ n: count() })
          .from(assignments)
          .where(eq(assignments.testId, input.id)),
        countTestAttempts(ctx.db, input.id),
      ]);
      return {
        ...row.test,
        createdByName: row.createdByName,
        questions: questionRows,
        assignmentCount: assignmentRow?.n ?? 0,
        attemptCount,
        hasAttempts: attemptCount > 0,
      };
    }),

  create: adminProcedure
    .input(
      z.object({
        title: titleSchema,
        description: descriptionSchema.optional(),
        topic: topicSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(tests)
        .values({
          title: input.title,
          description: input.description ?? "",
          topic: input.topic || null,
          status: "draft",
          createdById: ctx.user.id,
        })
        .returning({ id: tests.id });
      return { id: created.id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        title: titleSchema.optional(),
        description: descriptionSchema.optional(),
        topic: topicSchema.nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireTest(ctx.db, input.id);
      const patch: Partial<typeof tests.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined)
        patch.description = input.description;
      if (input.topic !== undefined) patch.topic = input.topic || null;
      const [updated] = await ctx.db
        .update(tests)
        .set(patch)
        .where(eq(tests.id, input.id))
        .returning();
      const attemptCount = await countTestAttempts(ctx.db, input.id);
      return { test: updated, hasAttempts: attemptCount > 0 };
    }),

  /**
   * Change the status. Publishing runs the publish validation:
   *  - errors → not published, `problems` lists them (`message`: "Vraag 3: …",
   *    plus `questionId` / `questionNumber` to jump to the question)
   *  - warnings only → not published unless `acknowledgeWarnings` is true
   */
  setStatus: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        status: testStatusSchema,
        acknowledgeWarnings: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const test = await requireTest(ctx.db, input.id);
      let problems: TestProblem[] = [];
      let warnings: TestProblem[] = [];

      if (input.status === "published") {
        const rows = await loadQuestions(ctx.db, input.id);
        const validation = validateTest({
          title: test.title,
          questions: rows.map((q) => ({
            id: q.id,
            type: q.type,
            title: q.title,
            prompt: q.prompt,
            points: q.points,
            data: q.data,
            solutionCheck: q.solutionCheck as SolutionCheck | null,
          })),
        });
        problems = validation.errors;
        warnings = validation.warnings;
        if (
          problems.length > 0 ||
          (warnings.length > 0 && !input.acknowledgeWarnings)
        ) {
          return { changed: false, status: test.status, problems, warnings };
        }
      }

      if (test.status !== input.status) {
        await ctx.db
          .update(tests)
          .set({ status: input.status, updatedAt: new Date() })
          .where(eq(tests.id, input.id));
      }
      return { changed: true, status: input.status, problems, warnings };
    }),

  /** Deep copy as a new draft: "<titel> (kopie)". */
  duplicate: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const test = await requireTest(tx, input.id);
        const rows = await loadQuestions(tx, input.id);
        const [created] = await tx
          .insert(tests)
          .values({
            title: `${test.title} (kopie)`.slice(0, 200),
            description: test.description,
            topic: test.topic,
            status: "draft",
            createdById: ctx.user.id,
          })
          .returning({ id: tests.id });
        if (rows.length > 0) {
          await tx.insert(questions).values(
            rows.map((q, position) => ({
              testId: created.id,
              position,
              type: q.type,
              title: q.title,
              prompt: q.prompt,
              points: q.points,
              data: q.data,
              tags: q.tags,
              sourceQuestionId: q.sourceQuestionId ?? q.id,
              solutionCheck: q.solutionCheck,
            })),
          );
        }
        return { id: created.id };
      });
    }),

  /** Delete a test. Refused once students have made attempts (archive instead). */
  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireTest(ctx.db, input.id);
      const attemptCount = await countTestAttempts(ctx.db, input.id);
      if (attemptCount > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Deze toets is al ${attemptCount} keer gemaakt door leerlingen. Archiveer de toets in plaats van hem te verwijderen; dan blijven de resultaten bewaard.`,
        });
      }
      await ctx.db.delete(tests).where(eq(tests.id, input.id));
      return { id: input.id };
    }),

  /** Portable JSON to share a test with other teachers/schools. */
  exportJson: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const test = await requireTest(ctx.db, input.id);
      const rows = await loadQuestions(ctx.db, input.id);
      return toPortable(test, rows);
    }),

  /** Create a new draft test from exported JSON (string or object). */
  importJson: adminProcedure
    .input(
      z.object({
        json: z.union([
          z.string().max(5_000_000),
          z.record(z.string(), z.unknown()),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const parsed = parsePortableTest(input.json);
      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `Dit bestand kan niet worden geïmporteerd. ${parsed.messages.slice(0, 3).map(capitalize).join(". ")}.`.replace(
              /\.\.$/,
              ".",
            ),
        });
      }
      const portable = parsed.data;
      return ctx.db.transaction((tx) =>
        insertPortableTest(tx, portable, ctx.user.id),
      );
    }),
});
