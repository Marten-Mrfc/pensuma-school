import "client-only";

/**
 * Browser side of the Python runner: owns one Pyodide Web Worker per page
 * (shared by every component through `usePythonRunner()`), lazy-loads it,
 * enforces time limits by terminating it, and grades with the same
 * isomorphic logic as the server (`runGrading`). Server grading stays
 * authoritative; this is for the students' own "Uitvoeren" and "Testen".
 */
import {
  type GradingExecutor,
  internalError,
  runGrading,
  type TestOutcome,
  timeoutError,
} from "@/lib/grading/grade";
import type { PythonError } from "@/lib/questions/schema";
import {
  DEFAULT_MAX_OUTPUT,
  type HarnessAnalysis,
  type HarnessRunRequest,
  type HarnessRunResult,
} from "./harness";
import { sanitizeAnalysis, sanitizeRunResult } from "./protocol";
import type {
  CodeGradingResult,
  GradeInput,
  PythonRunner,
  PythonRunnerStatus,
  RunInput,
  RunResult,
  TranscriptSegment,
} from "./types";
import {
  INPUT_BUFFER_BYTES,
  INPUT_STATE_DATA,
  INPUT_STATE_EOF,
  type WorkerResponse,
} from "./worker-protocol";

export type RunnerSnapshot = {
  status: PythonRunnerStatus;
  interactive: boolean;
  loadError: string | null;
};

export const STOPPED_ERROR: PythonError = {
  type: "Stopped",
  message: "Je hebt het programma gestopt.",
  line: null,
  traceback: "",
};

const LOAD_ERROR =
  "Python kon niet worden geladen. Controleer je internetverbinding en ververs de pagina.";

const RECURSION_CRASH: PythonError = {
  type: "RecursionError",
  message:
    "Je programma ging te diep in recursie (een functie die zichzelf te vaak aanroept) en is gestopt.",
  line: null,
  traceback: "",
};

type WorkerRun =
  | { kind: "result"; result: HarnessRunResult; durationMs: number }
  | { kind: "timeout"; durationMs: number }
  | { kind: "crashed"; error: PythonError; durationMs: number }
  | { kind: "stopped"; durationMs: number };

type ActiveOp = {
  id: number;
  handle: (msg: WorkerResponse) => void;
  abort: () => void;
};

type RunOptions = {
  timeLimitMs: number;
  interactive: boolean;
  onSegment?: (segment: TranscriptSegment) => void;
  onInput?: (prompt: string) => Promise<string | null>;
};

function clampTimeLimit(ms: number | undefined): number {
  if (!ms || !Number.isFinite(ms)) return 5_000;
  return Math.min(30_000, Math.max(500, Math.round(ms)));
}

function supportsInteractive(): boolean {
  return (
    typeof window !== "undefined" &&
    window.crossOriginIsolated === true &&
    typeof SharedArrayBuffer !== "undefined" &&
    typeof Atomics !== "undefined"
  );
}

const SERVER_SNAPSHOT: RunnerSnapshot = {
  status: "idle",
  interactive: false,
  loadError: null,
};

export class PythonWorkerClient {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private snapshot: RunnerSnapshot = SERVER_SNAPSHOT;
  private listeners = new Set<() => void>();
  private nextId = 1;
  private active: ActiveOp | null = null;
  private inputBuffer: SharedArrayBuffer | null = null;
  /** Bumped by stop() and by every new run/grade: older operations become no-ops. */
  private generation = 0;

