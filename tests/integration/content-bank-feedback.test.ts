/**
 * P6: question bank, example tests, input limits, feedback snippets and
 * grading several answers at once.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { answers, attempts, auditLog, questions } from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  createAssignment,
  createClass,
  createTest,
  insertStudent,
  insertTeacher,
  q,
} from "../support/factories";

beforeEach(resetDatabase);

describe("question bank", () => {
  test("copyToTest gives fresh ids and points sourceQuestionId at the root original", async () => {
    const teacher = await insertTeacher();
    const t = callerFor(teacher);
    const { questions: originals } = await createTest({
      createdById: teacher.id,
      questions: [
        q.code({
          hints: [{ id: "h1", text: "Gebruik print().", penalty: 0.1 }],
        }),
        q.mc(),
      ],
    });
    const { test: target } = await createTest({
      createdById: teacher.id,
      status: "draft",
      questions: [],
    });

    const res = await t.bank.copyToTest({
      questionIds: originals.map((o) => o.id),
      targetTestId: target.id,
    });
    expect(res.created).toBe(2);
    expect(res.hasAttempts).toBe(false);

    const copies = await db
      .select()
      .from(questions)
      .where(eq(questions.testId, target.id));
    copies.sort((a, b) => a.position - b.position);
    expect(copies.map((c) => c.position)).toEqual([0, 1]);
    expect(copies.map((c) => c.sourceQuestionId)).toEqual(
      originals.map((o) => o.id),
    );
    expect(copies.map((c) => c.id)).not.toContain(originals[0].id);

    const codeCopy = copies[0].data as {
      tests: { id: string }[];
      hints: { id: string; text: string }[];
    };
    const codeOrig = originals[0].data as typeof codeCopy;
    expect(codeCopy.tests[0].id).not.toBe(codeOrig.tests[0].id);
    expect(codeCopy.hints[0].id).not.toBe("h1");
    expect(codeCopy.hints[0].text).toBe("Gebruik print().");
    const mcCopy = copies[1].data as { options: { id: string }[] };
    const mcOrig = originals[1].data as typeof mcCopy;
    expect(mcCopy.options.map((o) => o.id)).not.toEqual(
      mcOrig.options.map((o) => o.id),
    );

    // A copy of a copy still points at the root.
    const again = await t.question.copyToTest({
      id: copies[0].id,
      targetTestId: target.id,
    });
    expect(again.question.sourceQuestionId).toBe(originals[0].id);
  });

  test("copyToTest respects the 50-question limit", async () => {
    const teacher = await insertTeacher();
    const { questions: source } = await createTest({
      questions: [q.mc(), q.mc()],
    });
    const { test: target } = await createTest({
      questions: Array.from({ length: 49 }, () => q.mc()),
    });
    await expect(
      callerFor(teacher).bank.copyToTest({
        questionIds: source.map((s) => s.id),
        targetTestId: target.id,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  test("search filters on text (wildcards escaped), type and tags", async () => {
    const teacher = await insertTeacher();
    const t = callerFor(teacher);
    const { questions: qs, test: source } = await createTest({
      questions: [
        q.code({}, { title: "Gemiddelde berekenen" }),
        q.mc({}, { title: "100% zeker" }),
        q.open({}, { title: "Uitleg lussen" }),
      ],
    });
    await db
      .update(questions)
      .set({ tags: ["lijsten", "functies"] })
      .where(eq(questions.id, qs[0].id));

    const byText = await t.bank.search({ query: "gemiddelde" });
    expect(byText.items.map((i) => i.id)).toEqual([qs[0].id]);
    expect(byText.items[0].test).toMatchObject({ id: source.id });
    expect(byText.items[0].promptExcerpt.length).toBeLessThanOrEqual(180);

    const percent = await t.bank.search({ query: "%" });
    expect(percent.items.map((i) => i.id)).toEqual([qs[1].id]);

    const byType = await t.bank.search({ types: ["open"] });
    expect(byType.items.map((i) => i.id)).toEqual([qs[2].id]);

    const byTag = await t.bank.search({ tags: ["Lijsten"] });
    expect(byTag.items.map((i) => i.id)).toEqual([qs[0].id]);

    const excluded = await t.bank.search({ excludeTestId: source.id });
    expect(excluded.items).toEqual([]);

    const tags = await t.bank.tags();
    expect(tags).toEqual([
      { tag: "functies", count: 1 },
      { tag: "lijsten", count: 1 },
    ]);
  });

  test("importExample creates a draft test with tagged questions", async () => {
    const teacher = await insertTeacher();
    const t = callerFor(teacher);
    const examples = await t.bank.examples();
    expect(examples.map((e) => e.id)).toEqual([
      "basis",
      "lussen-lijsten",
      "functies",
    ]);
    const { id } = await t.bank.importExample({ exampleId: "functies" });
    const test = await t.test.get({ id });
    expect(test.status).toBe("draft");
    expect(test.createdById).toBe(teacher.id);
    expect(test.questions).toHaveLength(8);
    expect(test.questions.every((x) => x.tags.length > 0)).toBe(true);
  });
});

describe("question input limits", () => {
  test("an oversized prompt or call is rejected; tags are normalised", async () => {
    const teacher = await insertTeacher();
    const t = callerFor(teacher);
    const { questions: qs } = await createTest({ questions: [q.code()] });
    await expect(
      t.question.update({ id: qs[0].id, prompt: "x".repeat(20_001) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      t.question.update({
        id: qs[0].id,
        data: {
          tests: [
            {
              id: "t1",
              kind: "function",
              call: `${"f".repeat(2001)}()`,
              expected: "1",
            },
          ],
        },
      }),
    ).rejects.toThrow("Test 1: de aanroep is te lang (maximaal 2.000 tekens).");
    const ok = await t.question.update({
      id: qs[0].id,
      prompt: "x".repeat(20_000),
      tags: [" Lijsten ", "LIJSTEN", "for-lus"],
    });
    expect(ok.question.tags).toEqual(["lijsten", "for-lus"]);
  });

  test("importJson rejects a question over the limits", async () => {
    const teacher = await insertTeacher();
    await expect(
      callerFor(teacher).test.importJson({
        json: {
          test: { title: "Te groot" },
          questions: [
            {
              type: "open",
              title: "Open",
              prompt: "x".repeat(20_001),
              data: {},
            },
          ],
        },
      }),
    ).rejects.toThrow("Vraag 1: De opdrachttekst is te lang");
  });
});

describe("feedback snippets", () => {
  test("every teacher sees and changes only their own snippets", async () => {
    const a = await insertTeacher();
    const b = await insertTeacher();
    const { questions: qs } = await createTest({ questions: [q.open()] });
    const ta = callerFor(a);
    const tb = callerFor(b);

    const general = await ta.feedback.create({ text: "Goed gedaan!" });
    const specific = await ta.feedback.create({
      text: "Noem twee redenen.",
      questionId: qs[0].id,
    });
    expect(general.created).toBe(true);
    // Same text again: no duplicate.
    expect((await ta.feedback.create({ text: "Goed gedaan!" })).created).toBe(
      false,
    );

    await ta.feedback.used({ id: specific.id });
    const mine = await ta.feedback.list({ questionId: qs[0].id });
    expect(mine.forQuestion.map((s) => s.id)).toEqual([specific.id]);
    expect(mine.forQuestion[0].useCount).toBe(1);
    expect(mine.general.map((s) => s.id)).toEqual([general.id]);

    const theirs = await tb.feedback.list({ questionId: qs[0].id });
    expect(theirs).toEqual({ forQuestion: [], general: [] });
    await expect(tb.feedback.delete({ id: general.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      tb.feedback.update({ id: general.id, text: "Overgenomen" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("tying a snippet to a question that does not exist is NOT_FOUND", async () => {
    const t = callerFor(await insertTeacher());
    const missing = "00000000-0000-4000-8000-000000000000";
    await expect(
      t.feedback.create({ text: "Let op de spaties.", questionId: missing }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { id } = await t.feedback.create({ text: "Let op de spaties." });
    await expect(
      t.feedback.update({ id, questionId: missing }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Still a general snippet.
    expect((await t.feedback.list()).general.map((s) => s.id)).toEqual([id]);
  });
});

describe("feedback.gradeMany", () => {
  async function fiveSubmittedAnswers() {
    const teacher = await insertTeacher();
    const students = await Promise.all(
      Array.from({ length: 5 }, () => insertStudent()),
    );
    const klas = await createClass(
      undefined,
      students.map((s) => s.id),
    );
    const { test, questions: qs } = await createTest({
      questions: [
        q.open(
          {
            rubricItems: [
              { id: "r1", label: "Juiste uitleg", points: 1 },
              { id: "r2", label: "Voorbeeld", points: 1 },
            ],
          },
          { points: 2 },
        ),
      ],
    });
    const assignment = await createAssignment({
      testId: test.id,
      classId: klas.id,
      createdById: teacher.id,
    });
    const answerIds: string[] = [];
    const attemptIds: string[] = [];
    for (const s of students) {
      const [attempt] = await db
        .insert(attempts)
        .values({
          assignmentId: assignment.id,
          userId: s.id,
          status: "submitted",
          submittedAt: new Date(),
          questionOrder: [qs[0].id],
          gradingStatus: "needs_review",
          score: 0,
          maxScore: 2,
        })
        .returning();
      const [answer] = await db
        .insert(answers)
        .values({
          attemptId: attempt.id,
          questionId: qs[0].id,
          response: { text: "Je kunt code hergebruiken." },
          status: "needs_review",
          maxScore: 2,
        })
        .returning();
      attemptIds.push(attempt.id);
      answerIds.push(answer.id);
    }
    return { teacher, assignment, question: qs[0], answerIds, attemptIds };
  }

  test("grades five identical answers and recomputes every attempt", async () => {
    const w = await fiveSubmittedAnswers();
    const t = callerFor(w.teacher);

    const groups = await t.feedback.groups({
      assignmentId: w.assignment.id,
      questionId: w.question.id,
    });
    expect(new Set(groups.items.map((i) => i.groupKey)).size).toBe(1);
    expect(groups.rubricItems.map((r) => r.id)).toEqual(["r1", "r2"]);

    const res = await t.feedback.gradeMany({
      answerIds: w.answerIds,
      manualScore: 1,
      feedback: "✓ Juiste uitleg",
      rubricChecked: ["r1"],
    });
    expect(res.updated).toBe(5);
    expect(res.recomputed).toBe(true);

    const rows = await db
      .select()
      .from(answers)
      .where(inArray(answers.id, w.answerIds));
    for (const row of rows) {
      expect(row).toMatchObject({
        manualScore: 1,
        status: "graded",
        rubricChecked: ["r1"],
        feedback: "✓ Juiste uitleg",
        reviewedById: w.teacher.id,
      });
    }
    const attemptRows = await db
      .select()
      .from(attempts)
      .where(inArray(attempts.id, w.attemptIds));
    for (const a of attemptRows) {
      expect(a.score).toBe(1);
      expect(a.gradingStatus).toBe("graded");
    }

    // One row per answer, under the student it belongs to (inzage export,
    // audit filter per student), with the old and the new score.
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "answer.score_changed"));
    expect(audits).toHaveLength(5);
    expect(audits.map((a) => a.subjectId).sort()).toEqual(
      [...w.answerIds].sort(),
    );
    const owners = await db
      .select({ userId: attempts.userId })
      .from(attempts)
      .where(inArray(attempts.id, w.attemptIds));
    expect(audits.map((a) => a.subjectUserId).sort()).toEqual(
      owners.map((o) => o.userId).sort(),
    );
    for (const a of audits) {
      expect(a.subjectUserId).toBeTruthy();
      expect(a.subjectLabel).toBeTruthy();
      expect(a.details).toMatchObject({ from: null, to: 1, bulk: true });
    }
  });

  test("an unknown rubric id or a score above the maximum is a BAD_REQUEST", async () => {
    const w = await fiveSubmittedAnswers();
    const t = callerFor(w.teacher);
    await expect(
      t.feedback.gradeMany({
        answerIds: w.answerIds.slice(0, 2),
        manualScore: 1,
        rubricChecked: ["r1", "bestaat-niet"],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      t.feedback.gradeMany({ answerIds: w.answerIds, manualScore: 3 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const untouched = await db
      .select({ manualScore: answers.manualScore })
      .from(answers)
      .where(inArray(answers.id, w.answerIds));
    expect(untouched.every((r) => r.manualScore === null)).toBe(true);
  });

  test("students cannot use it", async () => {
    const w = await fiveSubmittedAnswers();
    const student = await insertStudent();
    await expect(
      callerFor(student).feedback.gradeMany({
        answerIds: w.answerIds,
        manualScore: 2,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
