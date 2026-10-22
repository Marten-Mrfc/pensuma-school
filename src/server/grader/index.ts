import "server-only";

import type { GradeInput, RunInput, RunResult } from "@/lib/python/types";
import type { CodeGradingResult } from "@/lib/questions/schema";

/**
 * Server-side Python grader (sandboxed Pyodide).
 * STUB: implemented by the grader workstream.
 */
export async function gradeCode(_input: GradeInput): Promise<CodeGradingResult> {
  throw new Error("gradeCode is not implemented yet");
}

/** Run code once on the server (used by teachers to generate expected output). */
export async function runCode(_input: RunInput): Promise<RunResult> {
  throw new Error("runCode is not implemented yet");
}
