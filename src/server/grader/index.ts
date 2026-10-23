import "server-only";

export type { GradeBatchOptions } from "./grader";
/**
 * Server-side Python grader (sandboxed Pyodide child processes).
 *
 * - gradeCode(input): grade code against ALL tests (incl. hidden) + checks
 * - gradeCodeBatch(items, options?): grade several questions of ONE
 *   submission in one sandbox job (fast; never mix students in a batch).
 *   Background grading passes `{ queueTimeoutMs: null, priority:
 *   "background", throwWhenUnavailable: true }` (see GradeBatchOptions).
 * - runCode(input): run code once (clean stdout, transcript, error)
 * - runCodeBatch(code, stdins, timeLimitMs): run once per stdin in one job
 * - warmUpGrader(): start the warm pool early (optional)
 *
 * See ./grader.ts, ./pool.ts, ./sandbox-process.ts and grader/sandbox.mjs.
 */
export {
  gradeCode,
  gradeCodeBatch,
  runCode,
  runCodeBatch,
  warmUpGrader,
} from "./grader";
