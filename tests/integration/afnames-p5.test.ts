/**
 * Teacher side of afnames (P5): verlengde tijd on close, several classes,
 * selected students, duplicating, neutralising questions, the hint penalty,
 * grading scales, the privacy-minded CSV export and code similarity.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  answers,
  assignmentStudents,
  assignments,
  attempts,
  auditLog,
  questionNeutralizations,
  tests,
} from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { drainGrading, resetDatabase } from "../support/db";
import {
  createAssignment,
  createClass,
  createTest,
  insertStudent,
  insertTeacher,
  q,
} from "../support/factories";

beforeEach(resetDatabase);

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function world() {
  const teacher = await insertTeacher();
  const s1 = await insertStudent();
  const s2 = await insertStudent();
  const s3 = await insertStudent();
  const klas = await createClass("4H1", [s1.id, s2.id, s3.id]);
  const other = await createClass("4H2", [s3.id]);
  const { test: toets, questions } = await createTest({
    createdById: teacher.id,
    questions: [
      q.code({
        hints: [{ id: "h1", text: "Gebruik print().", penalty: 0.25 }],
      }),
      q.mc(),
      q.open(),
    ],
  });
  return { teacher, s1, s2, s3, klas, other, toets, questions };
}

/** A submitted attempt with answers, inserted directly (no portal). */
async function submittedAttempt(opts: {
  assignmentId: string;
  userId: string;
  responses: { questionId: string; response: unknown; maxScore: number }[];
  hintsUsed?: Record<string, { id: string; at: string }[]>;
}) {
  const [attempt] = await db
    .insert(attempts)
    .values({
      assignmentId: opts.assignmentId,
      userId: opts.userId,
      status: "submitted",
      startedAt: minutesAgo(30),
      submittedAt: minutesAgo(5),
      questionOrder: opts.responses.map((r) => r.questionId),
    })
    .returning();
  if (opts.responses.length === 0) return attempt;
  await db.insert(answers).values(
    opts.responses.map((r) => ({
      attemptId: attempt.id,
      questionId: r.questionId,
      response: r.response as never,
      status: "saved" as const,
      maxScore: r.maxScore,
      savedAt: minutesAgo(6),
      hintsUsed: opts.hintsUsed?.[r.questionId] ?? [],
    })),
  );
  return attempt;
}

describe("close with verlengde tijd", () => {
  test("a student with extra time keeps working until the personal deadline", async () => {
    const w = await world();
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
      mode: "exam",
      timeLimitMinutes: 50,
    });
    const startedAt = minutesAgo(50);
    const [withExtra] = await db
      .insert(attempts)
      .values({
        assignmentId: a.id,
        userId: w.s1.id,
        startedAt,
        deadlineAt: new Date(startedAt.getTime() + 63 * 60_000),
        accommodationMinutes: 13,
      })
      .returning();
    const [regular] = await db
      .insert(attempts)
      .values({
        assignmentId: a.id,
        userId: w.s2.id,
        startedAt: minutesAgo(20),
        deadlineAt: new Date(Date.now() + 30 * 60_000),
      })
      .returning();

    const t = callerFor(w.teacher);
    const res = await t.assignment.close({ id: a.id });
    expect(res).toMatchObject({ autoSubmitted: 1, stillWorking: 1 });

    const [after1] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, withExtra.id));
    expect(after1.status).toBe("in_progress");
    // Closed right at the end of the regular 50 minutes: start + 63 min.
    const minutes =
      ((after1.deadlineAt?.getTime() ?? 0) - startedAt.getTime()) / 60_000;
    expect(Math.round(minutes)).toBe(63);
    const [after2] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, regular.id));
    expect(after2.status).toBe("submitted");
    expect(after2.autoSubmitted).toBe(true);
    await drainGrading();
  });

  test("respectAccommodations: false hands everyone in", async () => {
    const w = await world();
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
      timeLimitMinutes: 50,
    });
    await db.insert(attempts).values({
      assignmentId: a.id,
      userId: w.s1.id,
      startedAt: minutesAgo(10),
      deadlineAt: new Date(Date.now() + 53 * 60_000),
      accommodationMinutes: 13,
    });
    const res = await callerFor(w.teacher).assignment.close({
      id: a.id,
      respectAccommodations: false,
    });
    expect(res).toMatchObject({ autoSubmitted: 1, stillWorking: 0 });
    await drainGrading();
  });
});

