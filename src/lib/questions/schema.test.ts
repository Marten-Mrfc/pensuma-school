import { describe, expect, test } from "bun:test";
import {
  ASSIGNMENT_EVENT_TYPES,
  assignmentSettingsSchema,
  type CodeGradingResult,
  codeGradingResultSchema,
  codeQuestionDataSchema,
  GRADING_METHOD_LABELS,
  openQuestionDataSchema,
  questionDataForStudent,
  redactCodeResultForStudent,
  SHOW_SOLUTIONS_LABELS,
  type StudentCodeQuestionData,
} from "./schema";

describe("assignmentSettingsSchema", () => {
  test("defaults from {}", () => {
    const s = assignmentSettingsSchema.parse({});
    expect(s.logFocusEvents).toBe(false);
    expect(s.allowHints).toBe(true);
    expect(s.showSolutions).toBe("never");
    expect(s.codeTips).toBe(true);
    expect(s.grading).toEqual({
      method: "linear",
      passPercentage: 55,
      nTerm: 1,
    });
  });

  test("a partial grading object keeps the nested defaults", () => {
    const s = assignmentSettingsSchema.parse({ grading: { method: "cesuur" } });
    expect(s.grading).toEqual({
      method: "cesuur",
      passPercentage: 55,
      nTerm: 1,
    });
  });

  test("stored settings without the new keys still parse", () => {
    const stored = {
      shuffleQuestions: false,
      showResults: "after_close",
      allowCodeRun: true,
      allowSelfTest: true,
      requireFullscreen: false,
      logFocusEvents: true,
      blockPaste: false,
      maxAttempts: 1,
    };
    const s = assignmentSettingsSchema.parse(stored);
    expect(s.logFocusEvents).toBe(true);
    expect(s.grading.method).toBe("linear");
  });

  test("grading values are validated", () => {
    expect(
      assignmentSettingsSchema.safeParse({ grading: { passPercentage: 95 } })
        .success,
    ).toBe(false);
    expect(
      assignmentSettingsSchema.safeParse({ grading: { nTerm: 3.5 } }).success,
    ).toBe(false);
  });

  test("labels and event types", () => {
    expect(Object.keys(SHOW_SOLUTIONS_LABELS)).toEqual([
      "never",
      "after_attempts",
      "after_close",
    ]);
    expect(Object.keys(GRADING_METHOD_LABELS)).toEqual([
      "linear",
      "cesuur",
      "nterm",
    ]);
    expect(ASSIGNMENT_EVENT_TYPES).toContain("hint_revealed");
  });
});

describe("question data", () => {
  test("minimal code data has no hints", () => {
    expect(codeQuestionDataSchema.parse({}).hints).toEqual([]);
    const withHint = codeQuestionDataSchema.parse({ hints: [{ id: "h1" }] });
    expect(withHint.hints).toEqual([{ id: "h1", text: "", penalty: 0 }]);
  });

  test("at most 5 hints, penalty 0..1", () => {
    const hints = Array.from({ length: 6 }, (_, i) => ({ id: `h${i}` }));
    expect(codeQuestionDataSchema.safeParse({ hints }).success).toBe(false);
    expect(
      codeQuestionDataSchema.safeParse({ hints: [{ id: "h", penalty: 2 }] })
        .success,
    ).toBe(false);
  });

  test("minimal open data has no rubric items", () => {
    expect(openQuestionDataSchema.parse({}).rubricItems).toEqual([]);
    expect(
      openQuestionDataSchema.parse({ rubricItems: [{ id: "r1" }] }).rubricItems,
    ).toEqual([{ id: "r1", label: "", points: 1 }]);
  });
});

