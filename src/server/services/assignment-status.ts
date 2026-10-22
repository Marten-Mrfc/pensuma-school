/**
 * Pure helpers for assignment availability and attempt deadlines.
 * Shared by the teacher (assignments) and student (portal) routers.
 */
import type { AssignmentSettings } from "@/lib/questions/schema";
import { assignmentSettingsSchema } from "@/lib/questions/schema";

type AssignmentLike = {
  status: "planned" | "open" | "closed";
  opensAt: Date | null;
  closesAt: Date | null;
  timeLimitMinutes: number | null;
  settings: unknown;
};

/** Grace period for saves/submits that arrive just after the deadline. */
export const DEADLINE_GRACE_MS = 30_000;

/**
 * The status that actually applies right now:
 *  - "closed" if closed manually or closesAt has passed
 *  - "open" if opened manually, or planned with opensAt reached
 *  - otherwise "planned"
 */
export function effectiveAssignmentStatus(
  a: Pick<AssignmentLike, "status" | "opensAt" | "closesAt">,
  now = new Date(),
): "planned" | "open" | "closed" {
  if (a.status === "closed") return "closed";
  if (a.closesAt && a.closesAt <= now) return "closed";
  if (a.status === "open") return "open";
  if (a.opensAt && a.opensAt <= now) return "open";
  return "planned";
}

export function parseAssignmentSettings(settings: unknown): AssignmentSettings {
  return assignmentSettingsSchema.parse(settings ?? {});
}

/**
 * Deadline for an attempt: start + time limit + extra minutes, capped by the
 * assignment's closesAt. Null = no deadline.
 */
export function computeAttemptDeadline(
  a: Pick<AssignmentLike, "timeLimitMinutes" | "closesAt">,
  startedAt: Date,
  extraMinutes = 0,
): Date | null {
  const candidates: number[] = [];
  if (a.timeLimitMinutes != null) {
    candidates.push(startedAt.getTime() + (a.timeLimitMinutes + extraMinutes) * 60_000);
  }
  if (a.closesAt) candidates.push(a.closesAt.getTime() + extraMinutes * 60_000);
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

/** True when the deadline (plus grace) has passed. */
export function isPastDeadline(deadlineAt: Date | null, now = new Date(), graceMs = DEADLINE_GRACE_MS): boolean {
  return deadlineAt != null && now.getTime() > deadlineAt.getTime() + graceMs;
}

/** Whether a student may see their results for a submitted attempt. */
export function resultsVisible(
  a: Pick<AssignmentLike, "status" | "opensAt" | "closesAt" | "settings"> & { resultsReleased: boolean },
  now = new Date(),
): boolean {
  const { showResults } = parseAssignmentSettings(a.settings);
  switch (showResults) {
    case "immediately":
      return true;
    case "after_close":
      return effectiveAssignmentStatus(a, now) === "closed" || a.resultsReleased;
    case "manual":
      return a.resultsReleased;
    case "never":
      return false;
  }
}

/** Common Dutch grade: 1 + 9 × (score / max), rounded to one decimal. */
export function dutchGrade(score: number, maxScore: number): number | null {
  if (!maxScore) return null;
  const grade = 1 + 9 * Math.max(0, Math.min(1, score / maxScore));
  return Math.round(grade * 10) / 10;
}

/** Random access code without ambiguous characters (no 0/O, 1/I/L). */
export function generateAccessCode(length = 6): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