  constructor() {
    if (typeof window !== "undefined") {
      this.snapshot = {
        ...SERVER_SNAPSHOT,
        interactive: supportsInteractive(),
      };
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RunnerSnapshot => this.snapshot;

  getServerSnapshot = (): RunnerSnapshot => SERVER_SNAPSHOT;

  private update(partial: Partial<RunnerSnapshot>): void {
    const next = { ...this.snapshot, ...partial };
    if (
      next.status === this.snapshot.status &&
      next.interactive === this.snapshot.interactive &&
      next.loadError === this.snapshot.loadError
    )
      return;
    this.snapshot = next;
    for (const l of this.listeners) l();
  }

  /* ------------------------------ Worker life ----------------------------- */

  private spawn(): Promise<void> {
    const interactive = supportsInteractive();
    this.inputBuffer = interactive
      ? new SharedArrayBuffer(8 + INPUT_BUFFER_BYTES)
      : null;
    const worker = new Worker(new URL("./python.worker.ts", import.meta.url), {
      type: "module",
      name: "pensuma-python",
    });
    this.worker = worker;
    this.update({ status: "loading", interactive, loadError: null });
    const ready = new Promise<void>((resolve, reject) => {
      let isReady = false;
      worker.addEventListener(
        "message",
        (event: MessageEvent<WorkerResponse>) => {
          if (worker !== this.worker) return;
          const msg = event.data;
          if (msg.t === "ready") {
            isReady = true;
            this.update({ status: this.active ? "running" : "ready" });
            resolve();
          } else if (msg.t === "load-error") {
            this.killWorker();
            this.update({ status: "error", loadError: LOAD_ERROR });
            reject(new Error(msg.message));
          } else {
            this.active?.handle(msg);
          }
        },
      );
      worker.addEventListener("error", (event) => {
        if (worker !== this.worker) return;
        event.preventDefault?.();
        this.killWorker();
        if (!isReady) {
          this.update({ status: "error", loadError: LOAD_ERROR });
          reject(new Error(event.message || "worker error"));
        } else {
          this.active?.handle({
            t: "fatal",
            id: this.active.id,
            message: event.message || "worker error",
          });
        }
      });
    });
    ready.catch(() => {});
    worker.postMessage({
      t: "init",
      indexURL: new URL("/pyodide/", window.location.href).href,
      inputBuffer: this.inputBuffer,
    });
    this.ready = ready;
    return ready;
  }

  private killWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }

  private ensureWorker(): Promise<void> {
    if (this.worker && this.ready) return this.ready;
    return this.spawn();
  }

  /** Terminate the worker and start a fresh one in the background. */
  private restart(): void {
    this.killWorker();
    this.update({ status: "idle" });
    void this.ensureWorker().catch(() => {});
  }

  preload = (): void => {
    if (typeof window === "undefined") return;
    void this.ensureWorker().catch(() => {});
  };

  stop = (): void => {
    this.generation++;
    this.active?.abort();
  };

  /* ------------------------------- Requests ------------------------------- */

  private writeInput(value: string | null): void {
    const buf = this.inputBuffer;
    if (!buf) return;
    const ctrl = new Int32Array(buf, 0, 2);
    const data = new Uint8Array(buf, 8);
    if (value === null) {
      Atomics.store(ctrl, 1, 0);
      Atomics.store(ctrl, 0, INPUT_STATE_EOF);
    } else {
      let bytes = new TextEncoder().encode(value);
      if (bytes.length > data.length) bytes = bytes.slice(0, data.length);
      data.set(bytes);
      Atomics.store(ctrl, 1, bytes.length);
      Atomics.store(ctrl, 0, INPUT_STATE_DATA);
    }
    Atomics.notify(ctrl, 0);
  }

  private async runInWorker(
    request: HarnessRunRequest,
    options: RunOptions,
  ): Promise<WorkerRun> {
    this.active?.abort();
    try {
      await this.ensureWorker();
    } catch {
      return {
        kind: "crashed",
        error: { ...internalError(), message: LOAD_ERROR },
        durationMs: 0,
      };
    }
    const worker = this.worker;
    if (!worker)
      return {
        kind: "crashed",
        error: internalError("geen worker"),
        durationMs: 0,
      };
    const id = this.nextId++;
    const interactive =
      options.interactive && this.inputBuffer !== null && !!options.onInput;
    this.update({ status: "running" });

    return new Promise<WorkerRun>((resolve) => {
      let started = 0;
      let elapsed = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let done = false;
      const now = () => elapsed + (timer ? performance.now() - started : 0);
      const finish = (run: WorkerRun, kill: boolean) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        timer = null;
        if (this.active?.id === id) this.active = null;
        if (kill) this.restart();
        else this.update({ status: "ready" });
        resolve(run);
      };
      const startTimer = () => {
        started = performance.now();
        timer = setTimeout(
          () =>
            finish({ kind: "timeout", durationMs: options.timeLimitMs }, true),
          Math.max(0, options.timeLimitMs - elapsed),
        );
      };
      const pauseTimer = () => {
        if (!timer) return;
        clearTimeout(timer);
        timer = null;
        elapsed += performance.now() - started;
      };

      this.active = {
        id,
        abort: () => finish({ kind: "stopped", durationMs: now() }, true),
        handle: (msg) => {
          if (done || !("id" in msg) || msg.id !== id) return;
          switch (msg.t) {
            case "started":
              startTimer();
              break;
            case "segments":
              for (const s of msg.segments) options.onSegment?.(s);
              break;
            case "input-request": {
              pauseTimer();
              const ask = options.onInput;
              if (!ask) {
                this.writeInput(null);
                startTimer();
                break;
              }
              ask(msg.prompt).then(
                (value) => {
                  if (done) return;
                  this.writeInput(value);
                  startTimer();
                },
                () => {
                  if (done) return;
                  this.writeInput(null);
                  startTimer();
                },
              );
              break;
            }
            case "result": {
              const durationMs = now();
              const result = sanitizeRunResult(msg.result);
              finish(
                result
                  ? { kind: "result", result, durationMs }
                  : {
                      kind: "crashed",
                      error: internalError("ongeldig resultaat"),
                      durationMs,
                    },
                !result,
              );
              break;
            }
            case "fatal":
              finish(
                {
                  kind: "crashed",
                  error: /call stack|recursion/i.test(msg.message)
                    ? RECURSION_CRASH
                    : internalError(msg.message),
                  durationMs: now(),
                },
                true,
              );
              break;
          }
        },
      };
      worker.postMessage({ t: "run", id, request, interactive });
    });
  }

