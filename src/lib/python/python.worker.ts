/// <reference lib="webworker" />
/**
 * Pyodide Web Worker: runs student code in the browser with the shared
 * harness (harness.ts), so results match the server grader. Loaded by
 * runner-client.ts via `new Worker(new URL("./python.worker.ts", import.meta.url), { type: "module" })`.
 * Pyodide itself is loaded at runtime from the self-hosted /pyodide/ folder
 * (copied by scripts/copy-pyodide.mjs), not bundled.
 */
import { HARNESS_FILENAME, HARNESS_PY } from "./harness";
import {
  INPUT_STATE_DATA,
  INPUT_STATE_EOF,
  INPUT_STATE_IDLE,
  type WorkerRequest,
  type WorkerResponse,
} from "./worker-protocol";
import type { TranscriptSegment } from "./types";

declare const self: DedicatedWorkerGlobalScope;

type PyCallable = (...args: unknown[]) => string;
type PyodideLike = {
  runPython: (code: string, options?: { filename?: string }) => unknown;
  globals: { get: (name: string) => PyCallable };
  setStdin: (options: { error?: boolean }) => void;
};

let runJson: PyCallable | null = null;
let analyzeJson: PyCallable | null = null;
let inputCtrl: Int32Array | null = null;
let inputData: Uint8Array | null = null;
const decoder = new TextDecoder();

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

async function init(indexURL: string, inputBuffer: SharedArrayBuffer | null): Promise<void> {
  const t0 = performance.now();
  try {
    const url = `${indexURL}pyodide.mjs`;
    const mod: { loadPyodide: (options: Record<string, unknown>) => Promise<PyodideLike> } =
      await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);
    const pyodide = await mod.loadPyodide({
      indexURL,
      stdout: () => {},
      stderr: () => {},
      env: { HOME: "/home/pyodide" },
    });
    pyodide.setStdin({ error: true });
    pyodide.runPython(HARNESS_PY, { filename: HARNESS_FILENAME });
    runJson = pyodide.globals.get("_pensuma_run_json");
    analyzeJson = pyodide.globals.get("_pensuma_analyze_json");
    if (inputBuffer) {
      inputCtrl = new Int32Array(inputBuffer, 0, 2);
      inputData = new Uint8Array(inputBuffer, 8);
    }
    post({ t: "ready", loadMs: Math.round(performance.now() - t0) });
  } catch (e) {
    post({ t: "load-error", message: e instanceof Error ? e.message : String(e) });
  }
}

function run(id: number, requestJson: string, interactive: boolean): void {
  if (!runJson) return;
  // Batch segments: one message per ~50 ms or 4 KB, always flushed before input().
  let buffer: TranscriptSegment[] = [];
  let bufferSize = 0;
  let lastFlush = performance.now();
  const flush = () => {
    if (buffer.length === 0) return;
    post({ t: "segments", id, segments: buffer });
    buffer = [];
    bufferSize = 0;
    lastFlush = performance.now();
  };
  const emit = (kind: TranscriptSegment["kind"], text: string) => {
    const last = buffer[buffer.length - 1];
    if (last && last.kind === kind) last.text += text;
    else buffer.push({ kind, text });
    bufferSize += text.length;
    if (bufferSize > 4096 || performance.now() - lastFlush > 50) flush();
  };
  const ctrl = inputCtrl;
  const data = inputData;
  const reader =
    interactive && ctrl && data
      ? (prompt: string): string | undefined => {
          flush();
          Atomics.store(ctrl, 0, INPUT_STATE_IDLE);
          post({ t: "input-request", id, prompt });
          Atomics.wait(ctrl, 0, INPUT_STATE_IDLE);
          const state = Atomics.load(ctrl, 0);
          Atomics.store(ctrl, 0, INPUT_STATE_IDLE);
          if (state === INPUT_STATE_EOF || state !== INPUT_STATE_DATA) return undefined;
          const length = Math.min(Atomics.load(ctrl, 1), data.length);
          return decoder.decode(data.slice(0, length));
        }
      : undefined;
  post({ t: "started", id });
  try {
    const json = runJson(requestJson, emit, reader);
    flush();
    post({ t: "result", id, result: JSON.parse(json) });
  } catch (e) {
    flush();
    // The interpreter itself failed (e.g. JS stack overflow): the main thread
    // replaces this worker.
    post({ t: "fatal", id, message: e instanceof Error ? e.message : String(e) });
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  switch (msg.t) {
    case "init":
      void init(msg.indexURL, msg.inputBuffer);
      break;
    case "analyze":
      if (!analyzeJson) return;
      try {
        post({ t: "analysis", id: msg.id, result: JSON.parse(analyzeJson(msg.code)) });
      } catch (e) {
        post({ t: "fatal", id: msg.id, message: e instanceof Error ? e.message : String(e) });
      }
      break;
    case "run":
      run(msg.id, JSON.stringify(msg.request), msg.interactive);
      break;
  }
};
