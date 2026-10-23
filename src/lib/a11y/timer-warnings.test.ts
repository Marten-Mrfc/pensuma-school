import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MAX_TIMEOUT_MS,
  TIME_WARNING_TOASTS,
  TIMER_THRESHOLDS_MIN,
  timerThresholdsText,
  upcomingTimeWarnings,
} from "./timer-announcements";

const MIN = 60_000;

describe("time warnings: one list for the timer, the toasts and the copy", () => {
  test("every announced threshold also has a visible warning", () => {
    expect(Object.keys(TIME_WARNING_TOASTS).map(Number).sort()).toEqual(
      [...TIMER_THRESHOLDS_MIN].sort(),
    );
    expect(TIME_WARNING_TOASTS[10]).toBe("Nog 10 minuten.");
    expect(TIME_WARNING_TOASTS[1]).toMatch(/^Nog 1 minuut\./);
  });

  test("Dutch list of the thresholds", () => {
    expect(timerThresholdsText()).toBe("10, 5 en 1 minuut");
    expect(timerThresholdsText([5, 1])).toBe("5 en 1 minuut");
    expect(timerThresholdsText([10])).toBe("10 minuten");
    expect(timerThresholdsText([15, 10, 5])).toBe("15, 10 en 5 minuten");
    expect(timerThresholdsText([])).toBe("");
  });

  test("the display preferences promise exactly these thresholds", () => {
    // "Timer tonen tijdens toetsen": the help text comes from the shared
    // list, not a hand-written "10, 5 en 1".
    const source = readFileSync(
      path.join(
        import.meta.dir,
        "../../components/preferences/display-preferences-dialog.tsx",
      ),
      "utf8",
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: source text
    const helpText = "melding bij ${timerThresholdsText()}.";
    expect(source).toContain(helpText);
    expect(source).not.toMatch(/melding bij \d/);
  });

  test("the exam shows a visible warning at 10, 5 and 1 minute (V01)", () => {
    // 12 minutes left: all three are still ahead, in order.
    expect(upcomingTimeWarnings(12 * MIN)).toEqual([
      { inMs: 2 * MIN, text: TIME_WARNING_TOASTS[10] },
      { inMs: 7 * MIN, text: TIME_WARNING_TOASTS[5] },
      { inMs: 11 * MIN, text: TIME_WARNING_TOASTS[1] },
    ]);
    // 7 minutes left (e.g. after a reload): the ten-minute one has passed.
    expect(upcomingTimeWarnings(7 * MIN).map((w) => w.text)).toEqual([
      TIME_WARNING_TOASTS[5],
      TIME_WARNING_TOASTS[1],
    ]);
    // Exactly at a threshold, or past all of them: nothing old is shown.
    expect(upcomingTimeWarnings(MIN)).toEqual([]);
    expect(upcomingTimeWarnings(-5000)).toEqual([]);
  });

  test("a practice afname open for a month shows no warning at once", () => {
    // setTimeout fires at once for a delay above MAX_TIMEOUT_MS (~24.8
    // days): such far-away warnings are not scheduled at all.
    const DAY = 24 * 60 * MIN;
    expect(upcomingTimeWarnings(30 * DAY)).toEqual([]);
    for (const { inMs } of upcomingTimeWarnings(24 * DAY))
      expect(inMs).toBeLessThanOrEqual(MAX_TIMEOUT_MS);
    expect(upcomingTimeWarnings(24 * DAY)).toHaveLength(3);
    // Around the limit: only the warnings within reach (the one-minute
    // warning is the furthest away).
    expect(
      upcomingTimeWarnings(MAX_TIMEOUT_MS + 5 * MIN).map((w) => w.text),
    ).toEqual([TIME_WARNING_TOASTS[10], TIME_WARNING_TOASTS[5]]);
  });

  test("the exam schedules its warnings from the shared list", () => {
    const source = readFileSync(
      path.join(
        import.meta.dir,
        "../../components/leerling/exam/exam-runner.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("upcomingTimeWarnings(remaining)");
    // No hand-written subset ("Nog 5 minuten", "Nog 1 minuut") any more.
    for (const text of Object.values(TIME_WARNING_TOASTS))
      expect(source).not.toContain(text);
  });
});
