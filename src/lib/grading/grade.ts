/**
 * Grading logic shared by the server grader and the browser self-test
 * (isomorphic). The interpreter only *runs* code (see harness.ts); every
 * pass/fail decision is made here, in TypeScript, so expected outputs and
 * expected values never enter the sandbox.
 *
 * fraction = passedWeight / totalWeight over all tests AND checks.
 * status:  syntax_error  code doesn't compile (no test ran)
 *          internal_error the runner itself failed (not the student's fault)
 *          timeout        at least one test hit the time limit
 *          runtime_error  at least one test ended with an exception
 *          ok             everything ran (tests may still have failed)
 */

import type {
  HarnessAnalysis,
  HarnessRunRequest,
  HarnessRunResult,
} from "@/lib/python/harness";
import type { GradeInput } from "@/lib/python/types";
import type {
  CheckResult,
  CodeCheck,
  CodeGradingResult,
  CodeTest,
  FunctionTest,
  IoTest,
  PythonError,
  TestResult,
} from "@/lib/questions/schema";
import { compareOutput, compareValues, quote } from "./compare";
import {
  type PyValue,
  pyRepr,
  pyTypeName,
  tryParsePythonLiteral,
} from "./pyvalue";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

/** What happened when one test was run by an executor. */
export type TestOutcome =
  | { kind: "result"; result: HarnessRunResult; durationMs: number }
  | { kind: "timeout"; durationMs: number }
  /** The runner had to stop the program (memory limit, crash, total time). */
  | { kind: "crashed"; error: PythonError; durationMs: number };

/** Runs code for the grader: the server sandbox pool or the browser worker. */
export interface GradingExecutor {
  /** Syntax check + AST facts. Must run before any student code runs. */
  analyze(code: string): Promise<HarnessAnalysis>;
  /** Run one test with a wall-clock limit. Must never throw for student errors. */
  run(request: HarnessRunRequest, timeLimitMs: number): Promise<TestOutcome>;
}

/* -------------------------------------------------------------------------- */
/*                                Common errors                               */
/* -------------------------------------------------------------------------- */

export const TIMEOUT_MESSAGE =
  "Je programma duurde te lang – zit er misschien een oneindige lus in?";

export function timeoutError(timeLimitMs: number): PythonError {
  const s = timeLimitMs / 1000;
  const secs = Number.isInteger(s) ? String(s) : s.toFixed(1).replace(".", ",");
  return {
    type: "TimeoutError",
    message: `${TIMEOUT_MESSAGE} (tijdslimiet: ${secs} ${s === 1 ? "seconde" : "seconden"})`,
    line: null,
    traceback: "",
  };
}

export const MEMORY_ERROR: PythonError = {
  type: "MemoryError",
  message: "Je programma gebruikte te veel geheugen en is gestopt.",
  line: null,
  traceback: "",
};

export const TOTAL_TIMEOUT_ERROR: PythonError = {
  type: "TimeoutError",
  message:
    "Het nakijken duurde in totaal te lang, daarom is deze test niet meer uitgevoerd.",
  line: null,
  traceback: "",
};

