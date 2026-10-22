/**
 * Server-side grading with sandboxed Pyodide processes. Import through
 * `@/server/grader` in app code (that entry adds `server-only`); scripts and
 * tests import this file directly.
 *
 * Expected outputs/values never leave this (parent) process: the sandbox
 * only receives code, stdin and the teacher's `call` expression, and returns
 * what the program printed/returned. `runGrading` (src/lib/grading/grade.ts)
 * then decides pass/fail in TypeScript.
 */
import {
  buildGradingResult,
  type GradingExecutor,
  internalError,
  MEMORY_ERROR,
  runGrading,
  type TestOutcome,
  timeoutError,
} from "@/lib/grading/grade";
import type { HarnessAnalysis, HarnessRunRequest } from "@/lib/python/harness";
import { sanitizeAnalysis, sanitizeRunResult } from "@/lib/python/protocol";
import type { GradeInput, RunInput, RunResult } from "@/lib/python/types";
import type { CodeGradingResult, PythonError } from "@/lib/questions/schema";
import { graderConfig } from "./config";
import { getGraderPool, type JobLease } from "./pool";
import type { SandboxResponse } from "./sandbox-process";

const ANALYZE_TIMEOUT_MS = 15_000;
export const MAX_CODE_LENGTH = 100_000;
export const MAX_TESTS = 100;

const RECURSION_CRASH: PythonError = {
  type: "RecursionError",
  message:
    "Je programma ging te diep in recursie (een functie die zichzelf te vaak aanroept) en is gestopt.",
  line: null,
  traceback: "",
};

const SANDBOX_CRASH: PythonError = {
  type: "SandboxCrash",
  message:
    "Python is onverwacht gestopt tijdens het uitvoeren van je programma.",
  line: null,
  traceback: "",
};

function clampTimeLimit(ms: number | undefined): number {
  if (!ms || !Number.isFinite(ms)) return 5_000;
  return Math.min(30_000, Math.max(500, Math.round(ms)));
}

function failureOutcome(
  r: Extract<SandboxResponse, { ok: false }>,
): TestOutcome {
  switch (r.failure) {
    case "timeout":
      return { kind: "timeout", durationMs: r.durationMs };
    case "memory":
      return { kind: "crashed", error: MEMORY_ERROR, durationMs: r.durationMs };
    case "fatal":
      return {
        kind: "crashed",
        error: /call stack|stack overflow|recursion/i.test(r.message)
          ? RECURSION_CRASH
          : { ...SANDBOX_CRASH, traceback: r.message.slice(0, 2000) },
        durationMs: r.durationMs,
      };
    case "exit":
      return {
        kind: "crashed",
        error: SANDBOX_CRASH,
        durationMs: r.durationMs,
      };
    default:
      return {
        kind: "crashed",
        error: internalError(`${r.failure}: ${r.message}`),
        durationMs: r.durationMs,
      };
  }
}

/** GradingExecutor backed by the sandbox pool (one lease = one job). */
export class SandboxExecutor implements GradingExecutor {
  constructor(private readonly lease: JobLease) {}

  async analyze(code: string): Promise<HarnessAnalysis> {
    const proc = await this.lease.current();
    const r = await proc.request({ t: "analyze", code }, ANALYZE_TIMEOUT_MS);
    if (r.ok && r.message.t === "analysis") {
      const analysis = sanitizeAnalysis(r.message.result);
      if (analysis) return analysis;
    }
    this.lease.discard();
    throw new Error(
      `analyse mislukt: ${r.ok ? "ongeldig antwoord" : `${r.failure} ${r.message}`}`,
    );
  }

  async run(
    request: HarnessRunRequest,
    timeLimitMs: number,
  ): Promise<TestOutcome> {
    const proc = await this.lease.current();
    const r = await proc.request({ t: "run", request }, timeLimitMs);
    if (r.ok && r.message.t === "result") {
      const result = sanitizeRunResult(r.message.result);
      if (result) return { kind: "result", result, durationMs: r.durationMs };
      this.lease.discard();
      return {
        kind: "crashed",
        error: internalError("ongeldig resultaat van de sandbox"),
        durationMs: r.durationMs,
      };
    }
    this.lease.discard();
    if (r.ok) {
      return {
        kind: "crashed",
        error: internalError("onverwacht antwoord"),
        durationMs: r.durationMs,
      };
    }
    return failureOutcome(r);
  }
}

function emptyResult(input: GradeInput, error: PythonError): CodeGradingResult {
  return buildGradingResult({
    tests: input.tests,
    checks: input.checks,
    analysis: null,
    outcomes: new Map(),
    timeLimitMs: input.timeLimitMs,
    internal: error,
  });
}

const TOO_LARGE: PythonError = {
  type: "InputTooLarge",
  message: "Je code is te lang om na te kijken.",
  line: null,
  traceback: "",
};

/**
 * Grade code against ALL given tests (including hidden ones) and checks.
 * Never throws for student errors; infrastructure problems give
 * status "internal_error".
 */
export async function gradeCode(input: GradeInput): Promise<CodeGradingResult> {
  const [result] = await gradeCodeBatch([input]);
  return result;
}

