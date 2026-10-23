import { describe, expect, test } from "bun:test";
import {
  ACCOUNT_LOCKED_MESSAGE,
  accountKeyFor,
  FAILURES_AFTER_EXPIRED_LOCK,
  ipThrottleKey,
  MAX_FAILURES,
  RESTRICTED_NETWORK_MAX_FAILURES,
  SprayDetector,
  studentThrottleKeys,
} from "./login-throttle";

describe("accountKeyFor", () => {
  test("username sign-in → student key", () => {
    expect(accountKeyFor("/sign-in/username", { username: " 17053 " })).toEqual(
      { key: "acct:student:17053", kind: "student", identifier: "17053" },
    );
  });

  test("student placeholder e-mail → the same student key", () => {
    expect(
      accountKeyFor("/sign-in/email", {
        email: "17053@Leerling.Pensuma.Local",
      }),
    ).toEqual({
      key: "acct:student:17053",
      kind: "student",
      identifier: "17053",
    });
  });

  test("other e-mail → e-mail key", () => {
    expect(
      accountKeyFor("/sign-in/email", { email: "Docent@School.nl" }),
    ).toEqual({
      key: "acct:email:docent@school.nl",
      kind: "email",
      identifier: "docent@school.nl",
    });
  });

  test("missing or empty identifiers → null", () => {
    expect(accountKeyFor("/sign-in/username", {})).toBeNull();
    expect(accountKeyFor("/sign-in/username", { username: "  " })).toBeNull();
    expect(accountKeyFor("/sign-in/email", { email: 42 })).toBeNull();
    expect(accountKeyFor("/sign-in/email", null)).toBeNull();
  });

  test("identifiers are capped", () => {
    const key = accountKeyFor("/sign-in/email", { email: "a".repeat(5000) });
    expect(key?.key.length).toBeLessThan(300);
  });
});

describe("keys and messages", () => {
  test("studentThrottleKeys includes the new and the legacy keys", () => {
    expect(studentThrottleKeys(" 17053 ")).toEqual([
      "acct:student:17053",
      "/sign-in/username:17053",
      "/sign-in/email:17053@leerling.pensuma.local",
    ]);
  });

  test("ip key", () => {
    expect(ipThrottleKey("203.0.113.7")).toBe("ip:203.0.113.7");
  });

  test("decay restarts three tries before the next lock", () => {
    expect(MAX_FAILURES - FAILURES_AFTER_EXPIRED_LOCK).toBe(3);
  });

  test("a restricted network tightens the lock, never below the restart value", () => {
    expect(RESTRICTED_NETWORK_MAX_FAILURES).toBeLessThan(MAX_FAILURES);
    // After an expired lock the first wrong PIN from a restricted network
    // re-locks: one guess per lock period.
    expect(RESTRICTED_NETWORK_MAX_FAILURES).toBeLessThanOrEqual(
      FAILURES_AFTER_EXPIRED_LOCK,
    );
    // A couple of typos never lock a pupil, even during a spray.
    expect(RESTRICTED_NETWORK_MAX_FAILURES).toBeGreaterThanOrEqual(3);
  });

  test("Dutch lock message (the only refusal a sign-in gets)", () => {
    expect(ACCOUNT_LOCKED_MESSAGE).toBe(
      "Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw of vraag je docent om hulp.",
    );
  });
});

describe("SprayDetector", () => {
  test("alerts once above the threshold, then at most every 10 minutes", () => {
    const detector = new SprayDetector(5, 10);
    const t0 = 1_700_000_000_000;
    const alerts: boolean[] = [];
    for (let i = 0; i < 8; i++) alerts.push(detector.record(t0 + i * 1000));
    // 6th failure crosses "> 5"
    expect(alerts).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    // still above the threshold 5 minutes later: no new alert
    expect(detector.record(t0 + 5 * 60_000)).toBe(false);
    // 11 minutes later the old failures have left the window
    expect(detector.record(t0 + 11 * 60_000)).toBe(false);
  });

  test("a new burst after the quiet period alerts again", () => {
    const detector = new SprayDetector(2, 10);
    const t0 = 1_700_000_000_000;
    detector.record(t0);
    detector.record(t0);
    expect(detector.record(t0)).toBe(true);
    const later = t0 + 20 * 60_000;
    detector.record(later);
    detector.record(later);
    expect(detector.record(later)).toBe(true);
  });
});
