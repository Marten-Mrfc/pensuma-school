/**
 * JobBudget + runPhase: one grading job (all code questions of one
 * submission) shares GRADER_JOB_TIMEOUT_MS fairly between its questions.
 * Driven with a fake clock: a test "takes" its duration instantly.
 */
import { describe, expect, test } from "bun:test";
import { JobBudget, RESPAWN_MARGIN_MS, runPhase } from "./budget";

/** A test duration in ms, or null for a timeout (time limit + respawn). */
type Duration = number | null;

async function simulate(
  totalMs: number,
  questions: { timeLimitMs: number; tests: Duration[] }[],
) {
  let clock = 0;
  const budget = new JobBudget(
    totalMs,
    questions.map((q) => q.timeLimitMs),
    () => clock,
  );
  const ran = questions.map(() => 0);
  const skipped = questions.map(() => 0);
  await runPhase(
    budget,
    questions.map((q) => q.tests),
    questions.map(() => true),
    async (i, duration) => {
      ran[i]++;
      clock +=
        duration === null
          ? questions[i].timeLimitMs + RESPAWN_MARGIN_MS
          : duration;
      return duration === null;
    },
    (i) => {
      skipped[i]++;
    },
  );
  return { ran, skipped, elapsed: clock };
}

const loops = (n: number): Duration[] => Array.from({ length: n }, () => null);
const fast = (n: number): Duration[] => Array.from({ length: n }, () => 5);

describe("JobBudget + runPhase", () => {
  test("an endless loop in one question doesn't starve the other questions", async () => {
    // 9 questions; the first loops on all of its 22 tests (5 s limit).
    const { ran, elapsed } = await simulate(120_000, [
      { timeLimitMs: 5_000, tests: loops(22) },
      ...Array.from({ length: 8 }, () => ({
        timeLimitMs: 5_000,
        tests: fast(5),
      })),
    ]);
    expect(ran.slice(1)).toEqual(Array(8).fill(5));
    expect(ran[0]).toBeGreaterThanOrEqual(2);
    expect(elapsed).toBeLessThanOrEqual(120_000 + 6_000);
  });

  test("when every question loops the job stays within its budget", async () => {
    const { ran, elapsed } = await simulate(
      120_000,
      Array.from({ length: 9 }, () => ({
        timeLimitMs: 5_000,
        tests: loops(22),
      })),
    );
    // Before the fix every question had the full 120 s (about 9 x 114 s).
    expect(elapsed).toBeLessThanOrEqual(120_000 + 6_000);
    for (const n of ran) expect(n).toBeGreaterThanOrEqual(2);
  });

  test("a looping question keeps a fair share next to slow honest ones", async () => {
    const { ran, elapsed } = await simulate(60_000, [
      { timeLimitMs: 5_000, tests: loops(10) },
      { timeLimitMs: 5_000, tests: Array.from({ length: 6 }, () => 2_000) },
      { timeLimitMs: 5_000, tests: Array.from({ length: 6 }, () => 2_000) },
    ]);
    expect(ran[1]).toBe(6);
    expect(ran[2]).toBe(6);
    expect(ran[0]).toBeGreaterThanOrEqual(3);
    expect(elapsed).toBeLessThanOrEqual(60_000 + 6_000);
  });

  test("a legitimately slow question may use time the others don't need", async () => {
    // 3 s per test, 20 tests (60 s) before two fast questions.
    const { ran } = await simulate(120_000, [
      { timeLimitMs: 5_000, tests: Array.from({ length: 20 }, () => 3_000) },
      { timeLimitMs: 5_000, tests: fast(3) },
      { timeLimitMs: 5_000, tests: fast(3) },
    ]);
    expect(ran).toEqual([20, 3, 3]);
  });

  test("a single question gets the whole budget", async () => {
    const { ran, elapsed } = await simulate(30_000, [
      { timeLimitMs: 2_000, tests: loops(50) },
    ]);
    expect(ran[0]).toBe(10); // 10 x (2 s + 1 s margin) = 30 s
    expect(elapsed).toBeLessThanOrEqual(30_000);
  });

  test("one timeout doesn't cost a question its later tests when time allows", async () => {
    // 9 questions with a 10 s limit (share 13.3 s): after one timeout the
    // question is over its share, but the job has used only 11 s of 120 s.
    const { ran, skipped } = await simulate(120_000, [
      { timeLimitMs: 10_000, tests: [null, 5, 5, 5, 5, 5] },
      ...Array.from({ length: 8 }, () => ({
        timeLimitMs: 10_000,
        tests: fast(5),
      })),
    ]);
    expect(ran).toEqual([6, ...Array(8).fill(5)]);
    expect(skipped).toEqual(Array(9).fill(0));
  });

  test("visible tests that had to wait run before the hidden phase", async () => {
    // Like gradeCodeBatch: the visible tests of every question, then the
    // hidden ones. Question 0 times out once; the others each still have a
    // hidden test that could take up to its time limit.
    let clock = 0;
    const questions = [
      { visible: [null, 5, 5, 5, 5] as Duration[], hidden: [] as Duration[] },
      ...Array.from({ length: 8 }, () => ({
        visible: [5] as Duration[],
        hidden: [5] as Duration[],
      })),
    ];
    const budget = new JobBudget(
      120_000,
      questions.map(() => 10_000),
      () => clock,
      questions.map((q) => q.visible.length + q.hidden.length),
    );
    const order: string[] = [];
    const execute = (phase: string) => async (i: number, d: Duration) => {
      order.push(`${phase}${i}`);
      clock += d === null ? 10_000 + RESPAWN_MARGIN_MS : d;
      return d === null;
    };
    const skippedTests: number[] = [];
    await runPhase(
      budget,
      questions.map((q) => q.visible),
      questions.map((q) => q.hidden.length === 0),
      execute("v"),
      (i) => skippedTests.push(i),
    );
    await runPhase(
      budget,
      questions.map((q) => q.hidden),
      questions.map(() => true),
      execute("h"),
      (i) => skippedTests.push(i),
    );
    expect(skippedTests).toEqual([]);
    expect(order.filter((o) => o === "v0")).toHaveLength(5);
    // Every visible test (the waiting ones included) ran before any hidden one.
    expect(order.findLastIndex((o) => o.startsWith("v"))).toBeLessThan(
      order.findIndex((o) => o.startsWith("h")),
    );
  });

  test("a waiting test is given up when the others may still need the time", async () => {
    // 3 questions, 30 s job, 10 s limit (share 10 s): question 0 loops; the
    // others are fast but each still has 2 tests that could time out.
    const { ran, skipped, elapsed } = await simulate(30_000, [
      { timeLimitMs: 9_000, tests: loops(3) },
      { timeLimitMs: 9_000, tests: fast(2) },
      { timeLimitMs: 9_000, tests: fast(2) },
    ]);
    expect(ran[1]).toBe(2);
    expect(ran[2]).toBe(2);
    expect(ran[0] + skipped[0]).toBe(3);
    expect(elapsed).toBeLessThanOrEqual(30_000 + 10_000);
  });

  test("nothing starts after the job deadline", () => {
    let clock = 0;
    const budget = new JobBudget(10_000, [1_000, 1_000], () => clock);
    expect(budget.mayStart(0)).toBe(true);
    clock = 10_000;
    expect(budget.mayStart(0)).toBe(false);
    expect(budget.mayStart(1)).toBe(false);
  });
});
