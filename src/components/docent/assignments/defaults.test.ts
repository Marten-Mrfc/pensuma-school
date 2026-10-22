import { describe, expect, test } from "bun:test";
import { assignmentSettingsSchema } from "@/lib/questions/schema";
import {
  ACCESS_CODE_REGEX,
  ASSIGNMENT_MODE_LABELS,
  defaultAccessCodeForMode,
  defaultSettingsForMode,
  normalizeAccessCode,
} from "./defaults";

describe("defaultSettingsForMode", () => {
  test("exam: one attempt, results after closing, no help", () => {
    const s = defaultSettingsForMode("exam");
    expect(s.maxAttempts).toBe(1);
    expect(s.showResults).toBe("after_close");
    expect(s.logFocusEvents).toBe(true);
    expect(s.allowHints).toBe(false);
    expect(s.codeTips).toBe(false);
    expect(s.showSolutions).toBe("never");
  });

  test("practice: privacy by default and help on", () => {
    const s = defaultSettingsForMode("practice");
    expect(s.maxAttempts).toBe(5);
    expect(s.showResults).toBe("immediately");
    expect(s.logFocusEvents).toBe(false);
    expect(s.requireFullscreen).toBe(false);
    expect(s.blockPaste).toBe(false);
    expect(s.allowHints).toBe(true);
    expect(s.codeTips).toBe(true);
    expect(s.showSolutions).toBe("after_attempts");
  });

  test("both are complete, valid settings with a linear scale", () => {
    for (const mode of ["exam", "practice"] as const) {
      const s = defaultSettingsForMode(mode);
      expect(assignmentSettingsSchema.parse(s)).toEqual(s);
      expect(s.grading).toEqual({
        method: "linear",
        passPercentage: 55,
        nTerm: 1,
      });
    }
  });

  test("returns a fresh object every time", () => {
    const a = defaultSettingsForMode("exam");
    a.maxAttempts = 9;
    expect(defaultSettingsForMode("exam").maxAttempts).toBe(1);
  });
});

describe("access codes", () => {
  test("exams get a code by default", () => {
    expect(defaultAccessCodeForMode("exam")).toBe(true);
    expect(defaultAccessCodeForMode("practice")).toBe(false);
  });

  test("normalise and validate", () => {
    expect(normalizeAccessCode("  py thon-3 ")).toBe("PYTHON-3");
    expect(ACCESS_CODE_REGEX.test("PYTHON-3")).toBe(true);
    expect(ACCESS_CODE_REGEX.test("AB")).toBe(false);
    expect(ACCESS_CODE_REGEX.test("A".repeat(21))).toBe(false);
    expect(ACCESS_CODE_REGEX.test("ABC!")).toBe(false);
  });

  test("Dutch labels", () => {
    expect(ASSIGNMENT_MODE_LABELS).toEqual({
      exam: "Toets",
      practice: "Oefenen",
    });
  });
});
