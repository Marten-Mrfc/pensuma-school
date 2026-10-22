/**
 * Data leaks: nothing a student receives may contain teacher-only data
 * (solutions, hidden tests, model answers, rubrics, hint text, the access
 * code, correct-option flags before submitting). The fixture plants canary
 * strings in all of those fields.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  createAssignment,
  createClass,
  insertStudent,
} from "../support/factories";
import { waitForGrading } from "../support/wait";
import { createSecurityFixtures, type SecurityFixtures } from "./fixtures";

let f: SecurityFixtures;

const FORBIDDEN_KEYS = [
  "solution",
  "modelAnswer",
  "rubric",
  "rubricItems",
  "accessCode",
];

/** Every canary string and forbidden key found in `value`. */
function leaks(
  value: unknown,
  opts: { allowKeys?: string[]; allowCanaries?: string[] } = {},
): string[] {
  const json = JSON.stringify(value);
  const found: string[] = [];
  const canaries = Object.values(f.canary).filter(
    (c) => !opts.allowCanaries?.includes(c),
  );
  for (const canary of canaries) {
    if (json.includes(canary)) found.push(`canary ${canary}`);
  }
  if (/CANARY_/.test(json) && found.length === 0 && !opts.allowCanaries) {
    found.push("canary CANARY_*");
  }
  for (const key of FORBIDDEN_KEYS) {
    if (opts.allowKeys?.includes(key)) continue;
    if (json.includes(`"${key}":`)) found.push(`key ${key}`);
  }
  return found;
}

beforeAll(async () => {
  await resetDatabase();
  f = await createSecurityFixtures();
});

afterAll(async () => {
  await f?.cleanup();
});

describe("before submitting", () => {
  test("dashboard, getAssignment and myResults leak nothing", async () => {
    const a1 = callerFor(f.a1);
    expect(leaks(await a1.portal.dashboard())).toEqual([]);
    expect(leaks(await a1.portal.getAssignment({ id: f.aOpen.id }))).toEqual(
      [],
    );
    expect(leaks(await a1.portal.myResults())).toEqual([]);
  });

  test("getAttempt leaks nothing and has no correct-option flags", async () => {
    const out = await callerFor(f.a1).portal.getAttempt({
      attemptId: f.a1AttemptId,
    });
    expect(leaks(out)).toEqual([]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('"correct":true');
    expect(json).not.toContain('"correct":');
    // Hidden tests are not sent at all; hints only as id + penalty.
    expect(json).not.toContain("verborgen");
    const code = out.questions.find((q) => q.type === "code");
    expect(code?.data).toMatchObject({ hints: [{ id: "h1", penalty: 0.25 }] });
  });
});

describe("after submitting", () => {
  test("getResult and myResults leak nothing (hidden tests redacted)", async () => {
    const a1 = callerFor(f.a1);
    await a1.portal.saveAnswer({
      attemptId: f.a1AttemptId,
      questionId: f.questions.code.id,
      response: { code: 'print("Hallo")\n' },
    });
    await a1.portal.saveAnswer({
      attemptId: f.a1AttemptId,
      questionId: f.questions.mc.id,
      response: { selected: ["goed"] },
    });
    await a1.portal.saveAnswer({
      attemptId: f.a1AttemptId,
      questionId: f.questions.open.id,
      response: { text: "Mijn uitleg" },
    });
    await a1.portal.submitAttempt({ attemptId: f.a1AttemptId });
    await waitForGrading(f.a1AttemptId);

    const result = await a1.portal.getResult({ attemptId: f.a1AttemptId });
    expect(result.visible).toBe(true);
    // Rubric criteria (label + points) may be shown once results are
    // visible (P4 result page); the teacher's rubric text never.
    expect(
      leaks(result, {
        allowKeys: ["rubric", "rubricItems"],
        allowCanaries: [f.canary.rubricItem],
      }),
    ).toEqual([]);
    const json = JSON.stringify(result);
    expect(json).not.toContain(f.canary.hidden);
    expect(json).not.toContain(f.canary.hiddenStdin);
    expect(json).toContain("Verborgen test");

    expect(leaks(await a1.portal.myResults())).toEqual([]);
    expect(leaks(await a1.portal.dashboard())).toEqual([]);
    expect(
      leaks(await a1.portal.getAttempt({ attemptId: f.a1AttemptId })),
    ).toEqual([]);
  });

  test("a submitted exam attempt with hidden results returns no questions", async () => {
    const student = await insertStudent();
    const klas = await createClass(undefined, [student.id]);
    const exam = await createAssignment({
      testId: f.test.id,
      classId: klas.id,
      mode: "exam",
      status: "open",
      settings: { showResults: "after_close", maxAttempts: 1 },
    });
    const caller = callerFor(student);
    const { attemptId } = await caller.portal.startAttempt({
      assignmentId: exam.id,
    });
    await caller.portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    const out = await caller.portal.getAttempt({ attemptId });
    expect(out.questions).toEqual([]);
    expect(out.answers).toEqual([]);
    expect(out).toMatchObject({ contentHidden: true });
  });

  test("an exam with attempts left shows no correct answers in getResult", async () => {
    const student = await insertStudent();
    const klas = await createClass(undefined, [student.id]);
    const exam = await createAssignment({
      testId: f.test.id,
      classId: klas.id,
      mode: "exam",
      status: "open",
      settings: { showResults: "immediately", maxAttempts: 3 },
    });
    const caller = callerFor(student);
    const { attemptId } = await caller.portal.startAttempt({
      assignmentId: exam.id,
    });
    await caller.portal.saveAnswer({
      attemptId,
      questionId: f.questions.code.id,
      response: { code: 'print("Hallo")\n' },
    });
    await caller.portal.submitAttempt({ attemptId });
    await waitForGrading(attemptId);
    const out = await caller.portal.getResult({ attemptId });
    const json = JSON.stringify(out);
    expect(json).not.toContain('"correct":true');
    expect(json).not.toContain('"expected":');
    expect(out).toMatchObject({ answersHidden: true });
  });
});