describe("questionDataForStudent", () => {
  const code = codeQuestionDataSchema.parse({
    starterCode: "# begin hier",
    solution: "def kwadraat(x):\n    return x * x  # CANARY_SOLUTION",
    tests: [
      {
        id: "t1",
        kind: "io",
        name: "Zichtbaar",
        stdin: "3",
        expectedOutput: "9",
      },
      {
        id: "t2",
        kind: "io",
        hidden: true,
        stdin: "CANARY_HIDDEN_STDIN",
        expectedOutput: "CANARY_HIDDEN_OUTPUT",
      },
      {
        id: "t3",
        kind: "function",
        call: "kwadraat(4)",
        expected: "16",
      },
      {
        id: "t4",
        kind: "function",
        hidden: true,
        call: "  dubbel(5)",
        expected: "CANARY_HIDDEN_EXPECTED",
      },
      {
        id: "t5",
        kind: "function",
        call: "kwadraat(5)",
        expected: "25",
      },
    ],
    checks: [{ id: "c1", kind: "requires", construct: "function_def" }],
    hints: [
      { id: "h1", text: "CANARY_HINT_ONE", penalty: 0.1 },
      { id: "h2", text: "CANARY_HINT_TWO" },
    ],
  });

  test("code: no hint text, solution or hidden test data", () => {
    const data = questionDataForStudent({ type: "code", data: code });
    const json = JSON.stringify(data);
    expect(json).not.toContain("CANARY_HINT");
    expect(json).not.toContain("CANARY_SOLUTION");
    expect(json).not.toContain("CANARY_HIDDEN");
    expect(json).not.toContain("solution");
    expect(json).toContain("functionNames");
    expect(json).toContain("hasIoTests");

    const typed = data as StudentCodeQuestionData;
    expect(typed.hints).toEqual([
      { id: "h1", penalty: 0.1 },
      { id: "h2", penalty: 0 },
    ]);
    // Hidden tests included, unique, in order of appearance.
    expect(typed.functionNames).toEqual(["kwadraat", "dubbel"]);
    expect(typed.hasIoTests).toBe(true);
    expect(typed.tests.map((t) => t.id)).toEqual(["t1", "t3", "t5"]);
    expect(typed.starterCode).toBe("# begin hier");
  });

  test("code without io tests", () => {
    const data = questionDataForStudent({
      type: "code",
      data: codeQuestionDataSchema.parse({
        tests: [{ id: "t", kind: "function", call: "f()", expected: "1" }],
      }),
    }) as StudentCodeQuestionData;
    expect(data.hasIoTests).toBe(false);
    expect(data.functionNames).toEqual(["f"]);
    expect(data.hints).toEqual([]);
  });

  test("open: no model answer, rubric or rubric items", () => {
    const data = questionDataForStudent({
      type: "open",
      data: openQuestionDataSchema.parse({
        modelAnswer: "CANARY_MODEL_ANSWER",
        rubric: "CANARY_RUBRIC",
        rubricItems: [{ id: "r1", label: "CANARY_RUBRIC_ITEM", points: 2 }],
        maxLength: 500,
      }),
    });
    const json = JSON.stringify(data);
    expect(json).not.toContain("CANARY");
    expect(json).not.toContain("rubric");
    expect(json).not.toContain("modelAnswer");
    expect(data).toEqual({ maxLength: 500 });
  });

  test("multiple choice: no correct flags", () => {
    const data = questionDataForStudent({
      type: "multiple_choice",
      data: {
        options: [
          { id: "a", text: "Ja", correct: true },
          { id: "b", text: "Nee", correct: false },
        ],
        multiple: false,
        shuffle: true,
        scoring: "all_or_nothing",
      },
    });
    expect(JSON.stringify(data)).not.toContain("correct");
  });
});

describe("redactCodeResultForStudent", () => {
  const full: CodeGradingResult = codeGradingResultSchema.parse({
    kind: "code",
    status: "ok",
    error: null,
    tests: [
      {
        testId: "zichtbaar",
        name: "Invoer: 3",
        kind: "io",
        hidden: false,
        weight: 1,
        passed: true,
        stdin: "3",
        expected: "9",
        actual: "9",
        timedOut: false,
        durationMs: 12,
        feedback: "Goed zo!",
      },
      {
        testId: "geheim-io",
        name: "CANARY_HIDDEN_NAME",
        kind: "io",
        hidden: true,
        weight: 2,
        passed: false,
        stdin: "CANARY_HIDDEN_STDIN",
        expected: "CANARY_HIDDEN_EXPECTED",
        actual: "CANARY_HIDDEN_ACTUAL",
        stdout: "CANARY_HIDDEN_STDOUT",
        error: {
          type: "ValueError",
          message: "CANARY_HIDDEN_ERROR",
          line: 2,
          traceback: "CANARY_HIDDEN_TRACEBACK",
        },
        timedOut: false,
        durationMs: 40,
        feedback: "CANARY_HIDDEN_FEEDBACK",
      },
      {
        testId: "geheim-fn",
        name: "dubbel(5) → 10",
        kind: "function",
        hidden: true,
        weight: 1,
        passed: true,
        call: "CANARY_HIDDEN_CALL",
        expected: "10",
        actual: "10",
        timedOut: true,
        durationMs: 5000,
      },
    ],
    checks: [
      { checkId: "c1", passed: true, weight: 1, message: "Gebruik een lus" },
    ],
    passedWeight: 3,
    totalWeight: 5,
    fraction: 0.6,
    gradedAt: "2026-10-22T10:00:00.000Z",
  });

  test("a hidden test keeps exactly id, generic name, kind, weight and outcome", () => {
    const redacted = redactCodeResultForStudent(full);
    expect(redacted.tests[1]).toEqual({
      testId: "geheim-io",
      name: "Verborgen test 2",
      kind: "io",
      hidden: true,
      weight: 2,
      passed: false,
      timedOut: false,
      durationMs: 40,
    });
    expect(redacted.tests[2]).toEqual({
      testId: "geheim-fn",
      name: "Verborgen test 3",
      kind: "function",
      hidden: true,
      weight: 1,
      passed: true,
      timedOut: true,
      durationMs: 5000,
    });
    expect(JSON.stringify(redacted)).not.toContain("CANARY_HIDDEN");
  });

  test("visible tests, checks and totals are unchanged", () => {
    const redacted = redactCodeResultForStudent(full);
    expect(redacted.tests[0]).toEqual(full.tests[0]);
    expect(redacted.checks).toEqual(full.checks);
    expect(redacted).toMatchObject({
      kind: "code",
      status: "ok",
      passedWeight: 3,
      totalWeight: 5,
      fraction: 0.6,
      gradedAt: full.gradedAt,
    });
    // Still a valid result for the student UI.
    expect(codeGradingResultSchema.safeParse(redacted).success).toBe(true);
  });

  test("the input is not mutated", () => {
    const before = JSON.stringify(full);
    redactCodeResultForStudent(full);
    expect(JSON.stringify(full)).toBe(before);
  });
});
