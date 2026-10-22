/**
 * Grader configuration from environment variables (with defaults).
 * Read lazily via process.env (not "@/env") so scripts and tests can use the
 * grader without the full app environment.
 *
 *   GRADER_POOL_SIZE          pre-warmed sandboxes kept ready (default 2)
 *   GRADER_MAX_CONCURRENCY    max simultaneous grading jobs, FIFO queue beyond (default 4)
 *   GRADER_SANDBOX_DIR        folder with sandbox.mjs (default <cwd>/grader)
 *   PYODIDE_DIR               the pyodide npm package folder (default <cwd>/node_modules/pyodide)
 *   GRADER_NODE_PATH          node binary for sandboxes (default: this node, or `node` on PATH under bun)
 *   GRADER_MEMORY_LIMIT_MB    RSS limit per sandbox, killed above it (default 768)
 *   GRADER_WASM_MEMORY_MB     Python (wasm) memory cap; MemoryError above it (default 384)
 *   GRADER_JOB_TIMEOUT_MS     total wall-clock budget per job (default 120000)
 *   GRADER_QUEUE_TIMEOUT_MS   max time a job may wait in the queue (default 120000)
 *   GRADER_MAX_OUTPUT         max captured output per run, characters (default 65536)
 *   GRADER_SNAPSHOT           "0" disables the Pyodide start-up snapshot (default on;
 *                             written read-only to the OS temp dir, see snapshot.ts)
 */
import fs from "node:fs";
import path from "node:path";

export type GraderConfig = {
  poolSize: number;
  maxConcurrency: number;
  sandboxDir: string;
  sandboxScript: string;
  pyodideDir: string;
  nodePath: string;
  memoryLimitMb: number;
  wasmMemoryMb: number;
  jsHeapMb: number;
  jobTimeoutMs: number;
  queueTimeoutMs: number;
  maxOutput: number;
  startupTimeoutMs: number;
};

function intEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function findOnPath(binary: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binary);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

function realDir(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

let cached: GraderConfig | null = null;

export function graderConfig(): GraderConfig {
  if (cached) return cached;
  // Resolved at runtime on purpose (not statically analyzable): these files
  // are copied into the Docker image explicitly, not traced by Next.js.
  const cwd = process.cwd();
  const sandboxDir = realDir(
    process.env.GRADER_SANDBOX_DIR || [cwd, "grader"].join(path.sep),
  );
  const pyodideDir = realDir(
    process.env.PYODIDE_DIR || [cwd, "node_modules", "pyodide"].join(path.sep),
  );
  const isBun =
    typeof (process.versions as Record<string, string | undefined>).bun ===
    "string";
  const nodePath =
    process.env.GRADER_NODE_PATH ||
    (isBun ? (findOnPath("node") ?? "node") : process.execPath);
  const wasmMemoryMb = intEnv("GRADER_WASM_MEMORY_MB", 384, 64, 2048);
  cached = {
    poolSize: intEnv("GRADER_POOL_SIZE", 2, 0, 32),
    maxConcurrency: intEnv("GRADER_MAX_CONCURRENCY", 4, 1, 64),
    sandboxDir,
    sandboxScript: path.join(sandboxDir, "sandbox.mjs"),
    pyodideDir,
    nodePath,
    memoryLimitMb: intEnv(
      "GRADER_MEMORY_LIMIT_MB",
      Math.max(768, wasmMemoryMb + 384),
      256,
      8192,
    ),
    wasmMemoryMb,
    jsHeapMb: 128,
    jobTimeoutMs: intEnv("GRADER_JOB_TIMEOUT_MS", 120_000, 5_000, 600_000),
    queueTimeoutMs: intEnv("GRADER_QUEUE_TIMEOUT_MS", 120_000, 1_000, 600_000),
    maxOutput: intEnv("GRADER_MAX_OUTPUT", 64 * 1024, 1024, 1024 * 1024),
    startupTimeoutMs: 30_000,
  };
  return cached;
}

/** For tests: forget the cached config (re-read env). */
export function resetGraderConfig(): void {
  cached = null;
}
