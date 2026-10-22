import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import type { NeutralizationMode } from "@/lib/grading/scoring";
import type { DB } from "@/server/db";
import {
  answers,
  assignments,
  attempts,
  questionNeutralizations,
  questions,
} from "@/server/db/schema";
import { type AuditContext, auditFromCtx } from "@/server/services/audit";
import {
  recomputeAttemptScore,
  rescoreAnswers,
} from "@/server/services/grading";

/**
 * "Vraag laten vervallen" (neutralise a question) for one afname:
 *
 *  - full_points  everybody gets the points: the previous manual scores are
 *                 saved, then manualScore = maxScore and status graded;
 *  - drop         the question no longer counts: maxScore 0, autoScore 0,
 *                 manualScore null, status graded (previous values saved);
 *  - null         undo: restore the saved manual scores, delete the row and
 *                 rescore the affected answers.
 *
 * Only submitted attempts are touched; attempts that are still running get
 * the neutralisation when they are graded (see grading.ts). Afterwards every
 * affected attempt's total is recomputed. Audited as question.neutralized.
 */

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type NeutralizeInput = {
  assignmentId: string;
  questionId: string;
  mode: NeutralizationMode | null;
};

export type NeutralizeResult = {
  mode: NeutralizationMode | null;
  affectedAnswers: number;
  affectedAttempts: number;
};

/** Answers of `questionId` in the submitted attempts of an afname. */
async function submittedAnswers(
  tx: Tx | DB,
  assignmentId: string,
  questionId: string,
) {
  return tx
    .select({
      id: answers.id,
      attemptId: answers.attemptId,
      manualScore: answers.manualScore,
    })
    .from(answers)
    .innerJoin(attempts, eq(attempts.id, answers.attemptId))
    .where(
      and(
        eq(attempts.assignmentId, assignmentId),
        eq(attempts.status, "submitted"),
        eq(answers.questionId, questionId),
      ),
    );
}

/** Put the saved manual scores back (answers not in `previous` keep theirs). */
async function restoreManualScores(
  tx: Tx,
  previous: Record<string, number | null>,
) {
  for (const [answerId, manualScore] of Object.entries(previous)) {
    await tx
      .update(answers)
      .set({ manualScore })
      .where(eq(answers.id, answerId));
  }
}

export async function neutralizeQuestion(
  ctx: AuditContext & {
    db: DB;
    user: { id: string; name: string; role: string };
  },
  input: NeutralizeInput,
): Promise<NeutralizeResult> {
  const { db } = ctx;
  const [assignment] = await db
    .select({ id: assignments.id, testId: assignments.testId })
    .from(assignments)
    .where(eq(assignments.id, input.assignmentId));
  if (!assignment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze afname bestaat niet (meer).",
    });
  }
  const [question] = await db
    .select({ id: questions.id, points: questions.points })
    .from(questions)
    .where(
      and(
        eq(questions.id, input.questionId),
        eq(questions.testId, assignment.testId),
      ),
    );
  if (!question) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze vraag hoort niet bij deze afname.",
    });
  }

  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(questionNeutralizations)
      .where(
        and(
          eq(questionNeutralizations.assignmentId, assignment.id),
          eq(questionNeutralizations.questionId, question.id),
        ),
      )
      .for("update");

    if (input.mode === null) {
      if (!existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Deze vraag is niet vervallen.",
        });
      }
      await restoreManualScores(tx, existing.previous);
      await tx
        .delete(questionNeutralizations)
        .where(
          and(
            eq(questionNeutralizations.assignmentId, assignment.id),
            eq(questionNeutralizations.questionId, question.id),
          ),
        );
    } else {
      if (existing?.mode === input.mode) {
        return { changed: false, previous: existing.previous };
      }
      // Switching modes: start again from the teacher's original scores.
      if (existing) await restoreManualScores(tx, existing.previous);
      const rows = await submittedAnswers(tx, assignment.id, question.id);
      const previous: Record<string, number | null> = existing
        ? { ...existing.previous }
        : {};
      for (const r of rows) {
        if (!(r.id in previous)) previous[r.id] = r.manualScore;
      }
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        await tx
          .update(answers)
          .set(
            input.mode === "full_points"
              ? {
                  manualScore: question.points,
                  maxScore: question.points,
                  status: "graded",
                }
              : {
                  maxScore: 0,
                  autoScore: 0,
                  manualScore: null,
                  status: "graded",
                },
          )
          .where(inArray(answers.id, ids));
      }
      await tx
        .insert(questionNeutralizations)
        .values({
          assignmentId: assignment.id,
          questionId: question.id,
          mode: input.mode,
          previous,
          createdById: ctx.user.id,
        })
        .onConflictDoUpdate({
          target: [
            questionNeutralizations.assignmentId,
            questionNeutralizations.questionId,
          ],
          set: { mode: input.mode, previous, createdById: ctx.user.id },
        });
    }
    await auditFromCtx(
      ctx,
      {
        action: "question.neutralized",
        subjectType: "question",
        subjectId: question.id,
        details: {
          assignmentId: assignment.id,
          questionId: question.id,
          mode: input.mode,
        },
      },
      tx,
    );
    return { changed: true, previous: existing?.previous ?? {} };
  });

  const rows = await submittedAnswers(db, assignment.id, question.id);
  const attemptIds = [...new Set(rows.map((r) => r.attemptId))];
  if (outcome.changed) {
    // Undo (and switching from drop to full points) needs fresh automatic
    // scores; rescoring reuses the stored results, so no sandbox run.
    if (input.mode !== "drop") await rescoreAnswers(rows.map((r) => r.id));
    for (const attemptId of attemptIds) await recomputeAttemptScore(attemptId);
  }
  return {
    mode: input.mode,
    affectedAnswers: rows.length,
    affectedAttempts: attemptIds.length,
  };
}
