/**
 * Teacher review UI (group U3a) against real router output: the Resultaten
 * tab counts pending answers like the Nakijken tab and the dashboard, the
 * results matrix keeps focused cells out from under its sticky column, the
 * export uses the word "Vensterwissels", and grading identical answers
 * together never overwrites an existing manual score.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  identicalAnswers,
  pendingReviewTotal,
} from "@/components/docent/review/grading-logic";
import { ResultsContent } from "@/components/docent/review/results-view";
import {
  createTestTrpc,
  tagsMatching,
  textOf,
} from "@/components/docent/review/test-render";
import { db } from "@/server/db";
import { answers, attempts } from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  addToClass,
  createBasicWorld,
  insertStudent,
} from "../support/factories";
import { waitForGrading } from "../support/wait";

beforeEach(resetDatabase);

type World = Awaited<ReturnType<typeof createBasicWorld>>;
type Student = World["s1"];

/** Hands in one attempt with only the open question answered. */
async function handIn(w: World, student: Student, text: string) {
  const caller = callerFor(student);
  const { attemptId } = await caller.portal.startAttempt({
    assignmentId: w.assignment.id,
  });
  await caller.portal.saveAnswer({
    attemptId,
    questionId: w.questions.open.id,
    response: { text },
  });
  await caller.portal.submitAttempt({ attemptId });
  await waitForGrading(attemptId);
  // Move the start back an hour, so a next attempt is not blocked by the
  // 30-second restart cooldown.
  await db
    .update(attempts)
    .set({ startedAt: new Date(Date.now() - 3_600_000) })
    .where(eq(attempts.id, attemptId));
  const [open] = await db
    .select()
    .from(answers)
    .where(eq(answers.attemptId, attemptId))
    .then((rows) => rows.filter((r) => r.questionId === w.questions.open.id));
  if (!open) throw new Error("open answer missing");
  return { attemptId, answerId: open.id };
}

async function renderResults(w: World) {
  const t = callerFor(w.teacher);
  const [results, queue] = await Promise.all([
    t.review.results({ assignmentId: w.assignment.id }),
    t.review.gradingQueue({ assignmentId: w.assignment.id }),
  ]);
  const { queryClient, trpc, render } = createTestTrpc();
  queryClient.setQueryData(
    trpc.review.gradingQueue.queryKey({ assignmentId: w.assignment.id }),
    queue,
  );
  return { html: render(<ResultsContent data={results} />), results, queue };
}

describe("Resultaten: 'nog nakijken' matches Nakijken and the dashboard (A26)", () => {
  test("a practice afname with two handed-in attempts of one student", async () => {
    const w = await createBasicWorld({
      settings: { showResults: "immediately", maxAttempts: 3 },
    });
    await handIn(w, w.s1, "Eerste uitleg");
    await handIn(w, w.s1, "Tweede uitleg");
    const t = callerFor(w.teacher);

    const queue = await t.review.gradingQueue({
      assignmentId: w.assignment.id,
    });
    expect(pendingReviewTotal(queue.questions)).toBe(2);
    const dashboard = await t.dashboard.overview();
    expect(
      dashboard.reviewQueue.find((r) => r.assignmentId === w.assignment.id)
        ?.count,
    ).toBe(2);

    const { html } = await renderResults(w);
    const text = textOf(html);
    // The tab badge and the stat card show the same number as Nakijken.
    expect(text).toContain("Nakijken 2 nog na te kijken");
    expect(text).toContain("Nog nakijken 2");
    expect(text).not.toContain("Nakijken 1 nog na te kijken");
  });

  test("before the queue has loaded no misleading number is shown", async () => {
    const w = await createBasicWorld();
    await handIn(w, w.s1, "Mijn uitleg");
    const results = await callerFor(w.teacher).review.results({
      assignmentId: w.assignment.id,
    });
    const { render } = createTestTrpc();
    const text = textOf(render(<ResultsContent data={results} />));
    expect(text).toContain("Nog nakijken – wordt geteld…");
    expect(text).not.toContain("nog na te kijken");
  });
});

describe("Resultaten: the matrix and the export (A05, A40, A41)", () => {
  test("focused cells scroll out from under the sticky name column", async () => {
    const w = await createBasicWorld();
    await handIn(w, w.s1, "Mijn uitleg");
    const { html } = await renderResults(w);
    const [region] = tagsMatching(
      html,
      /aria-label="Resultaten per leerling en vraag"/,
    );
    expect(region).toContain("scroll-pl-[var(--sticky-col,12rem)]");
    // The variable is set on the matrix section (12rem until measured).
    expect(tagsMatching(html, /style="--sticky-col:12rem"/)).toHaveLength(1);
  });

  test("the export checkbox says 'Vensterwissels', like the monitor", async () => {
    const w = await createBasicWorld({
      settings: {
        showResults: "immediately",
        maxAttempts: 3,
        logFocusEvents: true,
      },
    });
    await handIn(w, w.s1, "Mijn uitleg");
    const text = textOf((await renderResults(w)).html);
    expect(text).toContain("Vensterwissels meenemen in export");
    expect(text.toLowerCase()).not.toContain("focusverlies");
  });

  test("counts agree in number: one handed-in attempt", async () => {
    const w = await createBasicWorld();
    await handIn(w, w.s1, "Mijn uitleg");
    const text = textOf((await renderResults(w)).html);
    expect(text).toContain("3 vragen");
    expect(text).not.toMatch(/\b1 ingeleverde pogingen\b/);
    expect(text).not.toMatch(/\bvan de 1 leerlingen\b/);
  });
});

describe("Nakijken: grading identical answers together (X09)", () => {
  test("answers that already have a manual score are left out", async () => {
    const w = await createBasicWorld();
    const s3 = await insertStudent();
    await addToClass(w.klas.id, s3.id);
    const same = "Een lus herhaalt een stuk code.";
    const a1 = await handIn(w, w.s1, same);
    const a2 = await handIn(w, w.s2, same);
    const a3 = await handIn(w, s3, same);
    const t = callerFor(w.teacher);
    await t.review.setManualScore({ answerId: a2.answerId, manualScore: 2 });

    const [queue, groups] = await Promise.all([
      t.review.gradingQueue({
        assignmentId: w.assignment.id,
        questionId: w.questions.open.id,
        includeGraded: true,
      }),
      t.feedback.groups({
        assignmentId: w.assignment.id,
        questionId: w.questions.open.id,
      }),
    ]);
    const keys = new Map(groups.items.map((g) => [g.answerId, g.groupKey]));
    const targets = identicalAnswers(
      queue.items,
      a1.answerId,
      (id) => keys.get(id) ?? "",
    );
    expect(targets.ungraded).toEqual([a3.answerId]);
    expect(targets.graded).toEqual([a2.answerId]);

    // What "Opslaan" sends with "Ook toepassen op …" ticked.
    await t.feedback.gradeMany({
      answerIds: [a1.answerId, ...targets.ungraded],
      manualScore: 1,
      feedback: null,
    });
    const rows = await db.select().from(answers);
    const score = (id: string) => rows.find((r) => r.id === id)?.manualScore;
    expect(score(a1.answerId)).toBe(1);
    expect(score(a3.answerId)).toBe(1);
    expect(score(a2.answerId)).toBe(2);
  });
});
