import { describe, expect, test } from "bun:test";
import {
  formatDay,
  formatGrade,
  formatHintsUsed,
  formatMinutes,
  formatMoment,
  formatNumber,
  formatPercent,
  formatPoints,
  formatTime,
  formatTimeLeft,
  pluralize,
  toDate,
} from "./format";

describe("plural forms", () => {
  test("one vs many", () => {
    expect(pluralize(1, "vraag", "vragen")).toBe("1 vraag");
    expect(pluralize(2, "vraag", "vragen")).toBe("2 vragen");
    expect(pluralize(0, "vraag", "vragen")).toBe("0 vragen");
    expect(pluralize(1, "poging", "pogingen")).toBe("1 poging");
  });

  test("points", () => {
    expect(formatPoints(1)).toBe("1 punt");
    expect(formatPoints(2)).toBe("2 punten");
    expect(formatPoints(1.5)).toBe("1,5 punten");
    expect(formatPoints(null)).toBe("–");
  });

  test("hints used", () => {
    expect(formatHintsUsed(1, 0.5)).toBe("1 hint gebruikt (−0,5 pt)");
    expect(formatHintsUsed(2, 0)).toBe("2 hints gebruikt");
  });
});

describe("numbers use a decimal comma", () => {
  test("formatNumber", () => {
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(1.5)).toBe("1,5");
    expect(formatNumber(0.667)).toBe("0,67");
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(formatNumber(null)).toBe("–");
    expect(formatNumber(Number.NaN)).toBe("–");
  });

  test("grades always have one decimal", () => {
    expect(formatGrade(7)).toBe("7,0");
    expect(formatGrade(5.55)).toBe("5,6");
    expect(formatGrade(null)).toBe("–");
  });

  test("percentages", () => {
    expect(formatPercent(0.25)).toBe("25%");
    expect(formatPercent(0.125)).toBe("12,5%");
  });
});

describe("time formats", () => {
  test("minutes", () => {
    expect(formatMinutes(45)).toBe("45 minuten");
    expect(formatMinutes(60)).toBe("1 uur");
    expect(formatMinutes(90)).toBe("1 uur en 30 minuten");
    expect(formatMinutes(1)).toBe("1 minuut");
    expect(formatMinutes(61)).toBe("1 uur en 1 minuut");
    expect(formatMinutes(null)).toBe("Geen tijdslimiet");
  });

  test("time left", () => {
    const now = new Date("2026-10-22T10:00:00Z").getTime();
    const at = (ms: number) => new Date(now + ms);
    expect(formatTimeLeft(at(-1), now)).toBe("verlopen");
    expect(formatTimeLeft(at(40_000), now)).toBe("nog 1 minuut");
    expect(formatTimeLeft(at(12 * 60_000), now)).toBe("nog 12 minuten");
    expect(formatTimeLeft(at(60 * 60_000), now)).toBe("nog 1 uur");
    expect(formatTimeLeft(at(3 * 3600_000), now)).toBe("nog 3 uur");
    expect(formatTimeLeft(at(24 * 3600_000), now)).toBe("nog 1 dag");
    expect(formatTimeLeft(at(50 * 3600_000), now)).toBe("nog 2 dagen");
    expect(formatTimeLeft(null, now)).toBe("");
  });

  test("clock time and relative days", () => {
    const today = new Date();
    today.setHours(14, 30, 0, 0);
    expect(formatTime(today)).toBe("14:30");
    expect(formatMoment(today)).toBe("vandaag 14:30");
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    expect(formatMoment(tomorrow)).toBe("morgen 09:00");
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    expect(formatMoment(yesterday)).toBe("gisteren 14:30");
  });

  test("other days show the weekday and date", () => {
    const d = new Date(2026, 9, 2, 15, 30);
    expect(formatMoment(d)).toMatch(/^vr 2 okt\.? 15:30$/);
    expect(formatDay(d)).toMatch(/^vr 2 okt\.?$/);
  });

  test("toDate accepts dates and ISO strings", () => {
    expect(toDate("2026-10-22T10:00:00Z")?.toISOString()).toBe(
      "2026-10-22T10:00:00.000Z",
    );
    expect(toDate("geen datum")).toBeNull();
    expect(toDate(null)).toBeNull();
  });
});
