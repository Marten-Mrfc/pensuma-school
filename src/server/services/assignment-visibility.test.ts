import { describe, expect, test } from "bun:test";
import {
  anyoneStillWorking,
  DEADLINE_GRACE_MS,
  resultsVisible,
} from "./assignment-status";
import {
  isTargetedSettings,
  TARGETED_SETTINGS_KEY,
  withTargetingFlag,
} from "./assignment-targets";

const now = new Date("2026-10-22T10:00:00Z");
const min = (m: number) => new Date(now.getTime() + m * 60_000);

const closed = {
  status: "closed" as const,
  opensAt: min(-90),
  closesAt: min(-10),
};
const open = { status: "open" as const, opensAt: min(-90), closesAt: null };

describe("anyoneStillWorking", () => {
  test("a personal deadline in the future (verlengde tijd) counts", () => {
    expect(anyoneStillWorking([{ deadlineAt: min(20) }], closed, now)).toBe(
      true,
    );
  });

  test("within the grace period still counts, after it no longer", () => {
    const justPast = new Date(now.getTime() - DEADLINE_GRACE_MS / 2);
    expect(anyoneStillWorking([{ deadlineAt: justPast }], closed, now)).toBe(
      true,
    );
    expect(anyoneStillWorking([{ deadlineAt: min(-5) }], closed, now)).toBe(
      false,
    );
  });

  test("no deadline: working while the afname is open, over once closed", () => {
    expect(anyoneStillWorking([{ deadlineAt: null }], open, now)).toBe(true);
    expect(anyoneStillWorking([{ deadlineAt: null }], closed, now)).toBe(false);
  });

  test("nobody running", () => {
    expect(anyoneStillWorking([], open, now)).toBe(false);
  });
});

describe("resultsVisible with classmates still working", () => {
  const base = { ...closed, resultsReleased: false };
  const settings = (showResults: string) => ({ showResults });

  test("after_close waits for verlengde tijd", () => {
    const a = { ...base, settings: settings("after_close") };
    expect(resultsVisible(a, now, true)).toBe(false);
    expect(resultsVisible(a, now, false)).toBe(true);
    expect(resultsVisible(a, now)).toBe(true);
  });

  test("an explicit release wins", () => {
    const a = {
      ...base,
      resultsReleased: true,
      settings: settings("after_close"),
    };
    expect(resultsVisible(a, now, true)).toBe(true);
  });

  test("other modes ignore it", () => {
    expect(
      resultsVisible({ ...base, settings: settings("immediately") }, now, true),
    ).toBe(true);
    expect(
      resultsVisible(
        { ...base, resultsReleased: true, settings: settings("manual") },
        now,
        true,
      ),
    ).toBe(true);
    expect(
      resultsVisible({ ...base, settings: settings("never") }, now, false),
    ).toBe(false);
  });
});

describe("targeting flag in the settings", () => {
  test("set, keep and clear", () => {
    const settings = { showResults: "after_close", maxAttempts: 1 };
    const flagged = withTargetingFlag(settings, true);
    expect(isTargetedSettings(flagged)).toBe(true);
    expect(flagged).toMatchObject(settings);
    const cleared = withTargetingFlag(flagged, false);
    expect(isTargetedSettings(cleared)).toBe(false);
    expect(TARGETED_SETTINGS_KEY in cleared).toBe(false);
    expect(cleared).toEqual(settings);
  });

  test("only a real true counts", () => {
    expect(isTargetedSettings(null)).toBe(false);
    expect(isTargetedSettings({})).toBe(false);
    expect(isTargetedSettings({ [TARGETED_SETTINGS_KEY]: "true" })).toBe(false);
  });
});