  private async analyzeInWorker(code: string): Promise<HarnessAnalysis> {
    this.active?.abort();
    await this.ensureWorker();
    const worker = this.worker;
    if (!worker) throw new Error("geen worker");
    const id = this.nextId++;
    return new Promise<HarnessAnalysis>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.active = null;
        this.restart();
        reject(new Error("analyse duurde te lang"));
      }, 15_000);
      this.active = {
        id,
        abort: () => {
          clearTimeout(timer);
          this.active = null;
          this.restart();
          reject(new Error("gestopt"));
        },
        handle: (msg) => {
          if (!("id" in msg) || msg.id !== id) return;
          if (msg.t !== "analysis" && msg.t !== "fatal") return;
          clearTimeout(timer);
          this.active = null;
          const analysis =
            msg.t === "analysis" ? sanitizeAnalysis(msg.result) : null;
          if (analysis) resolve(analysis);
          else {
            this.restart();
            reject(
              new Error(msg.t === "fatal" ? msg.message : "ongeldige analyse"),
            );
          }
        },
      };
      worker.postMessage({ t: "analyze", id, code });
    });
  }

  /* ------------------------------ Public API ------------------------------ */

  run: PythonRunner["run"] = async (input) => {
    this.generation++;
    const timeLimitMs = clampTimeLimit(input.timeLimitMs);
    const streamed: TranscriptSegment[] = [];
    const onSegment = (segment: TranscriptSegment) => {
      streamed.push(segment);
      input.onSegment?.(segment);
      if (segment.kind === "stdout" || segment.kind === "stderr") {
        input.onOutput?.(segment.text, segment.kind);
      }
    };
    const run = await this.runInWorker(
      {
        code: input.code,
        stdin: input.stdin ?? "",
        mode: "io",
        maxOutput: DEFAULT_MAX_OUTPUT,
      },
      {
        timeLimitMs,
        interactive: !!input.onInput,
        onSegment,
        onInput: input.onInput,
      },
    );
    return toRunResult(run, streamed, timeLimitMs);
  };

  grade = async (input: GradeInput): Promise<CodeGradingResult> => {
    const generation = ++this.generation;
    const stale = () => generation !== this.generation;
    const executor: GradingExecutor = {
      analyze: (code) => this.analyzeInWorker(code),
      run: async (request, timeLimitMs): Promise<TestOutcome> => {
        if (stale())
          return { kind: "crashed", error: STOPPED_ERROR, durationMs: 0 };
        const run = await this.runInWorker(request, {
          timeLimitMs,
          interactive: false,
        });
        switch (run.kind) {
          case "result":
            return run;
          case "timeout":
            return { kind: "timeout", durationMs: run.durationMs };
          case "stopped":
            return {
              kind: "crashed",
              error: STOPPED_ERROR,
              durationMs: run.durationMs,
            };
          case "crashed":
            return run;
        }
      },
    };
    return runGrading(
      { ...input, timeLimitMs: clampTimeLimit(input.timeLimitMs) },
      executor,
      { maxOutput: DEFAULT_MAX_OUTPUT },
    );
  };
}

function toRunResult(
  run: WorkerRun,
  streamed: TranscriptSegment[],
  timeLimitMs: number,
): RunResult {
  if (run.kind === "result") {
    const r = run.result;
    return {
      stdout: r.stdout,
      stderr: r.stderr,
      transcript: r.transcript,
      segments: r.segments,
      error: r.error,
      timedOut: false,
      durationMs: Math.round(run.durationMs),
      truncated: r.truncated,
    };
  }
  // Killed: keep what was printed before.
  const pick = (kind: TranscriptSegment["kind"]) =>
    streamed
      .filter((s) => s.kind === kind)
      .map((s) => s.text)
      .join("");
  const error =
    run.kind === "timeout"
      ? timeoutError(timeLimitMs)
      : run.kind === "stopped"
        ? STOPPED_ERROR
        : run.error;
  return {
    stdout: pick("stdout"),
    stderr: pick("stderr"),
    transcript: streamed.map((s) => s.text).join(""),
    segments: streamed,
    error,
    timedOut: run.kind === "timeout",
    durationMs: Math.round(run.durationMs),
  };
}

let client: PythonWorkerClient | null = null;

/** The page-wide runner (one worker shared by all components). */
export function getPythonClient(): PythonWorkerClient {
  client ??= new PythonWorkerClient();
  return client;
}

export type { RunInput };
