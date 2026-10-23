/**
 * Hints and model solutions for students.
 *
 * Exams never offer either (studentSettings applies that rule). Hints are
 * revealed one by one, in order, and stored on the answer (hintsUsed); the
 * grading service subtracts their penalty. Model solutions only appear
 * after handing in, when results are visible and the afname's
 * showSolutions setting allows it.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, studentProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
  answers,
  attemptEvents,
  attempts,
  questions,
} from "@/server/db/schema";
import {
  effectiveAssignmentStatus,
  resultsVisible,
} from "@/server/services/assignment-status";
import { stillWorking } from "@/server/services/assignment-targets";
import {
  autoSubmitIfExpired,
  isAttemptExpired,
} from "@/server/services/attempts";
import {
  loadOwnedAttempt,
  notFound,
  studentSettings,
  typedData,
} from "@/server/services/student-access";

const idSchema = z.uuid({ error: "Deze link klopt niet." });
const hintIdSchema = z.string().min(1).max(64);

type HintUse = { id: string; at: string };

const badRequest = (message: string) =>
  new TRPCError({ code: "BAD_REQUEST", message });

/** The first hint (in the teacher's order) that hasn't been revealed. */
function nextHint<T extends { id: string }>(
  hints: readonly T[],
  used: readonly HintUse[],
): T | null {
  const seen = new Set(used.map((h) => h.id));
  return hints.find((h) => !seen.has(h.id)) ?? null;
}

