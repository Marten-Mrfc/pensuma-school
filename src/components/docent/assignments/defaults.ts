/**
 * Default settings per assignment mode. Pure module (no React, no server
 * imports): shared by the assignment router and the "Afname plannen" form.
 */
import {
  type AssignmentSettings,
  assignmentSettingsSchema,
} from "@/lib/questions/schema";

export type AssignmentMode = "exam" | "practice";

export const ASSIGNMENT_MODE_LABELS: Record<AssignmentMode, string> = {
  exam: "Toets",
  practice: "Oefenen",
};

const MODE_OVERRIDES: Record<AssignmentMode, Partial<AssignmentSettings>> = {
  exam: {
    showResults: "after_close",
    logFocusEvents: true,
    maxAttempts: 1,
    allowHints: false,
    showSolutions: "never",
    codeTips: false,
  },
  practice: {
    showResults: "immediately",
    logFocusEvents: false,
    requireFullscreen: false,
    blockPaste: false,
    maxAttempts: 5,
    allowHints: true,
    showSolutions: "after_attempts",
    codeTips: true,
  },
};

/** Full settings object with the sensible defaults for a mode. */
export function defaultSettingsForMode(
  mode: AssignmentMode,
): AssignmentSettings {
  return assignmentSettingsSchema.parse(MODE_OVERRIDES[mode]);
}

/** Exams get an access code by default; practice assignments don't. */
export function defaultAccessCodeForMode(mode: AssignmentMode): boolean {
  return mode === "exam";
}

/** Access codes: 3–20 letters/digits/dashes, stored in upper case. */
export const ACCESS_CODE_REGEX = /^[A-Z0-9-]{3,20}$/;

export function normalizeAccessCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
