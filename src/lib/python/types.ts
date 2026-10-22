/**
 * Contract for running student Python code (browser and server).
 * Implemented by `src/lib/python/*` (browser, Pyodide in a Web Worker) and
 * `src/server/grader/*` (server, sandboxed Pyodide child processes).
 */
import type {
  CodeCheck,
  CodeGradingResult,
  CodeTest,
  PythonError,
} from "@/lib/questions/schema";

/** One piece of a terminal transcript (for coloured display). */
export type TranscriptSegment = {
  /** stdout/stderr: printed text; prompt: `input()` prompt; input: the consumed line (with "\n"). */
  kind: "stdout" | "stderr" | "prompt" | "input";
  text: string;
};

export type RunInput = {
  code: string;
  /** Lines fed to `input()`, separated by "\n". */
  stdin?: string;
  timeLimitMs?: number;
};

export type RunResult = {
  /** Clean stdout: `input()` prompts are NOT included. */
  stdout: string;
  stderr: string;
  /**
   * Terminal-style transcript for display: prompts and the consumed input
   * values are interleaved with stdout, like a real console session.
   */
  transcript: string;
  error: PythonError | null;
  timedOut: boolean;
  durationMs: number;
  /** The same transcript split into typed segments (additive, optional). */
  segments?: TranscriptSegment[];
  /** True when the output cap was hit and the program was stopped. */
  truncated?: boolean;
};

export type GradeInput = {
  code: string;
  tests: CodeTest[];
  checks: CodeCheck[];
  timeLimitMs: number;
};

export type { CodeGradingResult };

export type PythonRunnerStatus =
  | "idle"
  | "loading"
  | "ready"
  | "running"
  | "error";

/** Shape returned by the `usePythonRunner()` hook (browser). */
export type PythonRunner = {
  status: PythonRunnerStatus;
  /**
   * True when interactive `input()` is available (the page is
   * cross-origin isolated, so SharedArrayBuffer + Atomics.wait work).
   */
  interactive: boolean;
  /** Dutch error message when Pyodide failed to load. */
  loadError: string | null;
  /** Start downloading Pyodide ahead of time. */
  preload: () => void;
  /**
   * Run code once. When `onInput` is given and the browser supports it
   * (cross-origin isolation), `input()` calls ask interactively; otherwise
   * `stdin` lines are used.
   */
  run: (
    input: RunInput & {
      onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
      onInput?: (prompt: string) => Promise<string>;
      /** Every transcript segment as it happens (stdout, stderr, prompt, input). */
      onSegment?: (segment: TranscriptSegment) => void;
    },
  ) => Promise<RunResult>;
  /** Run tests/checks locally (same semantics as the server grader). */
  grade: (input: GradeInput) => Promise<CodeGradingResult>;
  /** Abort the current run (terminates the worker). */
  stop: () => void;
};
