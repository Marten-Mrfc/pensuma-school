import { describe, expect, test } from "bun:test";
import { ACCESS_CODE_REGEX } from "@/components/docent/assignments/defaults";
import {
  ACCESS_CODE_ALPHABET,
  computeAttemptDeadline,
  DEADLINE_GRACE_MS,
  dutchGrade,
  effectiveAssignmentStatus,
  generateAccessCode,
  isPastDeadline,
  parseAssignmentSettings,
  resultsVisible,
  totalExtraMinutes,
} from "./assignment-status";

const now = new Date("2026-10-22T10:00:00Z");
const min = (m: number) => new Date(now.getTime() + m * 60_000);

describe("effectiveAssignmentStatus", () => {
  test("a manual close wins over everything", () => {
    expect(
      effectiveAssignmentStatus(
        { status: "closed", opensAt: min(-10), closesAt: min(60) },
        now,
      ),
    ).toBe("closed");
  });

  test("a past closesAt closes an open or planned afname", () => {
    expect(
      effectiveAssignmentStatus(
        { status: "open", opensAt: min(-60), closesAt: min(-1) },
        now,
      ),
    ).toBe("closed");
    expect(
      effectiveAssignmentStatus(
        { status: "planned", opensAt: min(-60), closesAt: min(-1) },
        now,
      ),
    ).toBe("closed");
  });

  test("the closing moment itself counts as closed", () => {
    expect(
      effectiveAssignmentStatus(
        { status: "open", opensAt: null, closesAt: now },
        now,
      ),
    ).toBe("closed");
    expect(
      effectiveAssignmentStatus(
        {
          status: "open",
          opensAt: null,
          closesAt: new Date(now.getTime() + 1),
        },
        now,
      ),
    ).toBe("open");
  });

  test("planned opens by itself once opensAt is reached", () => {
    expect(
      effectiveAssignmentStatus(
        { status: "planned", opensAt: now, closesAt: null },
        now,
      ),
    ).toBe("open");
    expect(
      effectiveAssignmentStatus(
        { status: "planned", opensAt: min(5), closesAt: null },
        now,
      ),
    ).toBe("planned");
    expect(
      effectiveAssignmentStatus(
        { status: "planned", opensAt: null, closesAt: null },
        now,
      ),
    ).toBe("planned");
  });

  test("manually opened stays open without a window", () => {
    expect(
      effectiveAssignmentStatus(
        { status: "open", opensAt: null, closesAt: null },
        now,
      ),
    ).toBe("open");
  });
});

describe("computeAttemptDeadline", () => {
  test("time limit only", () => {
    expect(
      computeAttemptDeadline({ timeLimitMinutes: 50, closesAt: null }, now),
    ).toEqual(min(50));
  });

  test("closesAt only", () => {
    expect(
      computeAttemptDeadline(
        { timeLimitMinutes: null, closesAt: min(30) },
        now,
      ),
    ).toEqual(min(30));
  });

  test("both: the earlier one wins", () => {
    expect(
      computeAttemptDeadline({ timeLimitMinutes: 50, closesAt: min(30) }, now),
    ).toEqual(min(30));
    expect(
      computeAttemptDeadline({ timeLimitMinutes: 20, closesAt: min(30) }, now),
    ).toEqual(min(20));
  });

  test("extra minutes are added to both limits", () => {
    expect(
      computeAttemptDeadline({ timeLimitMinutes: 50, closesAt: null }, now, 13),
    ).toEqual(min(63));
    expect(
      computeAttemptDeadline(
        { timeLimitMinutes: null, closesAt: min(30) },
        now,
        10,
      ),
    ).toEqual(min(40));
  });

  test("closing at the end of the regular time keeps verlengde tijd", () => {
    // Started 50 minutes ago, closed now, 13 minutes of verlengde tijd.
    const startedAt = min(-50);
    expect(
      computeAttemptDeadline(
        { timeLimitMinutes: 50, closesAt: now },
        startedAt,
        13,
      ),
    ).toEqual(new Date(startedAt.getTime() + 63 * 60_000));
  });

  test("no limit and no closesAt → no deadline", () => {
    expect(
      computeAttemptDeadline({ timeLimitMinutes: null, closesAt: null }, now),
    ).toBeNull();
  });
});

