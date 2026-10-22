/**
 * Vragen (questions) inside a toets: create from templates, edit, reorder,
 * copy, and check the model solution of code questions.
 *
 * Edits are allowed when students already made attempts (teachers fix
 * mistakes), but every mutation returns `hasAttempts` so the UI can warn
 * (see EDIT_WITH_ATTEMPTS_WARNING).
 */
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, gt, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import {
  type CodeGradingResult,
  type CodeQuestionData,
  questionTypeSchema,
} from "@/lib/questions/schema";
import {
  buildQuestionDraft,
  isQuestionTemplateId,
  refreshDataIds,
} from "@/lib/questions/templates";
import {
  MAX_POINTS_PER_QUESTION,
  MAX_QUESTIONS_PER_TEST,
  type SolutionCheck,
  safeParseQuestionData,
  solutionFingerprint,
} from "@/lib/questions/validate";
import {
  countTestAttempts,
  requireTest,
  safeQuestionData,
  touchTest,
} from "@/server/api/routers/test";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import type { DB } from "@/server/db";
import { answers, questions } from "@/server/db/schema";
import { gradeCode } from "@/server/grader";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Executor = DB | Tx;

async function requireQuestion(db: Executor, id: string) {
  const [question] = await db
    .select()
    .from(questions)
    .where(eq(questions.id, id));
  if (!question) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze vraag bestaat niet (meer).",
    });
  }
  return question;
}

async function questionCount(db: Executor, testId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(questions)
    .where(eq(questions.testId, testId));
  return row?.n ?? 0;
}

