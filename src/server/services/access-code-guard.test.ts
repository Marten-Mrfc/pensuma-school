import { beforeEach, describe, expect, test } from "bun:test";
import {
  ACCESS_CODE_LOCK_MS,
  ACCESS_CODE_MAX_FAILURES,
  ACCESS_CODE_WINDOW_MS,
  accessCodeKey,
  accessCodeLockRemaining,
  accessCodesMatch,
  clearAccessCodeFailures,
  isAccessCodeLocked,
  normalizeAccessCode,
  recordAccessCodeFailure,
  resetAccessCodeGuard,
} from "./access-code-guard";

const KEY = accessCodeKey("user-1", "assignment-1");
const T0 = 1_000_000_000_000;

beforeEach(() => resetAccessCodeGuard());

describe("access code comparison", () => {
  test("ignores case and whitespace", () => {
    expect(normalizeAccessCode(" ab c12 ")).toBe("ABC12");
    expect(accessCodesMatch("abc123", "ABC123")).toBe(true);
    expect(accessCodesMatch(" ABC 123 ", "abc123")).toBe(true);
  });

  test("rejects other codes, also of a different length", () => {
    expect(accessCodesMatch("ABC124", "ABC123")).toBe(false);
    expect(accessCodesMatch("ABC1234", "ABC123")).toBe(false);
    expect(accessCodesMatch("", "ABC123")).toBe(false);
  });

  test("an empty stored code never matches", () => {
    expect(accessCodesMatch("", "")).toBe(false);
    expect(accessCodesMatch("  ", " ")).toBe(false);
  });
});

describe("lockout", () => {
  test("uses one key per student and assignment", () => {
    expect(KEY).toBe("access:user-1:assignment-1");
  });

  test("locks after 5 failures within the window", () => {
    for (let i = 1; i < ACCESS_CODE_MAX_FAILURES; i++) {
      const r = recordAccessCodeFailure(KEY, T0 + i * 1000);
      expect(r.locked).toBe(false);
      expect(r.failures).toBe(i);
    }
    expect(isAccessCodeLocked(KEY, T0 + 4500)).toBe(false);
    const fifth = recordAccessCodeFailure(KEY, T0 + 5000);
    expect(fifth.locked).toBe(true);
    expect(isAccessCodeLocked(KEY, T0 + 5001)).toBe(true);
    expect(accessCodeLockRemaining(KEY, T0 + 5000)).toBe(ACCESS_CODE_LOCK_MS);
  });

  test("the lock ends after 10 minutes", () => {
    for (let i = 0; i < ACCESS_CODE_MAX_FAILURES; i++) {
      recordAccessCodeFailure(KEY, T0 + i);
    }
    const lockedAt = T0 + ACCESS_CODE_MAX_FAILURES - 1;
    expect(isAccessCodeLocked(KEY, lockedAt + ACCESS_CODE_LOCK_MS - 1)).toBe(
      true,
    );
    expect(isAccessCodeLocked(KEY, lockedAt + ACCESS_CODE_LOCK_MS)).toBe(false);
    // A fresh start: one more failure doesn't lock again.
    expect(
      recordAccessCodeFailure(KEY, lockedAt + ACCESS_CODE_LOCK_MS + 1).locked,
    ).toBe(false);
  });

  test("failures older than the window don't count", () => {
    for (let i = 0; i < ACCESS_CODE_MAX_FAILURES - 1; i++) {
      recordAccessCodeFailure(KEY, T0 + i);
    }
    const later = T0 + ACCESS_CODE_WINDOW_MS + 10;
    const r = recordAccessCodeFailure(KEY, later);
    expect(r.locked).toBe(false);
    expect(r.failures).toBe(1);
  });

  test("failures while locked don't extend the lock", () => {
    for (let i = 0; i < ACCESS_CODE_MAX_FAILURES; i++) {
      recordAccessCodeFailure(KEY, T0);
    }
    recordAccessCodeFailure(KEY, T0 + 60_000);
    expect(accessCodeLockRemaining(KEY, T0 + 60_000)).toBe(
      ACCESS_CODE_LOCK_MS - 60_000,
    );
  });

  test("keys are independent", () => {
    for (let i = 0; i < ACCESS_CODE_MAX_FAILURES; i++) {
      recordAccessCodeFailure(KEY, T0);
    }
    expect(
      isAccessCodeLocked(accessCodeKey("user-2", "assignment-1"), T0),
    ).toBe(false);
    expect(
      isAccessCodeLocked(accessCodeKey("user-1", "assignment-2"), T0),
    ).toBe(false);
  });

  test("a right code clears earlier failures", () => {
    for (let i = 0; i < ACCESS_CODE_MAX_FAILURES - 1; i++) {
      recordAccessCodeFailure(KEY, T0 + i);
    }
    clearAccessCodeFailures(KEY);
    expect(recordAccessCodeFailure(KEY, T0 + 10).failures).toBe(1);
  });
});

describe("audit sampling", () => {
  test("audits once per key per 10 minutes", () => {
    expect(recordAccessCodeFailure(KEY, T0).shouldAudit).toBe(true);
    expect(recordAccessCodeFailure(KEY, T0 + 1000).shouldAudit).toBe(false);
    expect(
      recordAccessCodeFailure(KEY, T0 + ACCESS_CODE_WINDOW_MS - 1).shouldAudit,
    ).toBe(false);
    expect(
      recordAccessCodeFailure(KEY, T0 + ACCESS_CODE_WINDOW_MS).shouldAudit,
    ).toBe(true);
  });

  test("each key is sampled on its own", () => {
    const other = accessCodeKey("user-2", "assignment-1");
    expect(recordAccessCodeFailure(KEY, T0).shouldAudit).toBe(true);
    expect(recordAccessCodeFailure(other, T0).shouldAudit).toBe(true);
  });

  test("clearing failures keeps the audit sample time", () => {
    expect(recordAccessCodeFailure(KEY, T0).shouldAudit).toBe(true);
    clearAccessCodeFailures(KEY);
    expect(recordAccessCodeFailure(KEY, T0 + 1000).shouldAudit).toBe(false);
  });
});
