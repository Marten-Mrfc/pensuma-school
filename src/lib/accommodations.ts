/**
 * Verlengde tijd (extra time) for students with a faciliteitenpas.
 * Pure module: the percentage comes from `student_accommodation`, the
 * resulting minutes are snapshotted on the attempt when it starts.
 */

/** Common extra-time percentages offered in the UI. */
export const EXTRA_TIME_PRESETS = [10, 20, 25, 33, 50] as const;

/** Upper bound for extra time on one attempt (10 hours). */
const MAX_ACCOMMODATION_MINUTES = 600;

export type AccommodationAssignment = {
  timeLimitMinutes: number | null;
  opensAt: Date | null;
  closesAt: Date | null;
};

/**
 * Extra minutes for one attempt: `percent` % of the base time, rounded up.
 * The base time is the time limit or, without one, the time from the start
 * (or opensAt, if later) until closesAt. No limit and no closesAt → 0.
 * Example: 50 minutes at 25% → 13 minutes.
 */
export function accommodationMinutes(
  assignment: AccommodationAssignment,
  startedAt: Date,
  percent: number,
): number {
  if (!(percent > 0)) return 0;
  let base = 0;
  if (assignment.timeLimitMinutes != null) {
    base = assignment.timeLimitMinutes;
  } else if (assignment.closesAt) {
    const from = Math.max(
      (assignment.opensAt ?? startedAt).getTime(),
      startedAt.getTime(),
    );
    base = (assignment.closesAt.getTime() - from) / 60_000;
  }
  if (!(base > 0)) return 0;
  return Math.min(MAX_ACCOMMODATION_MINUTES, Math.ceil((base * percent) / 100));
}

/** "+25% tijd" */
export function formatExtraTime(pct: number): string {
  return `+${pct}% tijd`;
}
