/**
 * Messages between the main thread (runner-client.ts) and the Pyodide Web
 * Worker (public/python-worker.mjs, a static, unbundled module worker).
 *
 * Interactive input uses a SharedArrayBuffer (only when the page is
 * cross-origin isolated): Int32Array control words [state, byteLength] and a
 * byte area. The worker sets state=IDLE, posts "input-request" and blocks in
 * Atomics.wait; the main thread writes the UTF-8 line, sets state=DATA (or
 * EOF) and notifies.
 */
import type {
  HarnessAnalysis,
  HarnessRunRequest,
  HarnessRunResult,
} from "./harness";
import type { TranscriptSegment } from "./types";

export const INPUT_STATE_IDLE = 0;
export const INPUT_STATE_DATA = 1;
export const INPUT_STATE_EOF = 2;
/** Bytes available for one line of interactive input. */
export const INPUT_BUFFER_BYTES = 64 * 1024;

export type WorkerRequest =
  | {
      t: "init";
      /** Absolute URL of the self-hosted Pyodide folder, ending in "/". */
      indexURL: string;
      /** Python harness source (harness.ts) and its file name. */
      harness: string;
      filename: string;
      inputBuffer: SharedArrayBuffer | null;
    }
  | { t: "analyze"; id: number; code: string }
  | { t: "run"; id: number; request: HarnessRunRequest; interactive: boolean };

export type WorkerResponse =
  | { t: "ready"; loadMs: number }
  | { t: "load-error"; message: string }
  | { t: "started"; id: number }
  | { t: "segments"; id: number; segments: TranscriptSegment[] }
  | { t: "input-request"; id: number; prompt: string }
  | {
      t: "analysis";
      id: number;
      result: HarnessAnalysis | { internalError: string };
    }
  | {
      t: "result";
      id: number;
      result: HarnessRunResult | { internalError: string };
    }
  | { t: "fatal"; id: number; message: string };
