/**
 * Shared contracts for questions, answers and grading results.
 *
 * Used by the database layer (jsonb columns), tRPC routers, the browser
 * Python runner and the server-side grader, so every side agrees on the
 * same shapes. Keep this file free of server-only or browser-only imports.
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*                                Code questions                              */
/* -------------------------------------------------------------------------- */

/**
 * How the printed output of a program is compared with the expected output.
 *
 * All modes compare the program's *clean* stdout: the prompt text passed to
 * `input("...")` is never part of it. That is the whole point of this app:
 * `naam = input("Wat is je naam? ")` and `naam = input()` grade the same.
 *
 * - flexible: case/whitespace-insensitive; every expected line must appear,
 *   in order, inside the output lines (extra text such as labels is allowed).
 *   Details (see src/lib/grading/compare.ts): only words and numbers count
 *   (punctuation is ignored, case too unless `ignoreCase` is false); numbers
 *   compare by value ("108.50" = "108.5"); matching respects token
 *   boundaries ("5" never matches inside "15"); extra output lines are only
 *   allowed when they look like a prompt/heading (end with ":" or "?").
 * - exact: lines must match exactly (trailing whitespace and trailing empty
 *   lines are ignored; `ignoreCase` still applies).
 * - contains: every expected line must appear somewhere in the output
 *   (as whole words/numbers, any order).
 * - numbers: only the numbers count: the expected numbers must appear in
 *   order (as a subsequence) among the printed numbers, each within
 *   `tolerance`; other numbers (e.g. the echoed input) may appear in
 *   between ("108,50", "1e3" and "-5" are understood).
 * - regex: `expectedOutput` is a (JavaScript) regular expression searched in
 *   the output (multiline; case-insensitive when `ignoreCase`).
 */
export const outputMatchModeSchema = z.enum([
  "flexible",
  "exact",
  "contains",
  "numbers",
  "regex",
]);
export type OutputMatchMode = z.infer<typeof outputMatchModeSchema>;

export const OUTPUT_MATCH_MODE_LABELS: Record<OutputMatchMode, string> = {
  flexible: "Flexibel",
  exact: "Exact",
  contains: "Bevat",
  numbers: "Alleen getallen",
  regex: "Reguliere expressie",
};

const testCaseBase = {
  id: z.string().min(1),
  /** Short Dutch label shown to students, e.g. "Invoer: Mark". */
  name: z.string().default(""),
  /** Hidden tests are graded but never shown (input/expected) to students. */
  hidden: z.boolean().default(false),
  /** Relative weight of this test within the question. */
  weight: z.number().positive().default(1),
};

/** Feed `stdin` (one line per `input()` call) and compare printed output. */
export const ioTestSchema = z.object({
  ...testCaseBase,
  kind: z.literal("io"),
  stdin: z.string().default(""),
  expectedOutput: z.string().default(""),
  match: outputMatchModeSchema.default("flexible"),
  ignoreCase: z.boolean().default(true),
  /** Absolute tolerance for `numbers` mode (and float comparison). */
  tolerance: z.number().min(0).default(0.01),
});
export type IoTest = z.infer<typeof ioTestSchema>;

/**
 * Run the student's code (with empty stdin), then evaluate `call` (a Python
 * expression such as `gemiddelde([1, 2, 3])`) and compare its return value
 * with `expected` (a Python literal such as `2.0`). Floats compare with
 * `tolerance`, containers compare recursively.
 */
export const functionTestSchema = z.object({
  ...testCaseBase,
  kind: z.literal("function"),
  call: z.string().min(1),
  expected: z.string().min(1),
  tolerance: z.number().min(0).default(1e-6),
});
export type FunctionTest = z.infer<typeof functionTestSchema>;

export const codeTestSchema = z.discriminatedUnion("kind", [
  ioTestSchema,
  functionTestSchema,
]);
export type CodeTest = z.infer<typeof codeTestSchema>;

/** Static (AST based) checks, e.g. "you must use a for-loop". */
export const codeConstructSchema = z.enum([
  "for_loop",
  "while_loop",
  "if_statement",
  "function_def",
  "function_call",
  "import",
  "list_comprehension",
]);
export type CodeConstruct = z.infer<typeof codeConstructSchema>;

export const CODE_CONSTRUCT_LABELS: Record<CodeConstruct, string> = {
  for_loop: "for-lus",
  while_loop: "while-lus",
  if_statement: "if-statement",
  function_def: "functie-definitie (def)",
  function_call: "aanroep van functie",
  import: "import",
  list_comprehension: "list comprehension",
};

export const codeCheckSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["requires", "forbids"]),
  construct: codeConstructSchema,
  /** Function name (function_call / function_def) or module (import). */
  value: z.string().optional(),
  /** Optional Dutch message shown when the check fails. */
  message: z.string().optional(),
  weight: z.number().positive().default(1),
});
export type CodeCheck = z.infer<typeof codeCheckSchema>;

