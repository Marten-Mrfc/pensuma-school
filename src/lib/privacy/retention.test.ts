import { describe, expect, test } from "bun:test";
import {
  autoDeleteActive,
  autoDeleteNotice,
  autoDeleteState,
  computeRetentionCutoffs,
  emptyRetentionReport,
  formatDays,
  formatMonths,
  RETENTION_COUNT_KEYS,
  RETENTION_COUNT_LABELS,
  retentionDeletedTotal,
  subtractDays,
  subtractMonthsUtc,
} from "./retention";
import { privacySettingsSchema } from "./settings";

const retention = (patch: Record<string, unknown> = {}) =>
  privacySettingsSchema.parse({ retention: patch }).retention;

describe("subtractMonthsUtc", () => {
  test("clamps to the end of a shorter month", () => {
    expect(
      subtractMonthsUtc(new Date("2027-03-31T10:00:00Z"), 1).toISOString(),
    ).toBe("2027-02-28T10:00:00.000Z");
    // 2028 is a leap year.
    expect(
      subtractMonthsUtc(new Date("2028-03-31T10:00:00Z"), 1).toISOString(),
    ).toBe("2028-02-29T10:00:00.000Z");
    expect(
      subtractMonthsUtc(new Date("2026-05-31T00:00:00Z"), 1).toISOString(),
    ).toBe("2026-04-30T00:00:00.000Z");
  });

  test("crosses year boundaries", () => {
    expect(
      subtractMonthsUtc(new Date("2026-01-15T08:30:00Z"), 1).toISOString(),
    ).toBe("2025-12-15T08:30:00.000Z");
    expect(
      subtractMonthsUtc(new Date("2026-10-22T12:00:00Z"), 24).toISOString(),
    ).toBe("2024-10-22T12:00:00.000Z");
    expect(
      subtractMonthsUtc(new Date("2026-02-28T00:00:00Z"), 120).toISOString(),
    ).toBe("2016-02-28T00:00:00.000Z");
  });

  test("keeps the time of day in UTC", () => {
    const d = subtractMonthsUtc(new Date("2026-07-01T23:59:59.999Z"), 6);
    expect(d.toISOString()).toBe("2026-01-01T23:59:59.999Z");
  });
});

describe("subtractDays", () => {
  test("exact 24-hour days", () => {
    expect(
      subtractDays(new Date("2026-10-22T12:00:00Z"), 90).toISOString(),
    ).toBe("2026-07-24T12:00:00.000Z");
  });
});

describe("computeRetentionCutoffs", () => {
  const now = new Date("2026-10-22T12:00:00Z");

  test("defaults: technical data and logs only", () => {
    const c = computeRetentionCutoffs(retention(), now);
    expect(c.sessionsBefore).toEqual(now);
    expect(c.verificationBefore).toEqual(now);
    expect(c.rateLimitBeforeMs).toBe(now.getTime() - 24 * 3600 * 1000);
    expect(c.loginThrottleBefore.toISOString()).toBe(
      "2026-10-21T12:00:00.000Z",
    );
    expect(c.attemptEventsBefore.toISOString()).toBe(
      "2026-07-24T12:00:00.000Z",
    );
    expect(c.attemptsBefore).toBeNull();
    expect(c.inactiveStudentsBefore).toBeNull();
    expect(c.auditLogBefore.toISOString()).toBe("2024-10-22T12:00:00.000Z");
  });

  test("auto-delete needs both the switch and a confirmation", () => {
    const onlySwitch = computeRetentionCutoffs(
      retention({ autoDeleteAttempts: true }),
      now,
    );
    expect(onlySwitch.attemptsBefore).toBeNull();
    expect(onlySwitch.inactiveStudentsBefore).toBeNull();

    const onlyConfirmed = computeRetentionCutoffs(
      retention({ confirmedAt: "2026-09-01T00:00:00.000Z" }),
      now,
    );
    expect(onlyConfirmed.attemptsBefore).toBeNull();

    const both = retention({
      autoDeleteAttempts: true,
      confirmedAt: "2026-09-01T00:00:00.000Z",
      attemptsMonths: 12,
      inactiveStudentMonths: 3,
    });
    expect(autoDeleteActive(both)).toBe(true);
    const c = computeRetentionCutoffs(both, now);
    expect(c.attemptsBefore?.toISOString()).toBe("2025-10-22T12:00:00.000Z");
    expect(c.inactiveStudentsBefore?.toISOString()).toBe(
      "2026-07-22T12:00:00.000Z",
    );
  });

  test("custom periods", () => {
    const c = computeRetentionCutoffs(
      retention({ attemptEventsDays: 30, auditLogMonths: 6 }),
      new Date("2026-08-31T00:00:00Z"),
    );
    expect(c.attemptEventsBefore.toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
    // 31 August − 6 months = 28 February.
    expect(c.auditLogBefore.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});

describe("report helpers", () => {
  test("empty report and total", () => {
    const start = new Date("2026-10-22T12:00:00Z");
    const r = emptyRetentionReport(true, start);
    expect(r.dryRun).toBe(true);
    expect(r.startedAt).toBe(start.toISOString());
    expect(retentionDeletedTotal(r)).toBe(0);
    expect(
      retentionDeletedTotal({
        ...r,
        sessions: 3,
        attempts: 2,
        answers: 10,
        attemptsReset: 99,
        skippedByHold: 5,
      }),
    ).toBe(15);
    expect(retentionDeletedTotal({ ...r, expiredHolds: 2 })).toBe(2);
    expect(retentionDeletedTotal(null)).toBe(0);
    // Reports stored before expiredHolds existed still add up.
    const { expiredHolds: _gone, ...legacy } = r;
    expect(retentionDeletedTotal({ ...legacy, sessions: 1 })).toBe(1);
  });

  test("every count has a Dutch label", () => {
    for (const key of RETENTION_COUNT_KEYS) {
      expect(RETENTION_COUNT_LABELS[key].length).toBeGreaterThan(3);
    }
  });

  test("formatting", () => {
    expect(formatMonths(1)).toBe("1 maand");
    expect(formatMonths(24)).toBe("24 maanden");
    expect(formatDays(1)).toBe("1 dag");
    expect(formatDays(90)).toBe("90 dagen");
  });
});

describe("autoDeleteState / autoDeleteNotice", () => {
  test("only confirmed + switched on counts as automatic deletion", () => {
    expect(autoDeleteState({ confirmed: true, autoDeleteAttempts: true })).toBe(
      "on",
    );
    expect(
      autoDeleteState({ confirmed: false, autoDeleteAttempts: true }),
    ).toBe("unconfirmed");
    expect(
      autoDeleteState({ confirmed: false, autoDeleteAttempts: false }),
    ).toBe("unconfirmed");
    expect(
      autoDeleteState({ confirmed: true, autoDeleteAttempts: false }),
    ).toBe("off");
  });

  test("the caveat matches the engine (confirmed with auto-delete off)", () => {
    expect(
      autoDeleteNotice({ confirmed: true, autoDeleteAttempts: true }),
    ).toBeNull();
    const unconfirmed = autoDeleteNotice({
      confirmed: false,
      autoDeleteAttempts: false,
    });
    expect(unconfirmed).toContain("nog definitief vast");
    const off = autoDeleteNotice({
      confirmed: true,
      autoDeleteAttempts: false,
    });
    expect(off).toContain("niet automatisch verwijderd");
    expect(off).not.toContain("nog definitief");
    // Agrees with the engine's own condition.
    const confirmedOff = retention({
      autoDeleteAttempts: false,
      confirmedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(autoDeleteActive(confirmedOff)).toBe(false);
  });
});
