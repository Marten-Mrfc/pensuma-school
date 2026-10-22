import { describe, expect, test } from "bun:test";
import {
  accommodationMinutes,
  EXTRA_TIME_PRESETS,
  formatExtraTime,
} from "./accommodations";

const start = new Date("2026-10-22T09:00:00Z");
const at = (time: string) => new Date(`2026-10-22T${time}:00Z`);

describe("accommodationMinutes", () => {
  test("percentage of the time limit, rounded up", () => {
    const a = { timeLimitMinutes: 50, opensAt: null, closesAt: null };
    expect(accommodationMinutes(a, start, 25)).toBe(13);
    expect(accommodationMinutes(a, start, 20)).toBe(10);
    expect(accommodationMinutes(a, start, 33)).toBe(17);
    expect(accommodationMinutes(a, start, 50)).toBe(25);
  });

  test("the time limit wins over the window", () => {
    const a = {
      timeLimitMinutes: 40,
      opensAt: at("08:00"),
      closesAt: at("12:00"),
    };
    expect(accommodationMinutes(a, start, 25)).toBe(10);
  });

  test("without a time limit: from the start until closesAt", () => {
    const a = {
      timeLimitMinutes: null,
      opensAt: at("08:30"),
      closesAt: at("10:00"),
    };
    // 09:00 → 10:00 = 60 minutes
    expect(accommodationMinutes(a, start, 25)).toBe(15);
  });

  test("a later opensAt counts from opensAt", () => {
    const a = {
      timeLimitMinutes: null,
      opensAt: at("09:30"),
      closesAt: at("10:00"),
    };
    expect(accommodationMinutes(a, start, 50)).toBe(15);
  });

  test("no limit and no closesAt gives 0", () => {
    const a = { timeLimitMinutes: null, opensAt: null, closesAt: null };
    expect(accommodationMinutes(a, start, 50)).toBe(0);
  });

  test("zero, negative or invalid percentages give 0", () => {
    const a = { timeLimitMinutes: 50, opensAt: null, closesAt: null };
    expect(accommodationMinutes(a, start, 0)).toBe(0);
    expect(accommodationMinutes(a, start, -10)).toBe(0);
    expect(accommodationMinutes(a, start, Number.NaN)).toBe(0);
  });

  test("closesAt in the past gives 0", () => {
    const a = { timeLimitMinutes: null, opensAt: null, closesAt: at("08:00") };
    expect(accommodationMinutes(a, start, 50)).toBe(0);
  });

  test("capped at 600 minutes", () => {
    const a = { timeLimitMinutes: 2000, opensAt: null, closesAt: null };
    expect(accommodationMinutes(a, start, 50)).toBe(600);
  });
});

test("presets and label", () => {
  expect(EXTRA_TIME_PRESETS).toEqual([10, 20, 25, 33, 50]);
  expect(formatExtraTime(25)).toBe("+25% tijd");
});
