/**
 * Creating questions from other questions or from portable JSON:
 *  - insertPortableTest: a new draft test from an export or an example;
 *  - copyQuestionsToTest: copy questions (question bank) to another test.
 *
 * Both refresh the ids inside the question data, enforce the input limits
 * (QUESTION_INPUT_LIMITS) and MAX_QUESTIONS_PER_TEST, and run inside the
 * caller's transaction.
 */
import { TRPCError } from "@trpc/server";
import { asc, count, eq, inArray, sql } from "drizzle-orm";
import {
  parseQuestionData,
  type QuestionType,
  questionDataSchemas,
} from "@/lib/questions/schema";
import { normalizeTags } from "@/lib/questions/tags";
import { refreshDataIds } from "@/lib/questions/templates";
import {
  assertQuestionInputLimits,
  MAX_QUESTIONS_PER_TEST,
  type PortableTest,
  type SolutionCheck,
} from "@/lib/questions/validate";
import type { DB } from "@/server/db";
import { questions, tests } from "@/server/db/schema";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

/** Stored question data, or the type's defaults when it is corrupt. */
function parsedData(type: QuestionType, data: unknown) {
  const parsed = questionDataSchemas[type].safeParse(data ?? {});
  return parsed.success ? parsed.data : parseQuestionData(type, {});
}

function tooBig(questionNumber: number, issues: string[]): TRPCError {
  return new TRPCError({
    code: "BAD_REQUEST",
    message: `Vraag ${questionNumber}: ${issues[0]}`,
  });
}

/** Insert a portable test as a new draft owned by `userId`. */
export async function insertPortableTest(
  tx: Executor,
  portable: PortableTest,
  userId: string,
): Promise<{ id: string; questionCount: number }> {
  if (portable.questions.length > MAX_QUESTIONS_PER_TEST) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Een toets kan maximaal ${MAX_QUESTIONS_PER_TEST} vragen hebben.`,
    });
  }
  portable.questions.forEach((q, i) => {
    const issues = assertQuestionInputLimits(q.type, q.data, {
      title: q.title,
      prompt: q.prompt,
    });
    if (issues.length > 0) throw tooBig(i + 1, issues);
  });

  const [created] = await tx
    .insert(tests)
    .values({
      title: portable.test.title,
      description: portable.test.description,
      topic: portable.test.topic || null,
      status: "draft",
      createdById: userId,
    })
    .returning({ id: tests.id });
  if (portable.questions.length > 0) {
    await tx.insert(questions).values(
      portable.questions.map((q, position) => ({
        testId: created.id,
        position,
        type: q.type,
        title: q.title,
        prompt: q.prompt,
        points: q.points,
        tags: normalizeTags(q.tags ?? []),
        data: refreshDataIds(q.type, q.data) as Record<string, unknown>,
      })),
    );
  }
  return { id: created.id, questionCount: portable.questions.length };
}

/**
 * Copy questions (in the given order) to the end of `targetTestId`, with
 * fresh data ids and `sourceQuestionId` pointing at the root original.
 * Throws NOT_FOUND for a missing test or question and PRECONDITION_FAILED
 * when the target would get more than MAX_QUESTIONS_PER_TEST questions.
 */
export async function copyQuestionsToTest(
  tx: Executor,
  questionIds: readonly string[],
  targetTestId: string,
): Promise<(typeof questions.$inferSelect)[]> {
  const ids = [...new Set(questionIds)];
  if (ids.length === 0) return [];

  // Row lock: two copies into the same test can't both pass the limit check.
  const [target] = await tx
    .select({ id: tests.id })
    .from(tests)
    .where(eq(tests.id, targetTestId))
    .for("update");
  if (!target) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze toets bestaat niet (meer).",
    });
  }

  const originals = await tx
    .select()
    .from(questions)
    .where(inArray(questions.id, ids));
  if (originals.length !== ids.length) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Een of meer gekozen vragen bestaan niet (meer).",
    });
  }
  const byId = new Map(originals.map((q) => [q.id, q]));
  const ordered = ids.map((id) => byId.get(id) as (typeof originals)[number]);

  const [{ n }] = await tx
    .select({ n: count() })
    .from(questions)
    .where(eq(questions.testId, targetTestId));
  if (n + ordered.length > MAX_QUESTIONS_PER_TEST) {
    const room = Math.max(0, MAX_QUESTIONS_PER_TEST - n);
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        room === 0
          ? `Deze toets heeft al ${MAX_QUESTIONS_PER_TEST} vragen; meer kan niet.`
          : `Een toets kan maximaal ${MAX_QUESTIONS_PER_TEST} vragen hebben. Je kunt er nog ${room} toevoegen.`,
    });
  }

  ordered.forEach((q, i) => {
    const issues = assertQuestionInputLimits(q.type, q.data, {
      title: q.title,
      prompt: q.prompt,
    });
    if (issues.length > 0) throw tooBig(i + 1, issues);
  });

  const [{ maxPosition }] = await tx
    .select({
      maxPosition: sql<number>`coalesce(max(${questions.position}), -1)::int`,
    })
    .from(questions)
    .where(eq(questions.testId, targetTestId));

  const created = await tx
    .insert(questions)
    .values(
      ordered.map((q, i) => ({
        testId: targetTestId,
        position: maxPosition + 1 + i,
        type: q.type,
        title:
          q.testId === targetTestId
            ? `${q.title} (kopie)`.slice(0, 300)
            : q.title,
        prompt: q.prompt,
        points: q.points,
        tags: normalizeTags(q.tags ?? []),
        sourceQuestionId: q.sourceQuestionId ?? q.id,
        data: refreshDataIds(q.type, parsedData(q.type, q.data)) as Record<
          string,
          unknown
        >,
        // The fingerprint ignores ids, so the check stays valid.
        solutionCheck: q.solutionCheck as SolutionCheck | null,
      })),
    )
    .returning();

  await renumberPositions(tx, targetTestId);
  await tx
    .update(tests)
    .set({ updatedAt: new Date() })
    .where(eq(tests.id, targetTestId));

  return created;
}

/** Positions 0..n-1 in the current order (only rows that change). */
async function renumberPositions(tx: Executor, testId: string) {
  const rows = await tx
    .select({ id: questions.id, position: questions.position })
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position), asc(questions.createdAt));
  const changed = rows
    .map((r, index) => ({ id: r.id, index, position: r.position }))
    .filter((r) => r.position !== r.index);
  if (changed.length === 0) return;
  const cases = sql.join(
    changed.map(
      (c) => sql`when ${questions.id} = ${c.id} then ${c.index}::int`,
    ),
    sql` `,
  );
  await tx
    .update(questions)
    .set({ position: sql`case ${cases} else ${questions.position} end` })
    .where(
      inArray(
        questions.id,
        changed.map((c) => c.id),
      ),
    );
}
