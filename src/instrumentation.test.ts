/**
 * src/instrumentation.ts: a server whose start-up migrations fail must exit
 * (so Docker/Swarm restarts it) instead of serving 500 on every route.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { graderConfig } from "./server/grader/config";
import { SandboxPool } from "./server/grader/pool";

class ExitCalled extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

type G = typeof globalThis & { __pensumaGraderPool?: SandboxPool };
const KEYS = [
  "NODE_ENV",
  "NEXT_RUNTIME",
  "NEXT_PHASE",
  "DATABASE_URL",
  "MIGRATIONS_WAIT_MS",
  "RUN_MIGRATIONS",
  "RETENTION_SCHEDULER",
  "ATTEMPT_SWEEPER",
] as const;
let saved: Record<string, string | undefined> = {};
let savedPool: SandboxPool | undefined;
const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]));
  // warmUpGrader() must not start real sandboxes here.
  savedPool = (globalThis as G).__pensumaGraderPool;
  (globalThis as G).__pensumaGraderPool = new SandboxPool({
    ...graderConfig(),
    poolSize: 0,
  });
  env.NODE_ENV = "production";
  env.NEXT_RUNTIME = "nodejs";
  delete env.NEXT_PHASE;
  env.RETENTION_SCHEDULER = "false";
  env.ATTEMPT_SWEEPER = "false";
  // Nothing listens on port 1: the connection is refused at once.
  env.DATABASE_URL = "postgresql://x:y@127.0.0.1:1/none_test";
  env.MIGRATIONS_WAIT_MS = "0";
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
  (globalThis as G).__pensumaGraderPool?.close();
  (globalThis as G).__pensumaGraderPool = savedPool;
});

function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const { log, error, warn } = console;
  console.log = console.error = console.warn = () => {};
  return fn().finally(() => {
    Object.assign(console, { log, error, warn });
  });
}

describe("register()", () => {
  test("exits with code 1 when the migrations fail", async () => {
    const exit = spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ExitCalled(code);
    }) as typeof process.exit);
    try {
      const { register } = await import("./instrumentation");
      const err = await quiet(() => register()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ExitCalled);
      expect((err as ExitCalled).code).toBe(1);
    } finally {
      exit.mockRestore();
    }
  });

  test("during next build the error is thrown, not exited", async () => {
    env.NEXT_PHASE = "phase-production-build";
    const exit = spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ExitCalled(code);
    }) as typeof process.exit);
    try {
      const { register } = await import("./instrumentation");
      const err = await quiet(() => register()).catch((e: unknown) => e);
      expect(err).not.toBeInstanceOf(ExitCalled);
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
    }
  });

  test("starts normally when migrations are disabled", async () => {
    env.RUN_MIGRATIONS = "false";
    const exit = spyOn(process, "exit");
    try {
      const { register } = await import("./instrumentation");
      await quiet(() => register());
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
    }
  });
});