export const codeQuestionDataSchema = z.object({
  starterCode: z.string().default(""),
  /** Model solution. Never sent to students. */
  solution: z.string().default(""),
  tests: z.array(codeTestSchema).default([]),
  checks: z.array(codeCheckSchema).default([]),
  /** Wall-clock limit per test run. */
  timeLimitMs: z.number().int().min(500).max(30_000).default(5_000),
});
export type CodeQuestionData = z.infer<typeof codeQuestionDataSchema>;

/* -------------------------------------------------------------------------- */
/*                         Multiple choice / open text                        */
/* -------------------------------------------------------------------------- */

export const choiceOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().default(""),
  correct: z.boolean().default(false),
});
export type ChoiceOption = z.infer<typeof choiceOptionSchema>;

export const multipleChoiceDataSchema = z.object({
  options: z.array(choiceOptionSchema).default([]),
  /** Allow selecting more than one option. */
  multiple: z.boolean().default(false),
  /** Shuffle option order per student. */
  shuffle: z.boolean().default(true),
  /** all_or_nothing: full points only when exactly right. partial: per option. */
  scoring: z.enum(["all_or_nothing", "partial"]).default("all_or_nothing"),
});
export type MultipleChoiceData = z.infer<typeof multipleChoiceDataSchema>;

export const openQuestionDataSchema = z.object({
  /** Shown to teachers while grading. Never sent to students. */
  modelAnswer: z.string().default(""),
  rubric: z.string().default(""),
  maxLength: z.number().int().positive().optional(),
});
export type OpenQuestionData = z.infer<typeof openQuestionDataSchema>;

/* -------------------------------------------------------------------------- */
/*                                  Questions                                 */
/* -------------------------------------------------------------------------- */

export const questionTypeSchema = z.enum(["code", "multiple_choice", "open"]);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  code: "Programmeervraag",
  multiple_choice: "Meerkeuzevraag",
  open: "Open vraag",
};

export const questionDataSchemas = {
  code: codeQuestionDataSchema,
  multiple_choice: multipleChoiceDataSchema,
  open: openQuestionDataSchema,
} as const;

export type QuestionDataByType = {
  code: CodeQuestionData;
  multiple_choice: MultipleChoiceData;
  open: OpenQuestionData;
};

/** Type + data pair, validated together. */
export const typedQuestionDataSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("code"), data: codeQuestionDataSchema }),
  z.object({
    type: z.literal("multiple_choice"),
    data: multipleChoiceDataSchema,
  }),
  z.object({ type: z.literal("open"), data: openQuestionDataSchema }),
]);
export type TypedQuestionData = z.infer<typeof typedQuestionDataSchema>;

export function parseQuestionData<T extends QuestionType>(
  type: T,
  data: unknown,
): QuestionDataByType[T] {
  return questionDataSchemas[type].parse(data ?? {}) as QuestionDataByType[T];
}

/* -------------------------------------------------------------------------- */
/*                                   Answers                                  */
/* -------------------------------------------------------------------------- */

export const codeResponseSchema = z.object({ code: z.string().max(100_000) });
export const multipleChoiceResponseSchema = z.object({
  selected: z.array(z.string()).max(50),
});
export const openResponseSchema = z.object({ text: z.string().max(20_000) });

export const answerResponseSchema = z.union([
  codeResponseSchema,
  multipleChoiceResponseSchema,
  openResponseSchema,
]);
export type CodeResponse = z.infer<typeof codeResponseSchema>;
export type MultipleChoiceResponse = z.infer<
  typeof multipleChoiceResponseSchema
>;
export type OpenResponse = z.infer<typeof openResponseSchema>;
export type AnswerResponse = z.infer<typeof answerResponseSchema>;

/* -------------------------------------------------------------------------- */
/*                               Grading results                              */
/* -------------------------------------------------------------------------- */

export const pythonErrorSchema = z.object({
  /** Python exception type, e.g. "NameError", "SyntaxError", "TimeoutError". */
  type: z.string(),
  message: z.string(),
  line: z.number().int().nullable().default(null),
  /** Trimmed traceback (harness frames removed). */
  traceback: z.string().default(""),
});
export type PythonError = z.infer<typeof pythonErrorSchema>;

export const testResultSchema = z.object({
  testId: z.string(),
  name: z.string().default(""),
  kind: z.enum(["io", "function"]),
  hidden: z.boolean(),
  weight: z.number(),
  passed: z.boolean(),
  /** Input shown to the student (omitted for hidden tests when sent to students). */
  stdin: z.string().optional(),
  /** io: expected output; function: `call` → `expected` description. */
  expected: z.string().optional(),
  /** function tests: the evaluated call, e.g. `gemiddelde([1, 2, 3])` (expected then holds the repr of the expected value). */
  call: z.string().optional(),
  /** io: clean stdout; function: repr of the returned value. */
  actual: z.string().optional(),
  /** Everything printed, for display (function tests). */
  stdout: z.string().optional(),
  error: pythonErrorSchema.nullable().optional(),
  timedOut: z.boolean().default(false),
  durationMs: z.number().default(0),
  /** Short Dutch explanation, e.g. "Regel 2 verschilt". */
  feedback: z.string().optional(),
});
export type TestResult = z.infer<typeof testResultSchema>;