describe("create, duplicate and select students", () => {
  test("several classes → one afname per class with the same settings", async () => {
    const w = await world();
    const t = callerFor(w.teacher);
    const res = await t.assignment.create({
      testId: w.toets.id,
      classIds: [w.klas.id, w.other.id],
      mode: "exam",
      generateAccessCode: true,
      accessCodePerClass: true,
      settings: { grading: { method: "cesuur", passPercentage: 60 } },
    });
    expect(res.items).toHaveLength(2);
    const rows = await db
      .select()
      .from(assignments)
      .where(eq(assignments.testId, w.toets.id));
    expect(rows).toHaveLength(2);
    expect(rows[0].settings).toEqual(rows[1].settings);
    expect(rows[0].settings.grading).toEqual({
      method: "cesuur",
      passPercentage: 60,
      nTerm: 1,
    });
    expect(rows[0].accessCode).not.toBe(rows[1].accessCode);
  });

  test("the legacy classId still works; no class is rejected", async () => {
    const w = await world();
    const t = callerFor(w.teacher);
    const res = await t.assignment.create({
      testId: w.toets.id,
      classId: w.klas.id,
      mode: "practice",
    });
    expect(res.items[0].classId).toBe(w.klas.id);
    await expect(
      t.assignment.create({ testId: w.toets.id, classIds: [], mode: "exam" }),
    ).rejects.toThrow("Kies minstens één klas.");
  });

  test("selected students: only members of that one class", async () => {
    const w = await world();
    const t = callerFor(w.teacher);
    await expect(
      t.assignment.create({
        testId: w.toets.id,
        classIds: [w.other.id],
        studentIds: [w.s1.id],
        mode: "exam",
      }),
    ).rejects.toThrow("Kies leerlingen uit deze klas.");
    await expect(
      t.assignment.create({
        testId: w.toets.id,
        classIds: [w.klas.id, w.other.id],
        studentIds: [w.s1.id],
        mode: "exam",
      }),
    ).rejects.toThrow();

    const original = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
    });
    const res = await t.assignment.create({
      testId: w.toets.id,
      classIds: [w.klas.id],
      studentIds: [w.s1.id, w.s2.id],
      retakeOfId: original.id,
      mode: "exam",
      openNow: true,
    });
    const monitor = await t.assignment.monitor({ id: res.id });
    expect(monitor.students.map((s) => s.student.id).sort()).toEqual(
      [w.s1.id, w.s2.id].sort(),
    );
    expect(monitor.assignment.targetedStudentCount).toBe(2);
    expect(monitor.assignment.retakeOf?.id).toBe(original.id);
    const results = await t.review.results({ assignmentId: res.id });
    expect(results.rows).toHaveLength(2);

    // Back to the whole class.
    await t.assignment.setStudents({ id: res.id, userIds: null });
    expect(
      await db
        .select()
        .from(assignmentStudents)
        .where(eq(assignmentStudents.assignmentId, res.id)),
    ).toHaveLength(0);
    expect((await t.assignment.monitor({ id: res.id })).students).toHaveLength(
      3,
    );
  });

  test("setStudents warns about removed students with an attempt and keeps it", async () => {
    const w = await world();
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
    });
    const attempt = await submittedAttempt({
      assignmentId: a.id,
      userId: w.s2.id,
      responses: [],
    });
    const t = callerFor(w.teacher);
    const res = await t.assignment.setStudents({
      id: a.id,
      userIds: [w.s1.id],
    });
    expect(res.removedWithAttempts).toBe(1);
    const [still] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attempt.id));
    expect(still).toBeDefined();
    // The roster keeps the student with an attempt.
    const monitor = await t.assignment.monitor({ id: a.id });
    expect(monitor.students.map((s) => s.student.id).sort()).toEqual(
      [w.s1.id, w.s2.id].sort(),
    );
  });

  test("duplicate copies test, title, mode, time limit and settings", async () => {
    const w = await world();
    const source = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
      title: "Toets H3",
      mode: "exam",
      timeLimitMinutes: 45,
      accessCode: "ABC123",
      settings: {
        maxAttempts: 2,
        grading: { method: "nterm", passPercentage: 55, nTerm: 1.5 },
      },
      opensAt: new Date(Date.now() + 60 * 60_000),
      closesAt: new Date(Date.now() + 120 * 60_000),
    });
    const t = callerFor(w.teacher);
    const res = await t.assignment.duplicate({
      id: source.id,
      classIds: [w.other.id],
    });
    expect(res.items).toHaveLength(1);
    const [copy] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, res.items[0].id));
    expect(copy).toMatchObject({
      testId: w.toets.id,
      classId: w.other.id,
      title: "Toets H3",
      mode: "exam",
      status: "planned",
      timeLimitMinutes: 45,
      opensAt: null,
      closesAt: null,
    });
    expect(copy.settings).toEqual(source.settings);
    expect(copy.accessCode).not.toBeNull();
    expect(copy.accessCode).not.toBe("ABC123");

    const kept = await t.assignment.duplicate({
      id: source.id,
      classIds: [w.other.id],
      keepWindow: true,
    });
    const [copy2] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, kept.items[0].id));
    expect(copy2.opensAt?.getTime()).toBe(source.opensAt?.getTime());
  });

  test("duplicate needs a published test, like create", async () => {
    const w = await world();
    const source = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
    });
    await db
      .update(tests)
      .set({ status: "draft" })
      .where(eq(tests.id, w.toets.id));
    const t = callerFor(w.teacher);
    await expect(
      t.assignment.duplicate({ id: source.id, classIds: [w.other.id] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("grading", () => {
  test("a revealed 25% hint costs a quarter of the points", async () => {
    const w = await world();
    const [code, mc, open] = w.questions;
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
    });
    const at = await submittedAttempt({
      assignmentId: a.id,
      userId: w.s1.id,
      responses: [
        {
          questionId: code.id,
          response: { code: 'print("Hallo")\n' },
          maxScore: code.points,
        },
        {
          questionId: mc.id,
          response: { selected: ["a"] },
          maxScore: mc.points,
        },
        { questionId: open.id, response: { text: "" }, maxScore: open.points },
      ],
      hintsUsed: { [code.id]: [{ id: "h1", at: new Date().toISOString() }] },
    });
    const t = callerFor(w.teacher);
    await t.review.regradeAttempt({ attemptId: at.id });
    const [row] = await db
      .select()
      .from(answers)
      .where(
        and(eq(answers.attemptId, at.id), eq(answers.questionId, code.id)),
      );
    expect(row.autoScore).toBe(code.points * 0.75);
  });

  test("neutralise: drop survives a regrade, undo restores manual scores", async () => {
    const w = await world();
    const [code, mc, open] = w.questions;
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
    });
    const at = await submittedAttempt({
      assignmentId: a.id,
      userId: w.s1.id,
      responses: [
        {
          questionId: code.id,
          response: { code: 'print("Hallo")\n' },
          maxScore: code.points,
        },
        {
          questionId: mc.id,
          response: { selected: ["b"] },
          maxScore: mc.points,
        },
        {
          questionId: open.id,
          response: { text: "Mijn uitleg" },
          maxScore: open.points,
        },
      ],
    });
    const t = callerFor(w.teacher);
    await t.review.regradeAssignment({ assignmentId: a.id });
    const openAnswer = async () =>
      (
        await db
          .select()
          .from(answers)
          .where(
            and(eq(answers.attemptId, at.id), eq(answers.questionId, open.id)),
          )
      )[0];
    await t.review.setManualScore({
      answerId: (await openAnswer()).id,
      manualScore: 1.5,
    });

    await t.analysis.neutralizeQuestion({
      assignmentId: a.id,
      questionId: open.id,
      mode: "drop",
    });
    expect((await openAnswer()).maxScore).toBe(0);
    await t.review.regradeAssignment({ assignmentId: a.id });
    expect((await openAnswer()).maxScore).toBe(0);
    const [dropped] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, at.id));
    expect(dropped.maxScore).toBe(code.points + mc.points);

    await t.analysis.neutralizeQuestion({
      assignmentId: a.id,
      questionId: open.id,
      mode: null,
    });
    const restored = await openAnswer();
    expect(restored.manualScore).toBe(1.5);
    expect(restored.maxScore).toBe(open.points);
    expect(
      await db
        .select()
        .from(questionNeutralizations)
        .where(eq(questionNeutralizations.assignmentId, a.id)),
    ).toHaveLength(0);
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "question.neutralized"));
    expect(audits).toHaveLength(2);
  });

  test("changing the grading scale changes grades without regrading", async () => {
    const w = await world();
    const [code, mc, open] = w.questions;
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
    });
    await submittedAttempt({
      assignmentId: a.id,
      userId: w.s1.id,
      responses: [
        {
          questionId: code.id,
          response: { code: "# FOUT\n" },
          maxScore: code.points,
        },
        {
          questionId: mc.id,
          response: { selected: ["a"] },
          maxScore: mc.points,
        },
        { questionId: open.id, response: { text: "" }, maxScore: open.points },
      ],
    });
    const t = callerFor(w.teacher);
    await t.review.regradeAssignment({ assignmentId: a.id });
    const before = await t.review.results({ assignmentId: a.id });
    const linear = before.rows.find((r) => r.attempt)?.attempt?.grade;
    // 1 of 5 points: linear 1 + 9 × 0.2 = 2.8
    expect(linear).toBe(2.8);
    await t.assignment.update({
      id: a.id,
      settings: { grading: { method: "cesuur", passPercentage: 20 } },
    });
    const after = await t.review.results({ assignmentId: a.id });
    expect(after.rows.find((r) => r.attempt)?.attempt?.grade).toBe(5.5);
  });
});

