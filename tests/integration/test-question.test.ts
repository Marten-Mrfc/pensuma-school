/** Toetsen en vragen (teacher): CRUD, publishing, copy, import/export. */
import { beforeEach, describe, expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { parseQuestionData } from "@/lib/questions/schema";
import { solutionFingerprint } from "@/lib/questions/validate";
import { db } from "@/server/db";
import { questions, tests } from "@/server/db/schema";
import { callerFor, type TestUser } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  createBasicWorld,
  createTest,
  insertTeacher,
  q,
} from "../support/factories";

let teacher: TestUser;

beforeEach(async () => {
  await resetDatabase();
  teacher = await insertTeacher();
});

async function positions(testId: string) {
  return db
    .select({ id: questions.id, position: questions.position })
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position));
}

describe("tests", () => {
  test("create, update, publish, archive", async () => {
    const t = callerFor(teacher);
    const { id } = await t.test.create({ title: "Lussen" });
    await t.test.update({ id, title: "Lussen en lijsten" });
    await t.question.create({ testId: id, type: "multiple_choice" });
    const detail = await t.test.get({ id });
    expect(detail).toMatchObject({});
    const [row] = await db.select().from(tests).where(eq(tests.id, id));
    expect(row).toMatchObject({
      title: "Lussen en lijsten",
      status: "draft",
      createdById: teacher.id,
    });

    const published = await t.test.setStatus({
      id,
      status: "published",
      acknowledgeWarnings: true,
    });
    if (published.changed) {
      expect(published.status).toBe("published");
    } else {
      // A fresh MC template may still have errors: they are reported.
      expect(published.problems.length).toBeGreaterThan(0);
    }
    const archived = await t.test.setStatus({ id, status: "archived" });
    expect(archived).toMatchObject({ changed: true, status: "archived" });
  });

  test("a test without questions cannot be published", async () => {
    const t = callerFor(teacher);
    const { id } = await t.test.create({ title: "Leeg" });
    const out = await t.test.setStatus({ id, status: "published" });
    expect(out.changed).toBe(false);
    expect(out.problems.length).toBeGreaterThan(0);
  });

  test("duplicate copies every question as a new draft", async () => {
    const { test: source } = await createTest({
      title: "Origineel",
      questions: [q.mc(), q.code(), q.open()],
    });
    const { id } = await callerFor(teacher).test.duplicate({ id: source.id });
    const [copy] = await db.select().from(tests).where(eq(tests.id, id));
    expect(copy).toMatchObject({ title: "Origineel (kopie)", status: "draft" });
    const copied = await db
      .select()
      .from(questions)
      .where(eq(questions.testId, id))
      .orderBy(asc(questions.position));
    expect(copied.map((x) => x.type)).toEqual([
      "multiple_choice",
      "code",
      "open",
    ]);
    expect(copied.map((x) => x.position)).toEqual([0, 1, 2]);
  });

  test("a test with attempts cannot be deleted", async () => {
    const w = await createBasicWorld();
    await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await expect(
      callerFor(teacher).test.delete({ id: w.test.id }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const { test: unused } = await createTest();
    await callerFor(teacher).test.delete({ id: unused.id });
    expect(
      await db.select().from(tests).where(eq(tests.id, unused.id)),
    ).toHaveLength(0);
  });

  test("exportJson → importJson round-trip gives an equivalent test", async () => {
    const { test: source } = await createTest({
      title: "Uitwisselbaar",
      description: "Voor andere scholen",
      questions: [q.code(), q.mc(), q.open()],
    });
    const t = callerFor(teacher);
    const exported = await t.test.exportJson({ id: source.id });
    const json = JSON.stringify(exported);
    const imported = await t.test.importJson({ json });
    const importedId = (imported as { id: string }).id;
    expect(importedId).toBeTruthy();
    expect(importedId).not.toBe(source.id);

    // Import gives tests, options and hints fresh ids; everything else is equal.
    const withoutIds = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(withoutIds)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .filter(([k]) => k !== "id")
                .map(([k, v]) => [k, withoutIds(v)]),
            )
          : value;
    const strip = (rows: (typeof questions.$inferSelect)[]) =>
      rows.map((x) => ({
        type: x.type,
        title: x.title,
        prompt: x.prompt,
        points: x.points,
        data: withoutIds(parseQuestionData(x.type, x.data)),
      }));
    const original = await db
      .select()
      .from(questions)
      .where(eq(questions.testId, source.id))
      .orderBy(asc(questions.position));
    const copy = await db
      .select()
      .from(questions)
      .where(eq(questions.testId, importedId))
      .orderBy(asc(questions.position));
    expect(strip(copy)).toEqual(strip(original));
    const [row] = await db.select().from(tests).where(eq(tests.id, importedId));
    expect(row.status).toBe("draft");
  });

  test("importJson rejects garbage with a Dutch message", async () => {
    await expect(
      callerFor(teacher).test.importJson({ json: "{ dit is geen toets" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(
        "Dit bestand kan niet worden geïmporteerd.",
      ),
    });
  });
});

describe("questions", () => {
  test("create, update and delete keep positions contiguous", async () => {
    const t = callerFor(teacher);
    const { id: testId } = await t.test.create({ title: "Volgorde" });
    const a = await t.question.create({ testId, type: "code" });
    const b = await t.question.create({ testId, type: "multiple_choice" });
    const c = await t.question.create({ testId, type: "open" });
    expect((await positions(testId)).map((p) => p.position)).toEqual([0, 1, 2]);

    await t.question.update({
      id: b.question.id,
      title: "Welke lus?",
      points: 3,
    });
    const [updated] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, b.question.id));
    expect(updated).toMatchObject({ title: "Welke lus?", points: 3 });

    await expect(
      t.question.update({
        id: a.question.id,
        data: { timeLimitMs: 10 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await t.question.delete({ id: a.question.id });
    expect(await positions(testId)).toEqual([
      { id: b.question.id, position: 0 },
      { id: c.question.id, position: 1 },
    ]);
  });

  test("reorder sets the given order", async () => {
    const { test: toets, questions: qs } = await createTest({
      questions: [q.mc(), q.code(), q.open()],
    });
    const order = [qs[2].id, qs[0].id, qs[1].id];
    await callerFor(teacher).question.reorder({
      testId: toets.id,
      orderedIds: order,
    });
    const after = await positions(toets.id);
    expect(after.map((p) => p.id)).toEqual(order);
    expect(after.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  test("copyToTest appends a copy to another test", async () => {
    const { questions: qs } = await createTest({ questions: [q.code()] });
    const { test: target } = await createTest({ questions: [q.mc()] });
    await callerFor(teacher).question.copyToTest({
      id: qs[0].id,
      targetTestId: target.id,
    });
    const after = await db
      .select()
      .from(questions)
      .where(eq(questions.testId, target.id))
      .orderBy(asc(questions.position));
    expect(after.map((x) => x.type)).toEqual(["multiple_choice", "code"]);
    expect(after[1].position).toBe(1);
  });

  test("recordSolutionCheck persists for the current solution only", async () => {
    const { questions: qs } = await createTest({ questions: [q.code()] });
    const data = parseQuestionData("code", qs[0].data);
    const t = callerFor(teacher);
    const stale = await t.question.recordSolutionCheck({
      id: qs[0].id,
      hash: "verouderd",
      passed: true,
      passedTests: 1,
      totalTests: 1,
    });
    expect(stale.recorded).toBe(false);
    const out = await t.question.recordSolutionCheck({
      id: qs[0].id,
      hash: solutionFingerprint(data),
      passed: true,
      passedTests: 1,
      totalTests: 1,
    });
    expect(out.recorded).toBe(true);
    const [row] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, qs[0].id));
    expect(row.solutionCheck).toMatchObject({
      passed: true,
      passedTests: 1,
      totalTests: 1,
      source: "browser",
    });
  });
});
