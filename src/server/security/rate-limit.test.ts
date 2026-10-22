import { describe, expect, test } from "bun:test";
import {
  getRateLimiter,
  isRateLimitDisabled,
  TokenBucketLimiter,
} from "./rate-limit";
import { DEFAULT_RATE_RULE, RATE_RULES, rateRuleFor } from "./rate-rules";

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("TokenBucketLimiter", () => {
  test("allows a burst of `capacity`, then denies with a retry time", () => {
    const c = clock();
    const limiter = new TokenBucketLimiter({ now: c.now });
    const rule = { capacity: 3, refillPerSec: 1 };
    expect(limiter.take("k", rule).ok).toBe(true);
    expect(limiter.take("k", rule).ok).toBe(true);
    expect(limiter.take("k", rule).ok).toBe(true);
    const denied = limiter.take("k", rule);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterMs).toBe(1000);
  });

  test("refills over time, never above capacity", () => {
    const c = clock();
    const limiter = new TokenBucketLimiter({ now: c.now });
    const rule = { capacity: 2, refillPerSec: 0.5 };
    limiter.take("k", rule);
    limiter.take("k", rule);
    expect(limiter.take("k", rule).ok).toBe(false);
    c.advance(2000);
    expect(limiter.take("k", rule).ok).toBe(true);
    expect(limiter.take("k", rule).ok).toBe(false);
    c.advance(60_000);
    expect(limiter.take("k", rule).ok).toBe(true);
    expect(limiter.take("k", rule).ok).toBe(true);
    expect(limiter.take("k", rule).ok).toBe(false);
  });

  test("the 31st rapid saveAnswer is denied", () => {
    const c = clock();
    const limiter = new TokenBucketLimiter({ now: c.now });
    const rule = rateRuleFor("portal.saveAnswer");
    const results = Array.from({ length: 31 }, () => {
      c.advance(10);
      return limiter.take("user:a|portal.saveAnswer", rule).ok;
    });
    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results[30]).toBe(false);
  });

  test("cost > 1 and separate keys", () => {
    const limiter = new TokenBucketLimiter({ now: clock().now });
    const rule = { capacity: 5, refillPerSec: 1 };
    expect(limiter.take("a", rule, 5).ok).toBe(true);
    expect(limiter.take("a", rule).ok).toBe(false);
    expect(limiter.take("b", rule).ok).toBe(true);
  });

  test("evicts the least recently used key beyond maxKeys", () => {
    const limiter = new TokenBucketLimiter({ maxKeys: 2, now: clock().now });
    const rule = { capacity: 1, refillPerSec: 0.001 };
    limiter.take("a", rule);
    limiter.take("b", rule);
    limiter.take("a", rule); // touch a → b is now the oldest
    limiter.take("c", rule);
    expect(limiter.size).toBe(2);
    // a survived and is still empty
    expect(limiter.take("a", rule).ok).toBe(false);
    // b was evicted, so it starts with a full bucket again
    expect(limiter.take("b", rule).ok).toBe(true);
  });

  test("reset", () => {
    const limiter = new TokenBucketLimiter({ now: clock().now });
    const rule = { capacity: 1, refillPerSec: 0.001 };
    limiter.take("a", rule);
    limiter.reset("a");
    expect(limiter.take("a", rule).ok).toBe(true);
    limiter.reset();
    expect(limiter.size).toBe(0);
  });
});

describe("singleton and switches", () => {
  test("one limiter per process", () => {
    expect(getRateLimiter()).toBe(getRateLimiter());
  });

  test("RATE_LIMIT_DISABLED only under NODE_ENV=test", () => {
    expect(
      isRateLimitDisabled({ NODE_ENV: "test", RATE_LIMIT_DISABLED: "1" }),
    ).toBe(true);
    expect(
      isRateLimitDisabled({ NODE_ENV: "production", RATE_LIMIT_DISABLED: "1" }),
    ).toBe(false);
    expect(
      isRateLimitDisabled({
        NODE_ENV: "development",
        RATE_LIMIT_DISABLED: "true",
      }),
    ).toBe(false);
    expect(
      isRateLimitDisabled({ NODE_ENV: "test", RATE_LIMIT_DISABLED: "false" }),
    ).toBe(false);
    expect(isRateLimitDisabled({ NODE_ENV: "test" })).toBe(false);
  });
});

describe("rules", () => {
  test("known paths and the default", () => {
    expect(rateRuleFor("portal.saveAnswer")).toEqual({
      capacity: 30,
      refillPerSec: 1,
    });
    expect(rateRuleFor("review.regradeAssignment").capacity).toBe(3);
    expect(rateRuleFor("something.new")).toBe(DEFAULT_RATE_RULE);
    expect(rateRuleFor("toString")).toBe(DEFAULT_RATE_RULE);
    expect(DEFAULT_RATE_RULE).toEqual({ capacity: 120, refillPerSec: 5 });
  });

  test("every rule is sane", () => {
    for (const [path, r] of Object.entries(RATE_RULES)) {
      expect(path).toMatch(/^[a-z]+\.[A-Za-z]+$/);
      expect(r.capacity).toBeGreaterThan(0);
      expect(r.refillPerSec).toBeGreaterThan(0);
    }
  });
});