export const helpRouter = createTRPCRouter({
  /**
   * Hint status per code question of the attempt: how many there are, the
   * revealed ones (with text) and the next one (id and penalty only).
   */
  hints: studentProcedure
    .input(z.object({ attemptId: idSchema }))
    .query(async ({ ctx, input }) => {
      const row = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      const settings = studentSettings(row.assignment);
      const order = row.attempt.questionOrder ?? [];
      if (!settings.allowHints || order.length === 0) {
        return { enabled: false, questions: {} };
      }
      const qRows = await db
        .select({
          id: questions.id,
          type: questions.type,
          data: questions.data,
        })
        .from(questions)
        .where(and(inArray(questions.id, order), eq(questions.type, "code")));
      const used = new Map(
        (
          await db
            .select({
              questionId: answers.questionId,
              hintsUsed: answers.hintsUsed,
            })
            .from(answers)
            .where(eq(answers.attemptId, row.attempt.id))
        ).map((a) => [a.questionId, a.hintsUsed ?? []]),
      );

      const result: Record<
        string,
        {
          total: number;
          revealed: { id: string; text: string; penalty: number; at: string }[];
          next: { id: string; penalty: number } | null;
        }
      > = {};
      for (const q of qRows) {
        const typed = typedData(q);
        if (typed.type !== "code" || typed.data.hints.length === 0) continue;
        const hints = typed.data.hints;
        const hintsUsed = used.get(q.id) ?? [];
        const usedAt = new Map(hintsUsed.map((h) => [h.id, h.at]));
        const next = nextHint(hints, hintsUsed);
        result[q.id] = {
          total: hints.length,
          revealed: hints
            .filter((h) => usedAt.has(h.id))
            .map((h) => ({
              id: h.id,
              text: h.text,
              penalty: h.penalty,
              at: usedAt.get(h.id) ?? "",
            })),
          next: next ? { id: next.id, penalty: next.penalty } : null,
        };
      }
      return { enabled: true, questions: result };
    }),

  /**
   * Reveal the next hint of a question. Idempotent: revealing a hint that
   * was already revealed returns it again without a second penalty.
   */
  revealHint: studentProcedure
    .input(
      z.object({
        attemptId: idSchema,
        questionId: idSchema,
        hintId: hintIdSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      const { attempt } = row;
      if (attempt.status !== "in_progress") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Deze poging is al ingeleverd.",
        });
      }
      const now = new Date();
      if (isAttemptExpired(attempt, row.assignment, now)) {
        await autoSubmitIfExpired(attempt, row.assignment, now);
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "De tijd is om. Je kunt geen hints meer bekijken.",
        });
      }
      if (!studentSettings(row.assignment).allowHints) {
        throw badRequest("Bij deze toets kun je geen hints bekijken.");
      }
      if (!(attempt.questionOrder ?? []).includes(input.questionId)) {
        throw notFound("Deze vraag hoort niet bij deze toets.");
      }
      const [q] = await db
        .select()
        .from(questions)
        .where(eq(questions.id, input.questionId))
        .limit(1);
      if (!q) throw notFound("Deze vraag bestaat niet meer.");
      const typed = typedData(q);
      const hints = typed.type === "code" ? typed.data.hints : [];
      const hint = hints.find((h) => h.id === input.hintId);
      if (!hint) throw notFound("Deze hint bestaat niet.");

      // Older attempts may lack the answer row: create it empty.
      await db
        .insert(answers)
        .values({
          attemptId: attempt.id,
          questionId: q.id,
          status: "empty",
          maxScore: q.points,
        })
        .onConflictDoNothing({
          target: [answers.attemptId, answers.questionId],
        });

      const readUsed = async () => {
        const [ans] = await db
          .select({ hintsUsed: answers.hintsUsed })
          .from(answers)
          .where(
            and(
              eq(answers.attemptId, attempt.id),
              eq(answers.questionId, q.id),
            ),
          )
          .limit(1);
        return ans?.hintsUsed ?? [];
      };

      const used = await readUsed();
      if (used.some((h) => h.id === hint.id)) {
        return {
          text: hint.text,
          penalty: hint.penalty,
          alreadyRevealed: true,
        };
      }
      if (nextHint(hints, used)?.id !== hint.id) {
        throw badRequest("Bekijk eerst de vorige hint.");
      }

      // Guarded append: only when nobody changed the list meanwhile (two
      // tabs), so hints stay in order and are never stored twice.
      const entry: HintUse = { id: hint.id, at: now.toISOString() };
      const updated = await db
        .update(answers)
        .set({
          hintsUsed: sql`${answers.hintsUsed} || ${JSON.stringify([entry])}::jsonb`,
        })
        .where(
          and(
            eq(answers.attemptId, attempt.id),
            eq(answers.questionId, q.id),
            sql`jsonb_array_length(${answers.hintsUsed}) = ${used.length}`,
            sql`not (${answers.hintsUsed} @> ${JSON.stringify([{ id: hint.id }])}::jsonb)`,
          ),
        )
        .returning({ id: answers.id });

      if (updated.length === 0) {
        const again = await readUsed();
        if (again.some((h) => h.id === hint.id)) {
          return {
            text: hint.text,
            penalty: hint.penalty,
            alreadyRevealed: true,
          };
        }
        throw badRequest("Bekijk eerst de vorige hint.");
      }

      await db.insert(attemptEvents).values({
        attemptId: attempt.id,
        type: "hint_revealed",
        details: { questionId: q.id, hintId: hint.id, penalty: hint.penalty },
        createdAt: now,
      });
      await db
        .update(attempts)
        .set({ lastSeenAt: now })
        .where(eq(attempts.id, attempt.id));
      return { text: hint.text, penalty: hint.penalty, alreadyRevealed: false };
    }),

  /**
   * Model solutions (code) and model answers (open questions) of a handed-in
   * attempt, when the afname allows it:
   *  - after_attempts: every attempt used, or everything right;
   *  - after_close: the afname is closed and nobody (a classmate with
   *    verlengde tijd, a reopened attempt) is still working on it.
   * Never while another attempt of the student is running.
   */
  solutions: studentProcedure
    .input(z.object({ attemptId: idSchema }))
    .query(async ({ ctx, input }) => {
      const row = await loadOwnedAttempt(ctx.user.id, input.attemptId);
      const { attempt, assignment: a } = row;
      const settings = studentSettings(a);
      const none = (message: string | null) => ({
        available: false as const,
        message,
        solutions: {} as Record<
          string,
          { solution?: string; modelAnswer?: string } | null
        >,
      });

      if (settings.showSolutions === "never") return none(null);
      if (attempt.status !== "submitted") return none(null);
      // Classmates with verlengde tijd may still be working after the
      // close: the right answers wait until everyone has handed in.
      const now = new Date();
      const othersWorking = await stillWorking(db, a, now);
      if (!resultsVisible(a, now, othersWorking)) return none(null);
      const mine = await db
        .select({ status: attempts.status })
        .from(attempts)
        .where(
          and(
            eq(attempts.assignmentId, a.id),
            eq(attempts.userId, ctx.user.id),
          ),
        );
      if (mine.some((t) => t.status === "in_progress")) {
        return none(
          "Je bent nog met een andere poging bezig. Lever die eerst in.",
        );
      }

      let allowed = false;
      if (settings.showSolutions === "after_close") {
        const closed = effectiveAssignmentStatus(a, now) === "closed";
        allowed = closed && !othersWorking;
        if (!allowed) {
          return none(
            closed
              ? "De modeloplossingen zie je zodra iedereen klaar is met de toets."
              : "De modeloplossingen zie je zodra de toets gesloten is.",
          );
        }
      } else {
        const fullScore =
          attempt.gradingStatus !== "pending" &&
          attempt.score != null &&
          attempt.maxScore != null &&
          attempt.maxScore > 0 &&
          attempt.score >= attempt.maxScore - 1e-9;
        allowed = mine.length >= settings.maxAttempts || fullScore;
        if (!allowed) {
          return none(
            "De modeloplossingen zie je als je al je pogingen hebt gebruikt of alles goed hebt.",
          );
        }
      }

      const order = attempt.questionOrder ?? [];
      const qRows = order.length
        ? await db
            .select({
              id: questions.id,
              type: questions.type,
              data: questions.data,
            })
            .from(questions)
            .where(inArray(questions.id, order))
        : [];
      const solutions: Record<
        string,
        { solution?: string; modelAnswer?: string } | null
      > = {};
      for (const q of qRows) {
        const typed = typedData(q);
        if (typed.type === "code" && typed.data.solution.trim()) {
          solutions[q.id] = { solution: typed.data.solution };
        } else if (typed.type === "open" && typed.data.modelAnswer.trim()) {
          solutions[q.id] = { modelAnswer: typed.data.modelAnswer };
        } else {
          solutions[q.id] = null;
        }
      }
      return { available: true as const, message: null, solutions };
    }),
});
