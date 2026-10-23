/**
 * Regression (F03/F27): "print every possible answer" programs must not
 * score on the real example and demo questions, while the teachers' own
 * expected outputs keep passing. Python is not run here: the test feeds the
 * output such a program prints for every input straight into the grader.
 */
import { describe, expect, test } from "bun:test";
import type { HarnessAnalysis } from "@/lib/python/harness";
import { EXAMPLE_TESTS } from "@/lib/questions/examples";
import {
  type CodeQuestionData,
  codeQuestionDataSchema,
} from "@/lib/questions/schema";
import { DEMO_QUESTIONS } from "@/server/demo/questions";
import { buildGradingResult, type TestOutcome } from "./grade";

const analysis: HarnessAnalysis = {
  ok: true,
  constructs: {
    for_loop: true,
    while_loop: true,
    if_statement: true,
    function_def: true,
    function_call: true,
    import: false,
    list_comprehension: false,
  },
  functionDefs: [],
  functionCalls: ["print", "input", "int"],
  imports: [],
};

type NamedQuestion = { source: string; title: string; data: CodeQuestionData };

const CODE_QUESTIONS: NamedQuestion[] = [
  ...EXAMPLE_TESTS.flatMap((example) =>
    example.test.questions.flatMap((q) =>
      q.type === "code"
        ? [{ source: example.id, title: q.title, data: q.data }]
        : [],
    ),
  ),
  ...DEMO_QUESTIONS.flatMap((q) =>
    q.type === "code"
      ? [
          {
            source: "demo",
            title: q.title,
            data: codeQuestionDataSchema.parse(q.data),
          },
        ]
      : [],
  ),
];

function question(source: string, title: string): CodeQuestionData {
  const q = CODE_QUESTIONS.find(
    (x) => x.source === source && x.title === title,
  );
  if (!q) throw new Error(`vraag ${source}/${title} niet gevonden`);
  return q.data;
}

/** Grade a program that prints `stdout` whatever its input is. */
function gradeConstant(data: CodeQuestionData, stdout: string) {
  return buildGradingResult({
    tests: data.tests,
    checks: data.checks,
    analysis,
    outcomes: new Map<string, TestOutcome>(
      data.tests.map((t) => [
        t.id,
        { kind: "result", durationMs: 1, result: output(stdout) },
      ]),
    ),
    timeLimitMs: data.timeLimitMs,
  });
}

function output(stdout: string) {
  return {
    stdout,
    stderr: "",
    transcript: stdout,
    segments: [],
    error: null,
    moduleError: null,
    value: null,
    truncated: false,
  };
}

describe("printing every answer scores nothing", () => {
  test.each([
    "even oneven\n",
    "even / oneven\n",
    "even:\noneven:\n",
    "Antwoord: even:\nAntwoord: oneven:\n",
    "Het getal is even of oneven\n",
  ])("Even of oneven: %p", (stdout) => {
    const r = gradeConstant(question("basis", "Even of oneven"), stdout);
    expect(r.fraction).toBe(0);
  });

  test.each([
    "Je mag stemmen / Je mag nog niet stemmen\n",
    "Je mag stemmen\nJe mag nog niet stemmen\n",
    "Je mag stemmen:\nJe mag nog niet stemmen:\n",
    "Je mag nog niet stemmen\n",
  ])("Mag ik stemmen?: %p", (stdout) => {
    const r = gradeConstant(question("demo", "Mag ik stemmen?"), stdout);
    expect(r.fraction).toBeLessThan(1);
    // The required if-statement alone earns nothing.
    expect(r.tests.every((t) => !t.passed)).toBe(
      !stdout.startsWith("Je mag nog niet stemmen"),
    );
  });

  test("Optellen: all numbers on one line", () => {
    const r = gradeConstant(
      question("basis", "Optellen"),
      `${Array.from({ length: 1000 }, (_, i) => i).join(" ")}\n`,
    );
    expect(r.fraction).toBe(0);
  });

  test("Aantal klinkers: numbered candidates as prompt lines", () => {
    const r = gradeConstant(
      question("lussen-lijsten", "Aantal klinkers"),
      Array.from({ length: 20 }, (_, i) => `Aantal klinkers ${i}:`).join("\n"),
    );
    expect(r.fraction).toBe(0);
  });
});

describe("the expected output of every example and demo test passes", () => {
  for (const q of CODE_QUESTIONS) {
    const io = q.data.tests.filter((t) => t.kind === "io");
    if (io.length === 0) continue;
    test(`${q.source}: ${q.title}`, () => {
      const r = buildGradingResult({
        tests: q.data.tests,
        checks: [],
        analysis,
        outcomes: new Map<string, TestOutcome>(
          io.map((t) => [
            t.id,
            {
              kind: "result",
              durationMs: 1,
              result: output(t.kind === "io" ? `${t.expectedOutput}\n` : ""),
            },
          ]),
        ),
        timeLimitMs: q.data.timeLimitMs,
      });
      for (const t of r.tests.filter((t) => t.kind === "io")) {
        expect({
          test: t.testId,
          passed: t.passed,
          feedback: t.feedback,
        }).toEqual({ test: t.testId, passed: true, feedback: undefined });
      }
    });
  }
});
