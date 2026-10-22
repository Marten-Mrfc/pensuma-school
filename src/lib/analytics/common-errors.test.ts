import { describe, expect, test } from "bun:test";
import type { CodeGradingResult, TestResult } from "@/lib/questions/schema";
import {
  aggregateChoices,
  aggregateCodeResults,
  checkLabel,
  isPopularDistractor,
} from "./common-errors";

const testResult = (over: Partial<TestResult>): TestResult => ({
  testId: "t1",
  name: "",
  kind: "io",
  hidden: false,
  weight: 1,
  passed: true,
  timedOut: false,
  durationMs: 1,
  ...over,
});

const result = (over: Partial<CodeGradingResult>): CodeGradingResult => ({
  kind: "code",
  status: "ok",
  error: null,
  tests: [],
  checks: [],
  passedWeight: 0,
  totalWeight: 0,
  fraction: 0,
  gradedAt: "2026-10-22T09:00:00.000Z",
  ...over,
});

const eof = {
  type: "EOFError",
  message: "EOF when reading a line",
  line: 2,
  traceback: "",
};

describe("aggregateChoices", () => {
  const options = [
    { id: "a", text: "print", correct: true },
    { id: "b", text: "input", correct: false },
    { id: "c", text: "len", correct: false },
  ];

  test("single answer: percentages sum to 100", () => {
    const summary = aggregateChoices(options, [
      ["a"],
      ["a"],
      ["b"],
      ["b"],
      ["b"],
      ["c"],
      [],
      null,
    ]);
    expect(summary.answered).toBe(6);
    expect(summary.blank).toBe(2);
    const total = summary.options.reduce((s, o) => s + o.percentage, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(summary.options.map((o) => o.count)).toEqual([2, 3, 1]);
    expect(summary.options[0].correct).toBe(true);
  });

  test("a wrong option above 30% is a popular distractor", () => {
    const summary = aggregateChoices(options, [["a"], ["b"], ["b"], ["c"]]);
    expect(isPopularDistractor(summary.options[1])).toBe(true); // 50%
    expect(isPopularDistractor(summary.options[2])).toBe(false); // 25%
    expect(isPopularDistractor(summary.options[0])).toBe(false); // correct
  });

  test("unknown ids are ignored, duplicates count once", () => {
    const summary = aggregateChoices(options, [["a", "a"], ["zzz"]]);
    expect(summary.answered).toBe(1);
    expect(summary.blank).toBe(1);
    expect(summary.options[0].count).toBe(1);
  });

  test("no responses", () => {
    const summary = aggregateChoices(options, []);
    expect(summary.options.every((o) => o.percentage === 0)).toBe(true);
  });
});

describe("aggregateCodeResults", () => {
  const data = {
    tests: [
      { id: "t1", name: "Invoer: Mark", hidden: false },
      { id: "t2", name: "", hidden: true },
    ],
    checks: [
      {
        id: "c1",
        kind: "requires" as const,
        construct: "for_loop" as const,
      },
    ],
  };

  const results = [
    result({
      status: "runtime_error",
      tests: [
        testResult({ testId: "t1", passed: false, error: eof }),
        testResult({ testId: "t2", hidden: true, passed: false, error: eof }),
      ],
      checks: [{ checkId: "c1", passed: false, weight: 1, message: "x" }],
    }),
    result({
      tests: [
        testResult({ testId: "t1", passed: true }),
        testResult({ testId: "t2", hidden: true, passed: false }),
      ],
      checks: [{ checkId: "c1", passed: true, weight: 1, message: "x" }],
    }),
    result({
      status: "syntax_error",
      error: {
        type: "SyntaxError",
        message: "expected ':'",
        line: 1,
        traceback: "",
      },
    }),
    null,
  ];

  test("status counts and error types per student", () => {
    const summary = aggregateCodeResults(results, data);
    expect(summary.graded).toBe(3);
    expect(summary.statusCounts.runtime_error).toBe(1);
    expect(summary.statusCounts.ok).toBe(1);
    expect(summary.statusCounts.syntax_error).toBe(1);
    // EOFError appears in two tests of one answer: counted once.
    const eofCount = summary.errorTypes.find((e) => e.type === "EOFError");
    expect(eofCount?.count).toBe(1);
    expect(eofCount?.title).toBe("Te weinig invoer");
    expect(summary.errorTypes.map((e) => e.type)).toContain("SyntaxError");
  });

  test("failure rate per test, hidden tests included", () => {
    const summary = aggregateCodeResults(results, data);
    const t1 = summary.tests.find((t) => t.testId === "t1");
    const t2 = summary.tests.find((t) => t.testId === "t2");
    expect(t1).toMatchObject({ name: "Invoer: Mark", failed: 1, total: 2 });
    expect(t1?.rate).toBeCloseTo(0.5, 12);
    expect(t2).toMatchObject({ name: "Test 2", hidden: true, failed: 2 });
  });

  test("failures per check with a Dutch label", () => {
    const summary = aggregateCodeResults(results, data);
    expect(summary.checks).toEqual([
      { checkId: "c1", label: "for-lus", failed: 1, total: 2, rate: 0.5 },
    ]);
  });

  test("timeouts count as TimeoutError", () => {
    const summary = aggregateCodeResults([
      result({
        status: "timeout",
        tests: [testResult({ passed: false, timedOut: true })],
      }),
    ]);
    expect(summary.errorTypes[0]?.type).toBe("TimeoutError");
  });
});

describe("checkLabel", () => {
  test("requires and forbids", () => {
    expect(checkLabel({ kind: "requires", construct: "while_loop" })).toBe(
      "while-lus",
    );
    expect(
      checkLabel({ kind: "forbids", construct: "function_call", value: "max" }),
    ).toBe("geen aanroep van functie max");
  });
});
