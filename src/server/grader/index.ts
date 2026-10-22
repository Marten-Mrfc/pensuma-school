import "server-only";

/**
 * Server-side Python grader (sandboxed Pyodide child processes).
 *
 * - gradeCode(input): grade code against ALL tests (incl. hidden) + checks
 * - gradeCodeBatch(items): grade several questions of ONE submission in one
 *   sandbox job (fast; never mix students in a batch)
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
