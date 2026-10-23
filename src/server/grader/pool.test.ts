/**
 * SandboxPool scheduling without Pyodide: poolSize 0 and jobs that never
 * touch a sandbox (except the start-up failure test, which spawns a
 * non-existent binary).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { type GraderConfig, graderConfig } from "./config";
import { isGraderUnavailable, QueueTimeoutError } from "./errors";
import { SandboxPool } from "./pool";

const pools: SandboxPool[] = [];
afterEach(() => {
  for (const p of pools.splice(0)) p.close();
});

function pool(over: Partial<GraderConfig> = {}): SandboxPool {
  const p = new SandboxPool({
    ...graderConfig(),
    poolSize: 0,
    maxConcurrency: 1,
    queueTimeoutMs: 100,
    ...over,
  });
  pools.push(p);
  return p;
}

/** A job that holds its slot until `release()` is called. */
function blocker(p: SandboxPool) {
  let release = () => {};
  const held = new Promise<void>((r) => {
    release = r;
  });
  const job = p.withJob(() => held);
  return { job, release };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("SandboxPool queue", () => {
  test("an interactive job gives up after the queue timeout", async () => {
    const p = pool();
    const { job, release } = blocker(p);
    const err = await p.withJob(async () => "ran").catch((e) => e);
    expect(err).toBeInstanceOf(QueueTimeoutError);
    expect(isGraderUnavailable(err)).toBe(true);
    release();
    await job;
  });

  test("a background job without queue timeout waits as long as needed", async () => {
    const p = pool();
    const { job, release } = blocker(p);
    const waiting = p.withJob(async () => "graded", {
      queueTimeoutMs: null,
      priority: "background",
    });
    await sleep(250); // well past the 100 ms queue timeout
    expect(p.stats().queuedBackgroundJobs).toBe(1);
    release();
    await job;
    expect(await waiting).toBe("graded");
  });

  test("interactive jobs start before queued background jobs", async () => {
    const p = pool({ queueTimeoutMs: 5_000 });
    const { job, release } = blocker(p);
    const order: string[] = [];
    const record = (name: string) => async () => {
      order.push(name);
    };
    const jobs = [
      p.withJob(record("background-1"), {
        queueTimeoutMs: null,
        priority: "background",
      }),
      p.withJob(record("interactive")),
      p.withJob(record("background-2"), {
        queueTimeoutMs: null,
        priority: "background",
      }),
    ];
    release();
    await Promise.all([job, ...jobs]);
    expect(order).toEqual(["interactive", "background-1", "background-2"]);
  });

  test("sandboxes that can't start give a GraderUnavailableError", async () => {
    const previous = process.env.GRADER_SNAPSHOT;
    process.env.GRADER_SNAPSHOT = "0";
    try {
      const p = pool({ nodePath: "/nonexistent/pensuma-node" });
      const err = await p
        .withJob((lease) => lease.current())
        .catch((e: unknown) => e);
      expect(isGraderUnavailable(err)).toBe(true);
      expect((err as Error).name).toBe("SandboxStartError");
    } finally {
      if (previous === undefined) delete process.env.GRADER_SNAPSHOT;
      else process.env.GRADER_SNAPSHOT = previous;
    }
  });
});
