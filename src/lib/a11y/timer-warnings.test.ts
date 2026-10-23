import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TIME_WARNING_TOASTS,
  TIMER_THRESHOLDS_MIN,
  timerThresholdsText,
} from "./timer-announcements";

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
});