async function assertRoom(db: Executor, testId: string, adding = 1) {
  const n = await questionCount(db, testId);
  if (n + adding > MAX_QUESTIONS_PER_TEST) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Een toets kan maximaal ${MAX_QUESTIONS_PER_TEST} vragen hebben.`,
    });
  }
}

async function nextPosition(db: Executor, testId: string) {
  const [row] = await db
    .select({ p: max(questions.position) })
    .from(questions)
    .where(eq(questions.testId, testId));
  return row?.p == null ? 0 : row.p + 1;
}

/** Re-number positions 0..n-1 in the current order. */
async function renumber(db: Executor, testId: string) {
  const rows = await db
    .select({ id: questions.id, position: questions.position })
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position), asc(questions.createdAt));
  await setPositions(
    db,
    rows.map((r) => r.id),
    rows.map((r) => r.position),
  );
}

/** Write position = index for each id (only rows that changed). */
async function setPositions(
  db: Executor,
  orderedIds: string[],
  current?: number[],
) {
  const changed = orderedIds
    .map((id, index) => ({ id, index }))
    .filter(({ index }) => current?.[index] !== index);
  if (changed.length === 0) return;
  const cases = sql.join(
    changed.map(
      ({ id, index }) => sql`when ${questions.id} = ${id} then ${index}::int`,
    ),
    sql` `,
  );
  await db
    .update(questions)
    .set({ position: sql`case ${cases} else ${questions.position} end` })
    .where(
      inArray(
        questions.id,
        changed.map((c) => c.id),
      ),
    );
}

function copyTitle(title: string) {
  return `${title} (kopie)`.slice(0, 300);
}

const pointsSchema = z
  .number()
  .min(0, "Het aantal punten mag niet negatief zijn.")
  .max(
    MAX_POINTS_PER_QUESTION,
    `Een vraag kan hoogstens ${MAX_POINTS_PER_QUESTION} punten hebben.`,
  );

export const questionRouter = createTRPCRouter({
  /** Add a question (from a template) at the end of the test. */
  create: adminProcedure
    .input(
      z.object({
        testId: z.uuid(),
        type: questionTypeSchema,
        templateId: z.string().max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.templateId && !isQuestionTemplateId(input.templateId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Onbekend vraagsjabloon.",
        });
      }
      let draft: ReturnType<typeof buildQuestionDraft>;
      try {
        draft = buildQuestionDraft(input.type, input.templateId);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Dit sjabloon hoort bij een ander vraagtype.",
        });
      }
      const created = await ctx.db.transaction(async (tx) => {
        await requireTest(tx, input.testId);
        await assertRoom(tx, input.testId);
        const position = await nextPosition(tx, input.testId);
        const [row] = await tx
          .insert(questions)
          .values({
            testId: input.testId,
            position,
            type: draft.type,
            title: draft.title,
            prompt: draft.prompt,
            points: draft.points,
            data: draft.data as Record<string, unknown>,
          })
          .returning();
        await touchTest(tx, input.testId);
        return row;
      });
      const attemptCount = await countTestAttempts(ctx.db, input.testId);
      return { question: created, hasAttempts: attemptCount > 0 };
    }),

  /** Autosave target. `data` is validated against the question type. */
  update: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        title: z
          .string()
          .max(300, "De titel mag hoogstens 300 tekens lang zijn.")
          .optional(),
        prompt: z
          .string()
          .max(50_000, "De opdrachttekst is te lang.")
          .optional(),
        points: pointsSchema.optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const question = await requireQuestion(ctx.db, input.id);
      const patch: Partial<typeof questions.$inferInsert> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.prompt !== undefined) patch.prompt = input.prompt;
      if (input.points !== undefined) patch.points = input.points;
      if (input.data !== undefined) {
        const parsed = safeParseQuestionData(question.type, input.data);
        if (!parsed.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Niet opgeslagen: ${parsed.messages[0] ?? "ongeldige gegevens"}.`,
          });
        }
        patch.data = parsed.data as Record<string, unknown>;
      }
      const [updated] = await ctx.db
        .update(questions)
        .set(patch)
        .where(eq(questions.id, input.id))
        .returning();
      await touchTest(ctx.db, question.testId);
      const attemptCount = await countTestAttempts(ctx.db, question.testId);
      return { question: updated, hasAttempts: attemptCount > 0 };
    }),

  /**
   * Delete a question and re-number the rest. If students already answered
   * it, `force: true` is required (their answers to it are removed).
   */
  delete: adminProcedure
    .input(z.object({ id: z.uuid(), force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const question = await requireQuestion(ctx.db, input.id);
      const [answerRow] = await ctx.db
        .select({ n: count() })
        .from(answers)
        .where(eq(answers.questionId, input.id));
      const answerCount = answerRow?.n ?? 0;
      if (answerCount > 0 && !input.force) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Deze vraag is al ${answerCount} keer beantwoord. Bij verwijderen gaan die antwoorden verloren.`,
        });
      }
      await ctx.db.transaction(async (tx) => {
        await tx.delete(questions).where(eq(questions.id, input.id));
        await renumber(tx, question.testId);
        await touchTest(tx, question.testId);
      });
      const attemptCount = await countTestAttempts(ctx.db, question.testId);
      return { id: input.id, answerCount, hasAttempts: attemptCount > 0 };
    }),

  /** Set the order of all questions of a test. */
  reorder: adminProcedure
    .input(
      z.object({
        testId: z.uuid(),
        orderedIds: z.array(z.uuid()).max(MAX_QUESTIONS_PER_TEST * 2),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await requireTest(tx, input.testId);
        const rows = await tx
          .select({ id: questions.id, position: questions.position })
          .from(questions)
          .where(eq(questions.testId, input.testId));
        const existing = new Set(rows.map((r) => r.id));
        const unique = new Set(input.orderedIds);
        if (
          unique.size !== input.orderedIds.length ||
          unique.size !== existing.size ||
          input.orderedIds.some((id) => !existing.has(id))
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "De vragenlijst is intussen gewijzigd. Vernieuw de pagina en probeer het opnieuw.",
          });
        }
        const byId = new Map(rows.map((r) => [r.id, r.position]));
        await setPositions(
          tx,
          input.orderedIds,
          input.orderedIds.map((id) => byId.get(id) ?? -1),
        );
        await touchTest(tx, input.testId);
      });
      const attemptCount = await countTestAttempts(ctx.db, input.testId);
      return { hasAttempts: attemptCount > 0 };
    }),

  /** Copy a question; the copy is placed right after the original. */
  duplicate: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.transaction(async (tx) => {
        const original = await requireQuestion(tx, input.id);
        await assertRoom(tx, original.testId);
        await tx
          .update(questions)
          .set({ position: sql`${questions.position} + 1` })
          .where(
            and(
              eq(questions.testId, original.testId),
              gt(questions.position, original.position),
            ),
          );
        const [row] = await tx
          .insert(questions)
          .values({
            testId: original.testId,
            position: original.position + 1,
            type: original.type,
            title: copyTitle(original.title),
            prompt: original.prompt,
            points: original.points,
            data: original.data,
            solutionCheck: original.solutionCheck,
          })
          .returning();
        await renumber(tx, original.testId);
        await touchTest(tx, original.testId);
        return row;
      });
      const attemptCount = await countTestAttempts(ctx.db, created.testId);
      return { question: created, hasAttempts: attemptCount > 0 };
    }),

  /** Copy a question to the end of another test. */
  copyToTest: adminProcedure
    .input(z.object({ id: z.uuid(), targetTestId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.transaction(async (tx) => {
        const original = await requireQuestion(tx, input.id);
        await requireTest(tx, input.targetTestId);
        await assertRoom(tx, input.targetTestId);
        const position = await nextPosition(tx, input.targetTestId);
        const data = refreshDataIds(
          original.type,
          safeQuestionData(original.type, original.data),
        );
        const [row] = await tx
          .insert(questions)
          .values({
            testId: input.targetTestId,
            position,
            type: original.type,
            title:
              input.targetTestId === original.testId
                ? copyTitle(original.title)
                : original.title,
            prompt: original.prompt,
            points: original.points,
            data: data as Record<string, unknown>,
            solutionCheck: original.solutionCheck,
          })
          .returning();
        await touchTest(tx, input.targetTestId);
        return row;
      });
      const attemptCount = await countTestAttempts(ctx.db, input.targetTestId);
      return {
        question: created,
        targetTestId: input.targetTestId,
        hasAttempts: attemptCount > 0,
      };
    }),

  /**
   * "Vraag controleren": grade the stored model solution against ALL tests
   * (including hidden ones) on the server and remember the outcome, so
   * publishing can warn about unchecked or failing solutions.
   */
  checkSolution: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const question = await requireQuestion(ctx.db, input.id);
      if (question.type !== "code") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Alleen programmeervragen hebben een modeloplossing.",
        });
      }
      const data = safeQuestionData("code", question.data) as CodeQuestionData;
      if (!data.solution.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Schrijf eerst een modeloplossing.",
        });
      }
      if (data.tests.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Voeg eerst minstens één test toe.",
        });
      }
      let result: CodeGradingResult;
      try {
        result = await gradeCode({
          code: data.solution,
          tests: data.tests,
          checks: data.checks,
          timeLimitMs: data.timeLimitMs,
        });
      } catch (error) {
        console.error("[question.checkSolution] grader failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "De nakijkserver is nu niet beschikbaar. Gebruik de snelle controle in de browser of probeer het later opnieuw.",
        });
      }
      const check = buildCheck(data, result, "server");
      await ctx.db
        .update(questions)
        .set({ solutionCheck: check })
        .where(eq(questions.id, input.id));
      return { result, check };
    }),

  /**
   * Store the outcome of a check that ran in the browser (Pyodide, same
   * semantics). Only recorded when `hash` matches the saved data, so an
   * unsaved edit can never be marked as checked.
   */
  recordSolutionCheck: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        hash: z.string().min(1).max(64),
        passed: z.boolean(),
        passedTests: z.number().int().min(0),
        totalTests: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const question = await requireQuestion(ctx.db, input.id);
      if (question.type !== "code") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Alleen programmeervragen hebben een modeloplossing.",
        });
      }
      const data = safeQuestionData("code", question.data) as CodeQuestionData;
      if (solutionFingerprint(data) !== input.hash) {
        return { recorded: false as const, check: question.solutionCheck };
      }
      const check: SolutionCheck = {
        hash: input.hash,
        passed: input.passed && input.passedTests === input.totalTests,
        passedTests: input.passedTests,
        totalTests: input.totalTests,
        checkedAt: new Date().toISOString(),
        source: "browser",
      };
      await ctx.db
        .update(questions)
        .set({ solutionCheck: check })
        .where(eq(questions.id, input.id));
      return { recorded: true as const, check };
    }),
});

function buildCheck(
  data: CodeQuestionData,
  result: CodeGradingResult,
  source: SolutionCheck["source"],
): SolutionCheck {
  const passedTests = result.tests.filter((t) => t.passed).length;
  const totalTests = data.tests.length;
  const checksOk = result.checks.every((c) => c.passed);
  return {
    hash: solutionFingerprint(data),
    passed:
      result.tests.length === totalTests &&
      passedTests === totalTests &&
      checksOk,
    passedTests,
    totalTests,
    checkedAt: new Date().toISOString(),
    source,
  };
}
