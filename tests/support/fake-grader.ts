/**
 * Deterministic stand-in for `@/server/grader` (installed by
 * tests/setup/preload.ts with `mock.module`). Integration tests never start
 * Pyodide; the real sandbox is covered by `bun run test:grader`.
 *
 * It exports the same names as src/server/grader/index.ts (a test in
 * tests/integration/harness.test.ts keeps them in sync).
 *
 * Default behaviour: every test and check passes, unless the student's code
 * contains `# FOUT`, in which case everything fails. Override per test with
 * `setFakeGrader(fn)` / `setFakeRunner(fn)`; `resetDatabase()` resets both.
 */
import type { GradeInput, RunInput, RunResult } from "@/lib/python/types";
import {
  type CodeGradingResult,
  codeGradingResultSchema,
  type TestResult,
} from "@/lib/questions/schema";

/** Put this in student code to make the fake grader fail every test. */
export const FAIL_MARKER = "# FOUT";

export type FakeGradeFn = (
  input: GradeInput,
) => CodeGradingResult | Promise<CodeGradingResult>;
export type FakeRunFn = (input: RunInput) => RunResult | Promise<RunResult>;

/** Every input the fake grader received, in order (for assertions). */
export const gradeCalls: GradeInput[] = [];
/** Every input the fake runner received, in order. */
export const runCalls: RunInput[] = [];

/** The default fake: one result per test (hidden/weight/name kept). */
export function defaultGrade(input: GradeInput): CodeGradingResult {
  const pass = !input.code.includes(FAIL_MARKER);
  const tests: TestResult[] = input.tests.map((t) => {
    const expected = t.kind === "io" ? t.expectedOutput : t.expected;
    return {
      testId: t.id,
      name: t.name ?? "",
      kind: t.kind,
      hidden: t.hidden ?? false,
      weight: t.weight ?? 1,
      passed: pass,
      ...(t.kind === "io" ? { stdin: t.stdin } : { call: t.call }),
      // Like the real grader, the full result holds expected and actual
      // values (also for hidden tests); students only ever get a redacted copy.
      expected,
      actual: pass ? expected : "fout",
      error: null,
      timedOut: false,
      durationMs: 1,
      feedback: pass ? undefined : "Je uitvoer klopt niet.",
    };
  });
  const checks = input.checks.map((c) => ({
    checkId: c.id,
    passed: pass,
    weight: c.weight ?? 1,
    message: c.message ?? "",
  }));
  const totalWeight =
    tests.reduce((s, t) => s + t.weight, 0) +
    checks.reduce((s, c) => s + c.weight, 0);
  const passedWeight = pass ? totalWeight : 0;
  return codeGradingResultSchema.parse({
    kind: "code",
    status: "ok",
    error: null,
    tests,
    checks,
    passedWeight,
    totalWeight,
    fraction: totalWeight > 0 ? passedWeight / totalWeight : pass ? 1 : 0,
    gradedAt: new Date().toISOString(),
  });
}

/** The default fake runner: echoes stdin, never fails. */
export function defaultRun(input: RunInput): RunResult {
  const failed = input.code.includes(FAIL_MARKER);
  return {
    stdout: failed ? "" : (input.stdin ?? ""),
    stderr: "",
    transcript: failed ? "" : (input.stdin ?? ""),
    segments: [],
    error: failed
      ? {
          type: "NameError",
          message: "name 'fout' is not defined",
          line: 1,
          traceback: "",
        }
      : null,
    timedOut: false,
    durationMs: 1,
  };
}

let gradeImpl: FakeGradeFn = defaultGrade;
let runImpl: FakeRunFn = defaultRun;

/** Replace the grading behaviour until the next `resetFakeGrader()`. */
export function setFakeGrader(fn: FakeGradeFn): void {
  gradeImpl = fn;
}

/** Replace the run behaviour until the next `resetFakeGrader()`. */
export function setFakeRunner(fn: FakeRunFn): void {
  runImpl = fn;
}

/** Restore the defaults and clear the recorded calls. */
export function resetFakeGrader(): void {
  gradeImpl = defaultGrade;
  runImpl = defaultRun;
  gradeCalls.length = 0;
  runCalls.length = 0;
}

/* ------------- Same names as src/server/grader/index.ts ------------------ */

export async function gradeCode(input: GradeInput): Promise<CodeGradingResult> {
  gradeCalls.push(input);
  return codeGradingResultSchema.parse(await gradeImpl(input));
}

export async function gradeCodeBatch(
  items: GradeInput[],
): Promise<CodeGradingResult[]> {
  const results: CodeGradingResult[] = [];
  for (const item of items) results.push(await gradeCode(item));
  return results;
}

export async function runCode(input: RunInput): Promise<RunResult> {
  runCalls.push(input);
  return runImpl(input);
}

export async function runCodeBatch(
  code: string,
  stdins: string[],
  timeLimitMs?: number,
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const stdin of stdins) {
    results.push(await runCode({ code, stdin, timeLimitMs }));
  }
  return results;
}

export function warmUpGrader(): void {}