describe("export and audits", () => {
  test("no Focusverlies column by default; the export is audited", async () => {
    const w = await world();
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
      settings: { logFocusEvents: true },
    });
    const t = callerFor(w.teacher);
    const plain = await t.review.exportCsv({ assignmentId: a.id });
    expect(plain.csv).not.toContain("Focusverlies");
    const withFocus = await t.review.exportCsv({
      assignmentId: a.id,
      includeFocus: true,
    });
    expect(withFocus.csv).toContain("Focusverlies");
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "results.exported"));
    expect(audits).toHaveLength(2);
    expect(audits.map((r) => r.details?.includeFocus).sort()).toEqual([
      false,
      true,
    ]);
  });

  test("an afname without focus logging never exports the column", async () => {
    const w = await world();
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
    });
    const res = await callerFor(w.teacher).review.exportCsv({
      assignmentId: a.id,
      includeFocus: true,
    });
    expect(res.csv).not.toContain("Focusverlies");
    expect(res.includeFocus).toBe(false);
  });
});

describe("code similarity", () => {
  const program = (n: string, total: string) => `${total} = 0
${n} = input("Getal (of stop): ")
while ${n} != "stop":
    ${total} = ${total} + int(${n})
    print("Tussenstand:", ${total})
    ${n} = input("Getal (of stop): ")
print("De som is", ${total})
`;

  test("finds a renamed copy; students are forbidden", async () => {
    const w = await world();
    const [code] = w.questions;
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
    });
    for (const [user, src] of [
      [w.s1, program("invoer", "som")],
      [w.s2, program("waarde", "resultaat")],
    ] as const) {
      await submittedAttempt({
        assignmentId: a.id,
        userId: user.id,
        responses: [
          {
            questionId: code.id,
            response: { code: src },
            maxScore: code.points,
          },
        ],
      });
    }
    const res = await callerFor(w.teacher).similarity.assignment({
      assignmentId: a.id,
    });
    const pairs = res.questions[0].pairs;
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ score: 1, identicalStructure: true });

    const pair = await callerFor(w.teacher).similarity.pair({
      answerIdA: pairs[0].a.answerId,
      answerIdB: "solution" in pairs[0].b ? "solution" : pairs[0].b.answerId,
    });
    expect(pair.linesA.length).toBeGreaterThan(3);

    await expect(
      callerFor(w.s1).similarity.assignment({ assignmentId: a.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      callerFor(w.s1).analysis.assignment({ assignmentId: a.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("toetsanalyse returns p and rir", async () => {
    const w = await world();
    const [code, mc, open] = w.questions;
    const a = await createAssignment({
      testId: w.toets.id,
      classId: w.klas.id,
    });
    const answersFor = (ok: boolean, mcOk: boolean) => [
      {
        questionId: code.id,
        response: { code: ok ? 'print("Hallo")\n' : "# FOUT\n" },
        maxScore: code.points,
      },
      {
        questionId: mc.id,
        response: { selected: [mcOk ? "a" : "b"] },
        maxScore: mc.points,
      },
      { questionId: open.id, response: { text: "" }, maxScore: open.points },
    ];
    await submittedAttempt({
      assignmentId: a.id,
      userId: w.s1.id,
      responses: answersFor(true, true),
    });
    await submittedAttempt({
      assignmentId: a.id,
      userId: w.s2.id,
      responses: answersFor(true, false),
    });
    await submittedAttempt({
      assignmentId: a.id,
      userId: w.s3.id,
      responses: answersFor(false, false),
    });
    const t = callerFor(w.teacher);
    await t.review.regradeAssignment({ assignmentId: a.id });
    const res = await t.analysis.assignment({ assignmentId: a.id });
    expect(res.test.n).toBe(3);
    expect(res.test.smallSample).toBe(true);
    const codeItem = res.items.find((i) => i.questionId === code.id);
    expect(codeItem?.p).toBeCloseTo(2 / 3, 6);
    expect(codeItem?.rir).not.toBeNull();
    expect(res.choices[0].summary.answered).toBe(3);
  });
});