export function internalError(detail?: string): PythonError {
  return {
    type: "InternalError",
    message:
      "Er ging iets mis bij het uitvoeren van je code. Dit ligt niet aan jou; probeer het later opnieuw.",
    line: null,
    traceback: detail ?? "",
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Feedback                                  */
/* -------------------------------------------------------------------------- */

function lineSuffix(error: PythonError): string {
  return error.line ? ` op regel ${error.line}` : "";
}

/** One-line Dutch description of an error, for test feedback. */
export function errorFeedback(error: PythonError): string {
  switch (error.type) {
    case "TimeoutError":
    case "MemoryError":
    case "OutputLimitExceeded":
    case "InternalError":
    case "Stopped":
    case "SandboxCrash":
      return error.message;
    case "EOFError":
      return `${error.message}${error.line ? ` (regel ${error.line})` : ""}`;
    default:
      return `Je programma stopte met een fout${lineSuffix(error)}: ${error.type}${error.message ? `: ${error.message}` : ""}`;
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Evaluation                                 */
/* -------------------------------------------------------------------------- */

function baseResult(test: CodeTest, durationMs: number): TestResult {
  return {
    testId: test.id,
    name: test.name,
    kind: test.kind,
    hidden: test.hidden,
    weight: test.weight,
    passed: false,
    timedOut: false,
    durationMs: Math.round(durationMs),
  };
}

function outcomeFailure(
  base: TestResult,
  outcome: Exclude<TestOutcome, { kind: "result" }>,
  timeLimitMs: number,
): TestResult {
  if (outcome.kind === "timeout") {
    const error = timeoutError(timeLimitMs);
    return { ...base, timedOut: true, error, feedback: error.message };
  }
  return {
    ...base,
    timedOut: outcome.error.type === "TimeoutError",
    error: outcome.error,
    feedback: errorFeedback(outcome.error),
  };
}

export function evaluateIoTest(
  test: IoTest,
  outcome: TestOutcome,
  timeLimitMs: number,
): TestResult {
  const base: TestResult = {
    ...baseResult(test, outcome.durationMs),
    stdin: test.stdin,
    expected: test.expectedOutput,
  };
  if (outcome.kind !== "result")
    return outcomeFailure(base, outcome, timeLimitMs);
  const r = outcome.result;
  const withOutput: TestResult = { ...base, actual: r.stdout, error: r.error };
  const cmp = compareOutput(r.stdout, test.expectedOutput, {
    match: test.match,
    ignoreCase: test.ignoreCase,
    tolerance: test.tolerance,
  });
  if (r.error) {
    const feedback = cmp.passed
      ? `De uitvoer klopt, maar je programma stopte daarna met een fout${lineSuffix(r.error)}: ${r.error.type}${r.error.message ? `: ${r.error.message}` : ""}`
      : errorFeedback(r.error);
    return { ...withOutput, passed: false, feedback };
  }
  return {
    ...withOutput,
    passed: cmp.passed,
    feedback: cmp.feedback ?? undefined,
  };
}

function calledName(call: string): string | null {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(call);
  return m ? m[1] : null;
}

function isNone(v: PyValue): boolean {
  return v.t === "none";
}

export function evaluateFunctionTest(
  test: FunctionTest,
  outcome: TestOutcome,
  timeLimitMs: number,
): TestResult {
  const parsed = tryParsePythonLiteral(test.expected);
  const base: TestResult = {
    ...baseResult(test, outcome.durationMs),
    call: test.call,
    expected: parsed.ok ? pyRepr(parsed.value) : test.expected,
  };
  if (!parsed.ok) {
    return {
      ...base,
      feedback: `De verwachte waarde van deze test (${quote(test.expected)}) is geen geldige Python-waarde: ${parsed.error}. Vraag je docent om dit te controleren.`,
      error: internalError(parsed.error),
    };
  }
  if (outcome.kind !== "result")
    return outcomeFailure(base, outcome, timeLimitMs);
  const r = outcome.result;
  const fn = calledName(test.call);
  const withOutput: TestResult = { ...base, stdout: r.stdout };

  if (r.error && r.error.type === "OutputLimitExceeded") {
    return { ...withOutput, error: r.error, feedback: r.error.message };
  }
  if (!r.value) {
    const callError = r.error;
    const missingFunction =
      callError?.type === "NameError" &&
      fn !== null &&
      callError.message.includes(`'${fn}'`);
    if (missingFunction && r.moduleError) {
      return {
        ...withOutput,
        error: r.moduleError,
        feedback: `Je programma stopte met een fout${lineSuffix(r.moduleError)} voordat de functie ${quote(fn)} gemaakt was: ${r.moduleError.type}: ${r.moduleError.message}`,
      };
    }
    if (missingFunction) {
      return {
        ...withOutput,
        error: callError,
        feedback: `De functie ${quote(fn)} bestaat niet in je programma. Controleer de naam (hoofdletters tellen mee) en of je hem met def hebt gemaakt.`,
      };
    }
    const err = callError ?? internalError("geen resultaat");
    return {
      ...withOutput,
      error: err,
      feedback: `${quote(test.call)} gaf een fout${lineSuffix(err)}: ${err.type}${err.message ? `: ${err.message}` : ""}`,
    };
  }

  const actual = r.value;
  const moduleNote = r.moduleError
    ? ` Let op: buiten de functie gaf je programma een fout${lineSuffix(r.moduleError)} (${r.moduleError.type}). Voor deze test telt alleen de functie.`
    : "";
  const cmp = compareValues(actual.value, parsed.value, test.tolerance);
  if (cmp.equal) {
    return {
      ...withOutput,
      actual: actual.repr,
      passed: true,
      feedback: moduleNote ? moduleNote.trim() : undefined,
    };
  }
  let feedback: string;
  if (isNone(actual.value) && !isNone(parsed.value)) {
    feedback =
      r.stdout.trim() !== ""
        ? `Je functie printte iets, maar gaf None terug. Gebruik return in plaats van print om het antwoord terug te geven (verwacht: ${quote(pyRepr(parsed.value))}).`
        : `Je functie gaf None terug, maar verwacht werd ${quote(pyRepr(parsed.value))}. Vergeet je return?`;
  } else if (
    pyTypeName(actual.value) !== pyTypeName(parsed.value) &&
    !(
      ["int", "float"].includes(actual.value.t) &&
      ["int", "float"].includes(parsed.value.t)
    )
  ) {
    feedback = `Je functie gaf ${quote(actual.repr)} (${pyTypeName(actual.value)}) terug, maar verwacht werd ${quote(pyRepr(parsed.value))} (${pyTypeName(parsed.value)}).`;
  } else if (["int", "float", "str", "bool"].includes(parsed.value.t)) {
    feedback = `Je functie gaf ${quote(actual.repr)} terug, maar verwacht werd ${quote(pyRepr(parsed.value))}.`;
  } else {
    feedback =
      `Je functie gaf ${quote(actual.repr)} terug. ${cmp.reason ?? ""}`.trim();
    if (!/[.!?]$/.test(feedback)) feedback += ".";
  }
  return {
    ...withOutput,
    actual: actual.repr,
    feedback: feedback + moduleNote,
  };
}

export function evaluateTest(
  test: CodeTest,
  outcome: TestOutcome,
  timeLimitMs: number,
): TestResult {
  return test.kind === "io"
    ? evaluateIoTest(test, outcome, timeLimitMs)
    : evaluateFunctionTest(test, outcome, timeLimitMs);
}

/* --------------------------------- Checks --------------------------------- */

const CONSTRUCT_NOUN: Record<string, string> = {
  for_loop: "een for-lus",
  while_loop: "een while-lus",
  if_statement: "een if-statement",
  list_comprehension: "een list comprehension",
};

/** Default Dutch rule text for a check, e.g. "Je moet een for-lus gebruiken." */
export function defaultCheckMessage(check: CodeCheck): string {
  const v = check.value?.trim();
  const req = check.kind === "requires";
  switch (check.construct) {
    case "function_def":
      if (v)
        return req
          ? `Je moet een functie ${quote(v)} maken (met def).`
          : `Je mag geen functie ${quote(v)} maken.`;
      return req
        ? "Je moet een functie maken (met def)."
        : "Je mag geen eigen functies maken (def).";
    case "function_call":
      if (v)
        return req
          ? `Je moet ${quote(`${v}()`)} gebruiken.`
          : `Je mag ${quote(`${v}()`)} niet gebruiken.`;
      return req
        ? "Je moet een functie aanroepen."
        : "Je mag geen functies aanroepen.";
    case "import":
      if (v)
        return req
          ? `Je moet de module ${quote(v)} importeren.`
          : `Je mag de module ${quote(v)} niet importeren.`;
      return req
        ? "Je moet een module importeren."
        : "Je mag geen modules importeren.";
    default: {
      const noun = CONSTRUCT_NOUN[check.construct] ?? check.construct;
      return req
        ? `Je moet ${noun} gebruiken.`
        : `Je mag geen ${noun.replace(/^een /, "")} gebruiken.`;
    }
  }
}

export function evaluateCheck(
  check: CodeCheck,
  analysis: HarnessAnalysis,
): CheckResult {
  const message = check.message?.trim() || defaultCheckMessage(check);
  if (!analysis.ok) {
    return { checkId: check.id, passed: false, weight: check.weight, message };
  }
  const v = check.value?.trim();
  let present: boolean;
  switch (check.construct) {
    case "function_def":
      present = v
        ? analysis.functionDefs.includes(v)
        : analysis.constructs.function_def;
      break;
    case "function_call":
      present = v
        ? analysis.functionCalls.includes(v.replace(/\(\)$/, ""))
        : analysis.constructs.function_call;
      break;
    case "import":
      present = v ? analysis.imports.includes(v) : analysis.constructs.import;
      break;
    default:
      present = analysis.constructs[check.construct];
  }
  const passed = check.kind === "requires" ? present : !present;
  return { checkId: check.id, passed, weight: check.weight, message };
}

/* --------------------------------- Result --------------------------------- */

export function buildGradingResult(input: {
  tests: CodeTest[];
  checks: CodeCheck[];
  analysis: HarnessAnalysis | null;
  outcomes: Map<string, TestOutcome>;
  timeLimitMs: number;
  /** Set when the runner failed before or during grading. */
  internal?: PythonError | null;
  now?: Date;
}): CodeGradingResult {
  const { tests, checks, analysis, outcomes, timeLimitMs } = input;
  const gradedAt = (input.now ?? new Date()).toISOString();
  const syntaxError = analysis && !analysis.ok ? analysis.error : null;

  const testResults: TestResult[] = tests.map((test) => {
    const outcome = outcomes.get(test.id);
    if (outcome && !syntaxError)
      return evaluateTest(test, outcome, timeLimitMs);
    const base: TestResult = {
      ...baseResult(test, 0),
      ...(test.kind === "io"
        ? { stdin: test.stdin, expected: test.expectedOutput }
        : { call: test.call, expected: test.expected }),
    };
    if (syntaxError) {
      return {
        ...base,
        feedback:
          "Je code bevat een syntaxfout, daardoor kon deze test niet worden uitgevoerd.",
      };
    }
    const err = input.internal ?? internalError("test niet uitgevoerd");
    return { ...base, error: err, feedback: errorFeedback(err) };
  });

  const fallbackAnalysis: HarnessAnalysis = analysis ?? {
    ok: false,
    error: input.internal ?? internalError(),
  };
  const checkResults = checks.map((c) => evaluateCheck(c, fallbackAnalysis));

  const totalWeight =
    tests.reduce((s, t) => s + t.weight, 0) +
    checks.reduce((s, c) => s + c.weight, 0);
  const passedWeight =
    testResults.reduce((s, t) => s + (t.passed ? t.weight : 0), 0) +
    checkResults.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);

  let status: CodeGradingResult["status"] = "ok";
  if (syntaxError) status = "syntax_error";
  else if (
    input.internal ||
    testResults.some((t) => t.error?.type === "InternalError")
  )
    status = "internal_error";
  else if (testResults.some((t) => t.timedOut)) status = "timeout";
  else if (testResults.some((t) => t.error && !t.passed))
    status = "runtime_error";

  const fraction =
    totalWeight > 0 ? Math.min(1, Math.max(0, passedWeight / totalWeight)) : 0;
  return {
    kind: "code",
    status,
    error: syntaxError ?? (input.internal || null),
    tests: testResults,
    checks: checkResults,
    passedWeight,
    totalWeight,
    fraction: Math.round(fraction * 10_000) / 10_000,
    gradedAt,
  };
}

/* ------------------------------ Orchestration ----------------------------- */

export type RunGradingOptions = {
  /** Stop starting new tests after this many ms in total. */
  totalTimeLimitMs?: number;
  maxOutput?: number;
  recursionLimit?: number;
};

/** Build the harness request for one test. */
export function harnessRequestForTest(
  code: string,
  test: CodeTest,
  options: RunGradingOptions = {},
): HarnessRunRequest {
  return test.kind === "io"
    ? {
        code,
        stdin: test.stdin,
        mode: "io",
        maxOutput: options.maxOutput,
        recursionLimit: options.recursionLimit,
      }
    : {
        code,
        stdin: "",
        mode: "function",
        call: test.call,
        maxOutput: options.maxOutput,
        recursionLimit: options.recursionLimit,
      };
}

/**
 * Grade code with an executor: analyze first (syntax + AST, before any
 * student code runs), then run every test once, then decide in TypeScript.
 */
export async function runGrading(
  input: GradeInput,
  executor: GradingExecutor,
  options: RunGradingOptions = {},
): Promise<CodeGradingResult> {
  const { code, tests, checks, timeLimitMs } = input;
  const started = Date.now();
  let analysis: HarnessAnalysis;
  try {
    analysis = await executor.analyze(code);
  } catch (e) {
    return buildGradingResult({
      tests,
      checks,
      analysis: null,
      outcomes: new Map(),
      timeLimitMs,
      internal: internalError(e instanceof Error ? e.message : String(e)),
    });
  }
  const outcomes = new Map<string, TestOutcome>();
  if (analysis.ok) {
    for (const test of tests) {
      if (
        options.totalTimeLimitMs !== undefined &&
        Date.now() - started > options.totalTimeLimitMs
      ) {
        outcomes.set(test.id, {
          kind: "crashed",
          error: TOTAL_TIMEOUT_ERROR,
          durationMs: 0,
        });
        continue;
      }
      try {
        outcomes.set(
          test.id,
          await executor.run(
            harnessRequestForTest(code, test, options),
            timeLimitMs,
          ),
        );
      } catch (e) {
        outcomes.set(test.id, {
          kind: "crashed",
          error: internalError(e instanceof Error ? e.message : String(e)),
          durationMs: 0,
        });
      }
    }
  }
  return buildGradingResult({ tests, checks, analysis, outcomes, timeLimitMs });
}
