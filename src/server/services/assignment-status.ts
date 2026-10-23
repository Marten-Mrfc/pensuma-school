/**
 * Pure helpers for assignment availability and attempt deadlines.
 * Shared by the teacher (assignments) and student (portal) routers.
 */
import { computeGrade } from "@/lib/grading/grade-scale";
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
    candidates.push(
      startedAt.getTime() + (a.timeLimitMinutes + extraMinutes) * 60_000,
    );
  }
  if (a.closesAt) candidates.push(a.closesAt.getTime() + extraMinutes * 60_000);
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

/**
 * Extra minutes that count for an attempt's deadline: the teacher's manual
 * extension plus the verlengde tijd (accommodation) snapshotted at start.
 */
export function totalExtraMinutes(attempt: {
  extraMinutes: number;
  accommodationMinutes?: number | null;
}): number {
  return attempt.extraMinutes + (attempt.accommodationMinutes ?? 0);
}

/** True when the deadline (plus grace) has passed. */
export function isPastDeadline(
  deadlineAt: Date | null,
  now = new Date(),
  graceMs = DEADLINE_GRACE_MS,
): boolean {
  return deadlineAt != null && now.getTime() > deadlineAt.getTime() + graceMs;
}

/**
 * Whether anybody can still work on an afname, from its in-progress
 * attempts: a personal deadline (plus grace) that has not passed yet
 * (verlengde tijd keeps going after the close), or an attempt without a
 * deadline while the afname is still open. An attempt whose deadline has
 * passed but that was not auto-submitted yet never holds anything back.
 */
export function anyoneStillWorking(
  running: readonly { deadlineAt: Date | null }[],
  a: Pick<AssignmentLike, "status" | "opensAt" | "closesAt">,
  now = new Date(),
  graceMs = DEADLINE_GRACE_MS,
): boolean {
  const open = effectiveAssignmentStatus(a, now) !== "closed";
  return running.some((r) =>
    r.deadlineAt ? !isPastDeadline(r.deadlineAt, now, graceMs) : open,
  );
}

/**
 * Whether a student may see their results for a submitted attempt.
 *
 * `othersWorking` (see `anyoneStillWorking`): for "after_close" the results
 * (score, questions, right answers) stay hidden while classmates with
 * verlengde tijd are still taking the closed afname, unless the teacher
 * released them explicitly.
 */
export function resultsVisible(
  a: Pick<AssignmentLike, "status" | "opensAt" | "closesAt" | "settings"> & {
    resultsReleased: boolean;
  },
  now = new Date(),
  othersWorking = false,
): boolean {
  const { showResults } = parseAssignmentSettings(a.settings);
  switch (showResults) {
    case "immediately":
      return true;
    case "after_close":
      return (
        a.resultsReleased ||
        (effectiveAssignmentStatus(a, now) === "closed" && !othersWorking)
      );
    case "manual":
      return a.resultsReleased;
    case "never":
      return false;
  }
}

/**
 * Dutch grade (1,0 – 10,0) for a score, rounded to one decimal.
 * `settings` is the assignment's raw settings jsonb: its `grading` scale
 * (linear, cesuur or N-term) applies. Omitted → linear: 1 + 9 × score/max.
 */
export function dutchGrade(
  score: number,
  maxScore: number,
  settings?: unknown,
): number | null {
  return computeGrade(
    score,
    maxScore,
    settings === undefined
      ? undefined
      : parseAssignmentSettings(settings).grading,
  );
}

/** Characters used in generated access codes (no 0/O, 1/I/L). */
export const ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Random access code without ambiguous characters (no 0/O, 1/I/L). */
export function generateAccessCode(length = 6): string {
  const alphabet = ACCESS_CODE_ALPHABET;
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
