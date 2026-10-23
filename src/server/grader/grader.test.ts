/**
 * gradeCodeBatch orchestration without Pyodide: a fake sandbox process that,
 * like a real interpreter, keeps state between the runs of one job.
 *
 * Fake "code" keywords: REMEMBER stores the run's stdin in the process,
 * REPORT prints everything stored so far, ECHO prints the stdin, LOOP never
 * finishes (the request times out and the process dies).
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import type { GradeInput } from "@/lib/python/types";
import {
  type CodeTest,
  codeQuestionDataSchema,
  redactCodeResultForStudent,
} from "@/lib/questions/schema";
import { graderConfig, resetGraderConfig } from "./config";
import { isGraderUnavailable } from "./errors";
import { gradeCodeBatch } from "./grader";
import { SandboxPool } from "./pool";
import type { SandboxProcess, SandboxResponse } from "./sandbox-process";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class FakeProc {
  alive = true;
  isReady = true;
  ready = Promise.resolve();
  private readonly memory: string[] = [];

  kill(): void {
    this.alive = false;
  }

  async request(
    message: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<SandboxResponse> {
    if (message.t === "analyze") {
      return {
        ok: true,
        message: {
          t: "analysis",
          result: {
            ok: true,
            constructs: {},
            functionDefs: [],
            functionCalls: [],
            imports: [],
          },
        },
        durationMs: 1,
      };
    }
    const req = message.request as { code: string; stdin: string };
    if (req.code.includes("LOOP")) {
      await sleep(timeoutMs);
      this.alive = false;
      return {
        ok: false,
        failure: "timeout",
        message: "",
        durationMs: timeoutMs,
      };
    }
    let stdout = "";
    if (req.code.includes("REPORT"))
      stdout += `gezien: ${this.memory.join(",")}\n`;
    if (req.code.includes("REMEMBER")) this.memory.push(req.stdin);
    if (req.code.includes("ECHO")) stdout += `${req.stdin}\n`;
    return {
      ok: true,
      message: {
        t: "result",
        result: {
          stdout,
          stderr: "",
          transcript: stdout,
          segments: [],
          error: null,
          moduleError: null,
          value: null,
          truncated: false,
        },
      },
      durationMs: 1,
    };
  }
}

class FakePool extends SandboxPool {
  failStart = false;
  override async take(): Promise<SandboxProcess> {
    if (this.failStart) throw new Error("spawn ENOENT");
    return new FakeProc() as unknown as SandboxProcess;
  }
}

type G = typeof globalThis & { __pensumaGraderPool?: SandboxPool };
let fake: FakePool;
const savedJobTimeout = process.env.GRADER_JOB_TIMEOUT_MS;

beforeAll(() => {
  process.env.GRADER_JOB_TIMEOUT_MS = "5000";
  resetGraderConfig();
});
afterAll(() => {
  if (savedJobTimeout === undefined) delete process.env.GRADER_JOB_TIMEOUT_MS;
  else process.env.GRADER_JOB_TIMEOUT_MS = savedJobTimeout;
  resetGraderConfig();
});

function installPool(over: Partial<ReturnType<typeof graderConfig>> = {}) {
  fake = new FakePool({
    ...graderConfig(),
    poolSize: 0,
    maxConcurrency: 2,
    ...over,
  });
  (globalThis as G).__pensumaGraderPool = fake;
}
afterEach(() => {
  fake?.close();
  (globalThis as G).__pensumaGraderPool = undefined;
});

const io = (
  id: string,
  stdin: string,
  expectedOutput: string,
  hidden = false,
): CodeTest =>
  codeQuestionDataSchema.parse({
    tests: [{ id, kind: "io", name: id, stdin, expectedOutput, hidden }],
  }).tests[0];

const item = (
  code: string,
  tests: CodeTest[],
  timeLimitMs = 500,
): GradeInput => ({
  code,
  tests,
  checks: [],
  timeLimitMs,
});

describe("gradeCodeBatch: hidden inputs never reach student-visible output", () => {
  test("a later question's visible test can't print an earlier question's hidden input", async () => {
    installPool();
    const a = item("REMEMBER ECHO", [
      io("zichtbaar", "Mark", "Mark"),
      io("verborgen", "Fatima", "Fatima", true),
    ]);
    const b = item("REPORT", [io("hallo", "", "Hallo wereld!")]);
    const [ra, rb] = await gradeCodeBatch([a, b]);
    expect(ra.fraction).toBe(1);
    const visible = redactCodeResultForStudent(rb).tests[0];
    expect(visible.hidden).toBe(false);
    expect(visible.actual).toContain("Mark");
    expect(visible.actual).not.toContain("Fatima");
  });

  test("a hidden test stored before a visible one still runs after it", async () => {
    installPool();
    const [r] = await gradeCodeBatch([
      item("REPORT REMEMBER", [
        io("verborgen", "Geheim", "x", true),
        io("zichtbaar", "Open", "x"),
      ]),
    ]);
    // Results keep the stored order...
    expect(r.tests.map((t) => t.testId)).toEqual(["verborgen", "zichtbaar"]);
    // ...but the visible test ran first and saw nothing secret.
    const visible = redactCodeResultForStudent(r).tests[1];
    expect(visible.actual).toBe("gezien: \n");
  });
});

describe("gradeCodeBatch: one job's time is shared fairly", () => {
  test("an endless loop in one question doesn't cost the other questions their tests", async () => {
    installPool();
    const loopTests = Array.from({ length: 8 }, (_, i) =>
      io(`l${i}`, String(i), String(i)),
    );
    const started = Date.now();
    const [looping, honest1, honest2] = await gradeCodeBatch([
      item("LOOP", loopTests),
      item("ECHO", [io("a", "1", "1"), io("b", "2", "2", true)]),
      item("ECHO", [io("c", "3", "3"), io("d", "4", "4", true)]),
    ]);
    const elapsed = Date.now() - started;
    expect(honest1.fraction).toBe(1);
    expect(honest2.fraction).toBe(1);
    expect(looping.status).toBe("timeout");
    expect(looping.tests.every((t) => !t.passed && t.timedOut)).toBe(true);
    // The old code gave every question the full budget: 8 x 500 ms here.
    expect(elapsed).toBeLessThan(3_500);
  });
});

describe("gradeCodeBatch: grader unavailable", () => {
  const items = [item("ECHO", [io("a", "1", "1")])];

  test("sandboxes that can't start: internal_error by default, a throw on request", async () => {
    installPool();
    fake.failStart = true;
    const [r] = await gradeCodeBatch(items);
    expect(r.status).toBe("internal_error");
    const err = await gradeCodeBatch(items, {
      throwWhenUnavailable: true,
    }).catch((e: unknown) => e);
    expect(isGraderUnavailable(err)).toBe(true);
  });

  test("a queue timeout throws on request; background jobs wait instead", async () => {
    installPool({ maxConcurrency: 1, queueTimeoutMs: 50 });
    let release = () => {};
    const held = fake.withJob(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    const [busy] = await gradeCodeBatch(items);
    expect(busy.status).toBe("internal_error");
    const err = await gradeCodeBatch(items, {
      throwWhenUnavailable: true,
    }).catch((e: unknown) => e);
    expect((err as Error).name).toBe("QueueTimeoutError");

    const background = gradeCodeBatch(items, {
      queueTimeoutMs: null,
      priority: "background",
      throwWhenUnavailable: true,
    });
    await sleep(150);
    release();
    await held;
    const [graded] = await background;
    expect(graded.fraction).toBe(1);
  });
});