describe("totalExtraMinutes", () => {
  test("manual extension plus accommodation", () => {
    expect(
      totalExtraMinutes({ extraMinutes: 5, accommodationMinutes: 13 }),
    ).toBe(18);
    expect(totalExtraMinutes({ extraMinutes: 5 })).toBe(5);
  });
});

describe("isPastDeadline", () => {
  test("30 seconds of grace", () => {
    expect(DEADLINE_GRACE_MS).toBe(30_000);
    expect(isPastDeadline(now, new Date(now.getTime() + 30_000))).toBe(false);
    expect(isPastDeadline(now, new Date(now.getTime() + 30_001))).toBe(true);
    expect(isPastDeadline(min(1), now)).toBe(false);
  });

  test("no deadline is never past", () => {
    expect(isPastDeadline(null, min(10_000))).toBe(false);
  });
});

describe("resultsVisible", () => {
  const base = {
    status: "open" as const,
    opensAt: min(-60),
    closesAt: null as Date | null,
    resultsReleased: false,
  };
  const withResults = (showResults: string) => ({ showResults });

  test.each([
    // showResults, effective closed, released, expected
    ["immediately", false, false, true],
    ["immediately", true, true, true],
    ["after_close", false, false, false],
    ["after_close", true, false, true],
    ["after_close", false, true, true],
    ["manual", true, false, false],
    ["manual", false, true, true],
    ["never", true, true, false],
  ] as const)("%s (closed: %p, released: %p) → %p", (show, closed, released, expected) => {
    expect(
      resultsVisible(
        {
          ...base,
          status: closed ? "closed" : "open",
          resultsReleased: released,
          settings: withResults(show),
        },
        now,
      ),
    ).toBe(expected);
  });

  test("a passed closesAt counts as closed for after_close", () => {
    expect(
      resultsVisible(
        {
          ...base,
          closesAt: min(-1),
          settings: withResults("after_close"),
        },
        now,
      ),
    ).toBe(true);
  });
});

describe("dutchGrade", () => {
  test("without settings: linear", () => {
    expect(dutchGrade(5, 10)).toBe(5.5);
    expect(dutchGrade(0, 10)).toBe(1);
    expect(dutchGrade(10, 10)).toBe(10);
    expect(dutchGrade(3, 0)).toBeNull();
  });

  test("old settings without a grading section parse as linear", () => {
    expect(dutchGrade(5, 10, {})).toBe(5.5);
    expect(dutchGrade(3, 20, { showResults: "immediately" })).toBe(2.4);
  });

  test("cesuur", () => {
    const settings = { grading: { method: "cesuur", passPercentage: 60 } };
    expect(dutchGrade(6, 10, settings)).toBe(5.5);
    expect(dutchGrade(3, 10, settings)).toBe(3.3);
    expect(dutchGrade(8, 10, settings)).toBe(7.8);
  });

  test("N-term", () => {
    const settings = { grading: { method: "nterm", nTerm: 2 } };
    expect(dutchGrade(5, 10, settings)).toBe(6.5);
    expect(dutchGrade(0, 10, settings)).toBe(1);
    expect(dutchGrade(10, 10, settings)).toBe(10);
  });

  test("settings parse with defaults", () => {
    expect(parseAssignmentSettings(null).grading).toEqual({
      method: "linear",
      passPercentage: 55,
      nTerm: 1,
    });
  });
});

describe("generateAccessCode", () => {
  test("uses only the unambiguous alphabet and matches ACCESS_CODE_REGEX", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateAccessCode();
      expect(code).toHaveLength(6);
      expect(ACCESS_CODE_REGEX.test(code)).toBe(true);
      for (const ch of code) expect(ACCESS_CODE_ALPHABET).toContain(ch);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  test("custom length", () => {
    expect(generateAccessCode(8)).toHaveLength(8);
  });
});
