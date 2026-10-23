import { describe, expect, test } from "bun:test";
import {
  formatGrade,
  formatMinutes,
  formatMoment,
  formatNumber,
  formatPercent,
  formatRemaining,
  formatWindow,
  fromDateTimeLocal,
  pluralize,
  toDateTimeLocal,
} from "./format";

describe("formatMinutes", () => {
  test("minutes and hours", () => {
    expect(formatMinutes(null)).toBe("Geen limiet");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 uur");
    expect(formatMinutes(90)).toBe("1 u 30 min");
  });
});

describe("formatRemaining", () => {
  test("countdown text", () => {
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(-5_000)).toBe("0:00");
    expect(formatRemaining(65_000)).toBe("1:05");
    expect(formatRemaining(12 * 60_000 + 5_000)).toBe("12:05");
    expect(formatRemaining(3_729_000)).toBe("1:02:09");
  });
});

describe("numbers", () => {
  test("decimal comma", () => {
    expect(formatNumber(7.5)).toBe("7,5");
    expect(formatNumber(3)).toBe("3");
    expect(formatNumber(2.345)).toBe("2,35");
    expect(formatNumber(null)).toBe("–");
    expect(formatNumber(Number.NaN)).toBe("–");
  });

  test("grades with one decimal", () => {
    expect(formatGrade(7)).toBe("7,0");
    expect(formatGrade(5.5)).toBe("5,5");
    expect(formatGrade(undefined)).toBe("–");
  });

  test("percentages", () => {
    expect(formatPercent(0.756)).toBe("76%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(null)).toBe("–");
  });
});

describe("dates", () => {
  test("datetime-local round trip in local time", () => {
    const d = new Date(2026, 9, 22, 9, 5);
    expect(toDateTimeLocal(d)).toBe("2026-10-22T09:05");
    expect(fromDateTimeLocal("2026-10-22T09:05")?.getTime()).toBe(d.getTime());
    expect(toDateTimeLocal(null)).toBe("");
    expect(fromDateTimeLocal("")).toBeNull();
    expect(fromDateTimeLocal("geen datum")).toBeNull();
  });

  test("relative day names", () => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(14, 5, 0, 0);
    expect(formatMoment(today)).toBe("vandaag 14:05");
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    expect(formatMoment(tomorrow)).toBe("morgen 14:05");
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    expect(formatMoment(yesterday)).toBe("gisteren 14:05");
    expect(formatMoment(null)).toBe("");
  });

  test("windows", () => {
    expect(formatWindow(null, null)).toBe("Geen vast tijdvak");
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(10, 0, 0, 0);
    expect(formatWindow(start, end)).toBe("vandaag 09:00 – 10:00");
    expect(formatWindow(start, null)).toBe("Vanaf vandaag 09:00");
    expect(formatWindow(null, end)).toBe("Tot vandaag 10:00");
  });
});

describe("text helpers", () => {
  test("pluralize", () => {
    expect(pluralize(1, "leerling", "leerlingen")).toBe("1 leerling");
    expect(pluralize(3, "leerling", "leerlingen")).toBe("3 leerlingen");
  });
});