export const checkResultSchema = z.object({
  checkId: z.string(),
  passed: z.boolean(),
  weight: z.number(),
  message: z.string(),
});
export type CheckResult = z.infer<typeof checkResultSchema>;

export const codeGradingResultSchema = z.object({
  kind: z.literal("code"),
  status: z.enum([
    "ok",
    "syntax_error",
    "timeout",
    "runtime_error",
    "internal_error",
  ]),
  /** Syntax error or internal error that prevented running any test. */
  error: pythonErrorSchema.nullable().default(null),
  tests: z.array(testResultSchema).default([]),
  checks: z.array(checkResultSchema).default([]),
  passedWeight: z.number(),
  totalWeight: z.number(),
  /** Fraction 0..1 of the question's points earned. */
  fraction: z.number().min(0).max(1),
  gradedAt: z.string(),
});
export type CodeGradingResult = z.infer<typeof codeGradingResultSchema>;

export const multipleChoiceGradingResultSchema = z.object({
  kind: z.literal("multiple_choice"),
  correct: z.boolean(),
  fraction: z.number().min(0).max(1),
  gradedAt: z.string(),
});

export const openGradingResultSchema = z.object({
  kind: z.literal("open"),
  /** Open questions always need a teacher. */
  needsReview: z.literal(true),
  gradedAt: z.string(),
});

export const gradingResultSchema = z.discriminatedUnion("kind", [
  codeGradingResultSchema,
  multipleChoiceGradingResultSchema,
  openGradingResultSchema,
]);
export type GradingResult = z.infer<typeof gradingResultSchema>;

/**
 * Remove everything a student may not see from a code grading result:
 * hidden tests keep only pass/fail, weight and their (generic) name.
 */
export function redactCodeResultForStudent(
  result: CodeGradingResult,
): CodeGradingResult {
  return {
    ...result,
    tests: result.tests.map((t, i) =>
      t.hidden
        ? {
            testId: t.testId,
            name: `Verborgen test ${i + 1}`,
            kind: t.kind,
            hidden: true,
            weight: t.weight,
            passed: t.passed,
            timedOut: t.timedOut,
            durationMs: t.durationMs,
          }
        : t,
    ),
  };
}

/** Strip teacher-only fields from question data before sending to students. */
export function questionDataForStudent(
  question: TypedQuestionData,
): Record<string, unknown> {
  switch (question.type) {
    case "code":
      return {
        starterCode: question.data.starterCode,
        timeLimitMs: question.data.timeLimitMs,
        tests: question.data.tests.filter((t) => !t.hidden),
        checks: question.data.checks.map(({ id, kind, construct, value, message }) => ({
          id,
          kind,
          construct,
          value,
          message,
        })),
      };
    case "multiple_choice":
      return {
        multiple: question.data.multiple,
        options: question.data.options.map(({ id, text }) => ({ id, text })),
      };
    case "open":
      return { maxLength: question.data.maxLength };
  }
}

/* -------------------------------------------------------------------------- */
/*                          Test & assignment settings                        */
/* -------------------------------------------------------------------------- */

export const showResultsSchema = z.enum([
  /** Students see score + visible test results right after submitting. */
  "immediately",
  /** After the assignment closes. */
  "after_close",
  /** Only after the teacher releases results. */
  "manual",
  /** Never. */
  "never",
]);
export type ShowResults = z.infer<typeof showResultsSchema>;

export const SHOW_RESULTS_LABELS: Record<ShowResults, string> = {
  immediately: "Direct na inleveren",
  after_close: "Na sluiten van de afname",
  manual: "Na vrijgave door docent",
  never: "Nooit",
};

export const assignmentSettingsSchema = z.object({
  shuffleQuestions: z.boolean().default(false),
  showResults: showResultsSchema.default("after_close"),
  /** Students may run their code in the browser ("Uitvoeren"). */
  allowCodeRun: z.boolean().default(true),
  /** Students may run the visible test cases themselves ("Testen"). */
  allowSelfTest: z.boolean().default(true),
  /** Ask the browser for fullscreen and log every exit. */
  requireFullscreen: z.boolean().default(false),
  /** Log tab switches / focus loss as attempt events. */
  logFocusEvents: z.boolean().default(true),
  /** Block paste into the editor (paste attempts are logged). */
  blockPaste: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).max(100).default(1),
});
export type AssignmentSettings = z.infer<typeof assignmentSettingsSchema>;

export const ASSIGNMENT_EVENT_TYPES = [
  "started",
  "resumed",
  "submitted",
  "focus_lost",
  "focus_gained",
  "visibility_hidden",
  "visibility_visible",
  "fullscreen_enter",
  "fullscreen_exit",
  "paste",
  "copy",
  "code_run",
  "self_test",
  "time_extended",
  "reopened",
] as const;
export type AttemptEventType = (typeof ASSIGNMENT_EVENT_TYPES)[number];