/**
 * Grade several questions of ONE submission (one student) in one sandbox
 * job: much faster than one job per question. Never mix students in a
 * batch: their code would share an interpreter.
 *
 * 1. Static analysis (syntax + AST checks) of every question runs first, in
 *    the pristine sandbox, before any student code runs, so code of one
 *    question can't tamper with the checks of another.
 * 2. Then every test of every question runs, each in a fresh namespace with
 *    builtins/modules restored; after a timeout or crash the job continues
 *    in a fresh sandbox process.
 * Each question gets the full GRADER_JOB_TIMEOUT_MS budget. Results are
 * returned in the same order as `items`.
 */
export async function gradeCodeBatch(
  items: GradeInput[],
): Promise<CodeGradingResult[]> {
  if (items.length === 0) return [];
  const config = graderConfig();
  const normalized: GradeInput[] = items.map((input) => ({
    ...input,
    tests: input.tests.slice(0, MAX_TESTS),
    timeLimitMs: clampTimeLimit(input.timeLimitMs),
  }));
  const gradable = normalized.filter(
    (item) => item.code.length <= MAX_CODE_LENGTH,
  );
  try {
    const graded = await getGraderPool().withJob(async (lease) => {
      const executor = new SandboxExecutor(lease);
      const analyses = new Map<string, HarnessAnalysis | Error>();
      for (const item of gradable) {
        if (analyses.has(item.code)) continue;
        try {
          analyses.set(item.code, await executor.analyze(item.code));
        } catch (e) {
          analyses.set(
            item.code,
            e instanceof Error ? e : new Error(String(e)),
          );
        }
      }
      const results = new Map<GradeInput, CodeGradingResult>();
      for (const item of gradable) {
        const analysis = analyses.get(item.code);
        const cached: GradingExecutor = {
          analyze: async () => {
            if (!analysis || analysis instanceof Error)
              throw analysis ?? new Error("geen analyse");
            return analysis;
          },
          run: (request, timeLimitMs) => executor.run(request, timeLimitMs),
        };
        results.set(
          item,
          await runGrading(item, cached, {
            totalTimeLimitMs: config.jobTimeoutMs,
            maxOutput: config.maxOutput,
          }),
        );
      }
      return results;
    });
    return normalized.map(
      (item) => graded.get(item) ?? emptyResult(item, TOO_LARGE),
    );
  } catch (e) {
    const error = internalError(e instanceof Error ? e.message : String(e));
    return normalized.map((item) =>
      item.code.length > MAX_CODE_LENGTH
        ? emptyResult(item, TOO_LARGE)
        : emptyResult(item, error),
    );
  }
}

function toRunResult(outcome: TestOutcome, timeLimitMs: number): RunResult {
  if (outcome.kind === "result") {
    const r = outcome.result;
    return {
      stdout: r.stdout,
      stderr: r.stderr,
      transcript: r.transcript,
      segments: r.segments,
      error: r.error,
      timedOut: false,
      durationMs: Math.round(outcome.durationMs),
      truncated: r.truncated,
    };
  }
  const error =
    outcome.kind === "timeout" ? timeoutError(timeLimitMs) : outcome.error;
  return {
    stdout: "",
    stderr: "",
    transcript: "",
    segments: [],
    error,
    timedOut: outcome.kind === "timeout",
    durationMs: Math.round(outcome.durationMs),
  };
}

function runFailure(e: unknown): RunResult {
  return {
    stdout: "",
    stderr: "",
    transcript: "",
    segments: [],
    error: internalError(e instanceof Error ? e.message : String(e)),
    timedOut: false,
    durationMs: 0,
  };
}

/** Run code once on the server with the given stdin. */
export async function runCode(input: RunInput): Promise<RunResult> {
  const [result] = await runCodeBatch(
    input.code,
    [input.stdin ?? ""],
    input.timeLimitMs,
  );
  return result;
}

/**
 * Run the same code once per stdin, in one job (one fresh sandbox, replaced
 * after a timeout). Used by teachers to generate expected output.
 */
export async function runCodeBatch(
  code: string,
  stdins: string[],
  timeLimitMs?: number,
): Promise<RunResult[]> {
  const config = graderConfig();
  const limit = clampTimeLimit(timeLimitMs);
  if (code.length > MAX_CODE_LENGTH) {
    return stdins.map(() => runFailure(new Error("Code is te lang.")));
  }
  try {
    return await getGraderPool().withJob(async (lease) => {
      const executor = new SandboxExecutor(lease);
      const started = Date.now();
      const results: RunResult[] = [];
      for (const stdin of stdins.slice(0, MAX_TESTS)) {
        if (Date.now() - started > config.jobTimeoutMs) {
          results.push(toRunResult({ kind: "timeout", durationMs: 0 }, limit));
          continue;
        }
        try {
          const outcome = await executor.run(
            { code, stdin, mode: "io", maxOutput: config.maxOutput },
            limit,
          );
          results.push(toRunResult(outcome, limit));
        } catch (e) {
          results.push(runFailure(e));
        }
      }
      return results;
    });
  } catch (e) {
    return stdins.map(() => runFailure(e));
  }
}

/** Start the warm sandbox pool now (e.g. from instrumentation at server start). */
export function warmUpGrader(): void {
  getGraderPool().warmUp();
}
