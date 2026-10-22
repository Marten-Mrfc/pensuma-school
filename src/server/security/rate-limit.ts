/**
 * In-memory token-bucket rate limiter for tRPC procedures.
 *
 * One Dokploy replica runs the app, so process memory is enough; with
 * several replicas the limits would apply per replica (move to Postgres or
 * Redis then). The singleton lives on globalThis so it survives HMR.
 * Pure module (no server-only imports).
 */

export type BucketRule = {
  /** Burst size. */
  capacity: number;
  /** Sustained rate (tokens per second). */
  refillPerSec: number;
};

export type TakeResult = {
  ok: boolean;
  /** 0 when allowed; otherwise the wait until `cost` tokens are back. */
  retryAfterMs: number;
};

type Bucket = { tokens: number; updatedAt: number };

export const MAX_BUCKETS = 50_000;

export class TokenBucketLimiter {
  /** Insertion order = least recently used first. */
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(opts: { maxKeys?: number; now?: () => number } = {}) {
    this.maxKeys = opts.maxKeys ?? MAX_BUCKETS;
    this.now = opts.now ?? Date.now;
  }

  get size(): number {
    return this.buckets.size;
  }

  take(key: string, rule: BucketRule, cost = 1): TakeResult {
    const now = this.now();
    const existing = this.buckets.get(key);
    let tokens = rule.capacity;
    if (existing) {
      const elapsed = Math.max(0, now - existing.updatedAt) / 1000;
      tokens = Math.min(
        rule.capacity,
        existing.tokens + elapsed * rule.refillPerSec,
      );
      this.buckets.delete(key);
    }
    let result: TakeResult;
    if (tokens >= cost) {
      tokens -= cost;
      result = { ok: true, retryAfterMs: 0 };
    } else {
      const missing = cost - tokens;
      result = {
        ok: false,
        retryAfterMs:
          rule.refillPerSec > 0
            ? Math.ceil((missing / rule.refillPerSec) * 1000)
            : Number.POSITIVE_INFINITY,
      };
    }
    this.buckets.set(key, { tokens, updatedAt: now });
    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
    return result;
  }

  reset(key?: string): void {
    if (key === undefined) this.buckets.clear();
    else this.buckets.delete(key);
  }
}

const GLOBAL_KEY = Symbol.for("pensuma.rateLimiter");
type GlobalWithLimiter = typeof globalThis & {
  [GLOBAL_KEY]?: TokenBucketLimiter;
};

export function getRateLimiter(): TokenBucketLimiter {
  const g = globalThis as GlobalWithLimiter;
  g[GLOBAL_KEY] ??= new TokenBucketLimiter();
  return g[GLOBAL_KEY];
}

/**
 * RATE_LIMIT_DISABLED only counts under NODE_ENV=test (integration tests);
 * src/env.ts also rejects it in production.
 */
export function isRateLimitDisabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = env.RATE_LIMIT_DISABLED;
  return env.NODE_ENV === "test" && !!flag && flag !== "0" && flag !== "false";
}

/** Take from the shared limiter (always allowed when disabled for tests). */
export function take(key: string, rule: BucketRule, cost = 1): TakeResult {
  if (isRateLimitDisabled()) return { ok: true, retryAfterMs: 0 };
  return getRateLimiter().take(key, rule, cost);
}
