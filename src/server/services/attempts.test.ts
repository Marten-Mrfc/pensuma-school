import { describe, expect, mock, test } from "bun:test";

// attempts.ts is a server module: stub its server-only imports so the pure
// helpers can be tested without a database or a request scope.
mock.module("server-only", () => ({}));
mock.module("next/server", () => ({ after: () => {} }));
mock.module("@/server/db", () => ({ db: {} }));
mock.module("@/server/services/grading", () => ({
  gradeAttempt: async () => {},
  gradeAttemptsInBackground: async () => ({ graded: [], failed: [] }),
  isGradingInFlight: () => false,
  logGradingFailure: () => {},
  markGradingScheduled: () => {},
}));

const { isInCooldown, NEW_ATTEMPT_COOLDOWN_MS, optionOrderFor, shuffled } =
  await import("./attempts");

const items = Array.from({ length: 12 }, (_, i) => `q${i + 1}`);

describe("shuffled", () => {
  test("returns a permutation", () => {
    const out = shuffled(items, "seed-1");
    expect(out).toHaveLength(items.length);
    expect([...out].sort()).toEqual([...items].sort());
  });

  test("is deterministic per seed", () => {
    expect(shuffled(items, "abc")).toEqual(shuffled(items, "abc"));
    expect(shuffled(items, "abc")).not.toEqual(shuffled(items, "abd"));
  });

  test("does not mutate its input", () => {
    const input = [...items];
    shuffled(input, "x");
    shuffled(input);
    expect(input).toEqual(items);
  });

  test("an unseeded shuffle is still a permutation", () => {
    const out = shuffled(items);
    expect([...out].sort()).toEqual([...items].sort());
  });

  test("handles empty and single-item lists", () => {
    expect(shuffled([], "s")).toEqual([]);
    expect(shuffled(["only"], "s")).toEqual(["only"]);
  });
});

describe("optionOrderFor", () => {
  const options = ["a", "b", "c", "d", "e"].map((id) => ({ id, text: id }));

  test("is stable per attempt and question", () => {
    const first = optionOrderFor("attempt-1", "question-1", options, true);
    const again = optionOrderFor("attempt-1", "question-1", options, true);
    expect(again).toEqual(first);
    expect(first.map((o) => o.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("differs between attempts (for most seeds)", () => {
    const orders = new Set(
      Array.from({ length: 10 }, (_, i) =>
        optionOrderFor(`attempt-${i}`, "question-1", options, true)
          .map((o) => o.id)
          .join(""),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  test("keeps the stored order without shuffle, as a copy", () => {
    const out = optionOrderFor("attempt-1", "question-1", options, false);
    expect(out).toEqual(options);
    expect(out).not.toBe(options);
  });
});

describe("isInCooldown", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  test("blocks a new attempt within 30 seconds of the last start", () => {
    expect(NEW_ATTEMPT_COOLDOWN_MS).toBe(30_000);
    expect(isInCooldown([ago(5_000)], now)).toBe(true);
    expect(isInCooldown([ago(29_999)], now)).toBe(true);
  });

  test("allows it after 30 seconds", () => {
    expect(isInCooldown([ago(30_000)], now)).toBe(false);
    expect(isInCooldown([ago(3_600_000)], now)).toBe(false);
  });

  test("looks at the most recent attempt", () => {
    expect(isInCooldown([ago(3_600_000), ago(10_000)], now)).toBe(true);
  });

  test("no previous attempts: no cooldown", () => {
    expect(isInCooldown([], now)).toBe(false);
  });
});
