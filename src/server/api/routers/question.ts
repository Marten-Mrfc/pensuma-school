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
import { normalizeTags } from "@/lib/questions/tags";
import {
  buildQuestionDraft,
  isQuestionTemplateId,
} from "@/lib/questions/templates";
import {
  assertQuestionInputLimits,
  MAX_POINTS_PER_QUESTION,
  MAX_QUESTIONS_PER_TEST,
  QUESTION_INPUT_LIMITS,
  type SolutionCheck,
  safeParseQuestionData,
  solutionFingerprint,
} from "@/lib/questions/validate";
import { assertNoActiveHolds } from "@/server/api/routers/assignment";
import {
  countTestAttempts,
  requireTest,
  safeQuestionData,
  touchTest,
} from "@/server/api/routers/test";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import type { DB } from "@/server/db";
import { answers, attempts, questions, user } from "@/server/db/schema";
import { gradeCode } from "@/server/grader";
import { type AuditContext, auditFromCtx } from "@/server/services/audit";
import { recomputeAttemptScore } from "@/server/services/grading";
import { copyQuestionsToTest } from "@/server/services/portable-tests";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Executor = DB | Tx;

/**
 * Audit a question deletion that removed students' answers: one summary
 * row for the question plus one row per student, so it appears under that
 * student in the audit log and in their own inzage export.
 */
async function auditQuestionDeleted(
  ctx: AuditContext,
  tx: Tx,
  question: { id: string; testId: string },
  rows: {
    attemptId: string;
    assignmentId: string;
    userId: string;
    studentNumber: string | null;
  }[],
) {
  const perStudent = new Map<
    string,
    { studentNumber: string | null; answers: number }
  >();
  for (const r of rows) {
    const entry = perStudent.get(r.userId);
    if (entry) entry.answers++;
    else
      perStudent.set(r.userId, { studentNumber: r.studentNumber, answers: 1 });
  }
  const base = {
    path: "question.delete",
    questionId: question.id,
    testId: question.testId,
  };
  await auditFromCtx(
    ctx,
    {
      action: "trpc.mutation",
      subjectType: "question",
      subjectId: question.id,
      details: {
        ...base,
        answersCount: rows.length,
        attemptsAffected: new Set(rows.map((r) => r.attemptId)).size,
        assignmentsAffected: new Set(rows.map((r) => r.assignmentId)).size,
        studentsCount: perStudent.size,
      },
    },
    tx,
  );
  for (const [userId, s] of perStudent) {
    await auditFromCtx(
      ctx,
      {
        action: "trpc.mutation",
        subjectType: "question",
        subjectId: question.id,
        subjectUserId: userId,
        subjectLabel: s.studentNumber,
        details: { ...base, answersCount: s.answers },
      },
      tx,
    );
  }
}

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

/** Throw BAD_REQUEST with the first Dutch limit message, if any. */
function enforceLimits(
  type: Parameters<typeof assertQuestionInputLimits>[0],
  data: unknown,
  fields: { title?: string; prompt?: string },
) {
  const issues = assertQuestionInputLimits(type, data, fields);
  if (issues.length > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: issues[0] });
  }
}

const tagsSchema = z
  .array(z.string().max(100, "Een onderwerp is te lang."))
  .max(50, "Te veel onderwerpen.");

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
      enforceLimits(draft.type, draft.data, {
        title: draft.title,
        prompt: draft.prompt,
      });
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
          .max(
            QUESTION_INPUT_LIMITS.title,
            "De titel is te lang (maximaal 300 tekens).",
          )
          .optional(),
        prompt: z
          .string()
          .max(
            QUESTION_INPUT_LIMITS.prompt,
            "De opdrachttekst is te lang (maximaal 20.000 tekens).",
          )
          .optional(),
        points: pointsSchema.optional(),
        tags: tagsSchema.optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const question = await requireQuestion(ctx.db, input.id);
      enforceLimits(question.type, input.data ?? {}, {
        title: input.title,
        prompt: input.prompt,
      });
      const patch: Partial<typeof questions.$inferInsert> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.prompt !== undefined) patch.prompt = input.prompt;
      if (input.points !== undefined) patch.points = input.points;
      if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
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
   * it, `force: true` is required (their answers to it are removed). Never
   * while a retention hold covers an afname or student with an answer to
   * it (`force` does not override that); the scores of handed-in attempts
   * are recomputed afterwards, so students and teacher see the same total.
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
      const affected = await ctx.db.transaction(async (tx) => {
        // Every attempt with an answer row for this question (the cascade
        // removes those rows).
        const rows = await tx
          .select({
            attemptId: attempts.id,
            attemptStatus: attempts.status,
            assignmentId: attempts.assignmentId,
            userId: attempts.userId,
            studentNumber: user.username,
          })
          .from(answers)
          .innerJoin(attempts, eq(attempts.id, answers.attemptId))
          .innerJoin(user, eq(user.id, attempts.userId))
          .where(eq(answers.questionId, input.id));
        if (rows.length) {
          await assertNoActiveHolds(
            tx,
            {
              assignmentIds: rows.map((r) => r.assignmentId),
              userIds: rows.map((r) => r.userId),
            },
            {
              afname: "een afname met antwoorden op deze vraag",
              consequence:
                "Je kunt de vraag daarom niet verwijderen, want dan gaan die antwoorden verloren.",
              remedy:
                "Laat de vraag in plaats daarvan vervallen via de toetsanalyse van de afname, of hef de blokkade eerst op onder Privacy › Bewaarblokkades.",
            },
          );
          await auditQuestionDeleted(ctx, tx, question, rows);
        }
        await tx.delete(questions).where(eq(questions.id, input.id));
        await renumber(tx, question.testId);
        await touchTest(tx, question.testId);
        return rows;
      });
      // Students see the stored attempt score: recompute it for handed-in
      // attempts (running ones are graded and totalled at the hand-in).
      const submitted = [
        ...new Set(
          affected
            .filter((r) => r.attemptStatus === "submitted")
            .map((r) => r.attemptId),
        ),
      ];
      for (const attemptId of submitted) {
        try {
          await recomputeAttemptScore(attemptId);
        } catch (error) {
          console.error("[question.delete] recompute failed", error);
        }
      }
      const attemptCount = await countTestAttempts(ctx.db, question.testId);
      return {
        id: input.id,
        answerCount,
        hasAttempts: attemptCount > 0,
        recomputedAttempts: submitted.length,
      };
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
            tags: original.tags,
            sourceQuestionId: original.sourceQuestionId ?? original.id,
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

  /**
   * Copy a question to the end of another test (fresh data ids,
   * `sourceQuestionId` = the root original).
   */
  copyToTest: adminProcedure
    .input(z.object({ id: z.uuid(), targetTestId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.transaction(async (tx) => {
        await requireQuestion(tx, input.id);
        return copyQuestionsToTest(tx, [input.id], input.targetTestId);
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
      if (result.status === "internal_error") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "De nakijkserver kon de code niet uitvoeren. Probeer het zo opnieuw of gebruik de snelle controle in de browser.",
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
