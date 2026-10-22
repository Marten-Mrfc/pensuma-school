/**
 * Brute-force protection for assignment access codes (in memory, per
 * server process). A student who types a wrong code 5 times within 10
 * minutes is locked out of that assignment for 10 minutes, even when the
 * next code is right. Pure module (no database), so it is unit-testable.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const ACCESS_CODE_MAX_FAILURES = 5;
export const ACCESS_CODE_WINDOW_MS = 10 * 60_000;
export const ACCESS_CODE_LOCK_MS = 10 * 60_000;
/** Mismatches are answered after a short delay to slow down guessing. */
export const ACCESS_CODE_FAILURE_DELAY_MS = 400;
/** Upper bound for tracked keys (oldest are evicted first). */
const MAX_KEYS = 10_000;

export const ACCESS_CODE_LOCKED_MESSAGE =
  "Je hebt te vaak een verkeerde toegangscode ingevuld. Wacht 10 minuten of vraag je docent om hulp.";
export const ACCESS_CODE_WRONG_MESSAGE = "Onjuiste toegangscode";

type Entry = {
  /** Times of recent failures (within the window). */
  failures: number[];
  lockedUntil: number | null;
  /** Last time a failure of this key was written to the audit log. */
  auditedAt: number | null;
};

/** Insertion order = least recently touched first. */
const entries = new Map<string, Entry>();

export function accessCodeKey(userId: string, assignmentId: string): string {
  return `access:${userId}:${assignmentId}`;
}

/** Case, surrounding and inner whitespace don't matter. */
export function normalizeAccessCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

const digest = (value: string) =>
  createHash("sha256").update(normalizeAccessCode(value), "utf8").digest();

/**
 * Constant-time comparison of the normalised codes (sha-256 digests, so
 * the buffers always have equal length and the length doesn't leak).
 */
export function accessCodesMatch(given: string, expected: string): boolean {
  if (!normalizeAccessCode(expected)) return false;
  return timingSafeEqual(digest(given), digest(expected));
}

function touch(key: string, entry: Entry) {
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > MAX_KEYS) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

function prune(entry: Entry, now: number) {
  entry.failures = entry.failures.filter(
    (t) => now - t < ACCESS_CODE_WINDOW_MS,
  );
  if (entry.lockedUntil != null && entry.lockedUntil <= now) {
    entry.lockedUntil = null;
    entry.failures = [];
  }
}

/** Milliseconds the key is still locked; 0 when it isn't. */
export function accessCodeLockRemaining(key: string, now = Date.now()): number {
  const entry = entries.get(key);
  if (!entry) return 0;
  prune(entry, now);
  return entry.lockedUntil != null ? entry.lockedUntil - now : 0;
}

export function isAccessCodeLocked(key: string, now = Date.now()): boolean {
  return accessCodeLockRemaining(key, now) > 0;
}

/**
 * Record a wrong code. `locked` is true when this failure reached the
 * limit; `shouldAudit` is true at most once per key per 10 minutes.
 */
export function recordAccessCodeFailure(
  key: string,
  now = Date.now(),
): { locked: boolean; failures: number; shouldAudit: boolean } {
  const entry = entries.get(key) ?? {
    failures: [],
    lockedUntil: null,
    auditedAt: null,
  };
  prune(entry, now);
  if (entry.lockedUntil == null) {
    entry.failures.push(now);
    if (entry.failures.length >= ACCESS_CODE_MAX_FAILURES) {
      entry.lockedUntil = now + ACCESS_CODE_LOCK_MS;
    }
  }
  const shouldAudit =
    entry.auditedAt == null || now - entry.auditedAt >= ACCESS_CODE_WINDOW_MS;
  if (shouldAudit) entry.auditedAt = now;
  touch(key, entry);
  return {
    locked: entry.lockedUntil != null,
    failures: entry.failures.length,
    shouldAudit,
  };
}

/** A right code (while not locked) forgets earlier mistakes. */
export function clearAccessCodeFailures(key: string): void {
  const entry = entries.get(key);
  if (!entry) return;
  entry.failures = [];
  entry.lockedUntil = null;
  if (entry.auditedAt == null) entries.delete(key);
}

/** Tests only. */
export function resetAccessCodeGuard(): void {
  entries.clear();
}
