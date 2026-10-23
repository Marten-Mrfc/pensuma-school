/**
 * Retention (bewaartermijnen) types and pure helpers shared by the schema,
 * the retention engine and the UI. The engine itself lives in
 * src/server/privacy/retention-core.ts.
 */
import type { PrivacySettings } from "./settings";

/** Why data is excluded from automatic deletion. */
export type RetentionHoldKind = "dispute" | "exam_dossier" | "restriction";

export const HOLD_KIND_LABELS: Record<RetentionHoldKind, string> = {
  dispute: "Bezwaar of beroep",
  exam_dossier: "Examendossier",
  restriction: "Verwerking beperkt (AVG art. 18)",
};

/** Counts of rows deleted (or that would be deleted in a dry run). */
export interface RetentionReport {
  sessions: number;
  verification: number;
  rateLimit: number;
  loginThrottle: number;
  attemptEvents: number;
  attemptsReset: number;
  attempts: number;
  answers: number;
  inactiveStudents: number;
  auditLog: number;
  retentionRuns: number;
  /**
   * Retention holds (with their reason) whose end date passed more than
   * EXPIRED_HOLD_GRACE_DAYS ago. Reports stored before this step existed
   * lack it (read them as Partial, like retentionDeletedTotal does).
   */
  expiredHolds: number;
  skippedByHold: number;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
}

/** The numeric fields of a report, in display order. */
export const RETENTION_COUNT_KEYS = [
  "sessions",
  "verification",
  "rateLimit",
  "loginThrottle",
  "attemptEvents",
  "attemptsReset",
  "attempts",
  "answers",
  "inactiveStudents",
  "auditLog",
  "retentionRuns",
  "expiredHolds",
  "skippedByHold",
] as const satisfies readonly (keyof RetentionReport)[];

export type RetentionCountKey = (typeof RETENTION_COUNT_KEYS)[number];

/** Dutch labels for the report counts (preview, CLI, overview). */
export const RETENTION_COUNT_LABELS: Record<RetentionCountKey, string> = {
  sessions: "Verlopen sessies",
  verification: "Verlopen verificatiecodes",
  rateLimit: "Tellers voor afremmen",
  loginThrottle: "Tellers van mislukte inlogpogingen",
  attemptEvents: "Logboekregels van toetsen",
  attemptsReset: "Pogingen waarvan het logboek is gewist",
  attempts: "Pogingen",
  answers: "Antwoorden (bij die pogingen)",
  inactiveStudents: "Leerlingaccounts zonder actieve klas",
  auditLog: "Regels uit het logboek van docenthandelingen",
  retentionRuns: "Oude opschoonrapporten",
  expiredHolds: "Verlopen bewaarblokkades",
  skippedByHold: "Overgeslagen vanwege een bewaarblokkade",
};

/**
 * Counts that are rows actually deleted (the "{n} regels verwijderd" total).
 * attemptsReset (an update) and skippedByHold are not deletions; answers are
 * included because they cascade from deleted attempts.
 */
const DELETED_KEYS: readonly RetentionCountKey[] = [
  "sessions",
  "verification",
  "rateLimit",
  "loginThrottle",
  "attemptEvents",
  "attempts",
  "answers",
  "inactiveStudents",
  "auditLog",
  "retentionRuns",
  "expiredHolds",
];

/** Total number of rows deleted by a run (0 for a missing report). */
export function retentionDeletedTotal(
  report: Partial<RetentionReport> | null | undefined,
): number {
  if (!report) return 0;
  let total = 0;
  for (const key of DELETED_KEYS) {
    const value = report[key];
    if (typeof value === "number" && Number.isFinite(value)) total += value;
  }
  return total;
}

/** A report with every count at zero. */
export function emptyRetentionReport(
  dryRun: boolean,
  startedAt: Date,
): RetentionReport {
  const iso = startedAt.toISOString();
  return {
    sessions: 0,
    verification: 0,
    rateLimit: 0,
    loginThrottle: 0,
    attemptEvents: 0,
    attemptsReset: 0,
    attempts: 0,
    answers: 0,
    inactiveStudents: 0,
    auditLog: 0,
    retentionRuns: 0,
    expiredHolds: 0,
    skippedByHold: 0,
    dryRun,
    startedAt: iso,
    finishedAt: iso,
  };
}

/* --------------------------------- Cutoffs -------------------------------- */

export type RetentionSettings = PrivacySettings["retention"];

/** Rows older than these moments are deleted (strictly before). */
export interface RetentionCutoffs {
  /** session.expires_at < this. */
  sessionsBefore: Date;
  /** verification.expires_at < this. */
  verificationBefore: Date;
  /** rate_limit.last_request (epoch ms, bigint) < this. */
  rateLimitBeforeMs: number;
  /** login_throttle.updated_at < this (and the lock has expired). */
  loginThrottleBefore: Date;
  /** End of the attempt (submitted_at, else updated_at) < this. */
  attemptEventsBefore: Date;
  /** Null unless the school confirmed the periods and enabled auto-delete. */
  attemptsBefore: Date | null;
  /** Null unless the school confirmed the periods and enabled auto-delete. */
  inactiveStudentsBefore: Date | null;
  /** audit_log.created_at and retention_run.started_at < this. */
  auditLogBefore: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `date` minus whole days (exact 24-hour days). */
export function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * DAY_MS);
}

/**
 * `date` minus calendar months in UTC, clamped to the last day of the
 * target month: 31 March − 1 month = 28 (or 29) February. The time of day
 * is kept.
 */
export function subtractMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/** Whether attempts and inactive accounts may be deleted automatically. */
export function autoDeleteActive(retention: RetentionSettings): boolean {
  return retention.autoDeleteAttempts && retention.confirmedAt != null;
}

/**
 * A retention hold with an end date stays visible (as "Verlopen") for this
 * many days after that date; then the retention engine deletes it, reason
 * and all.
 */
export const EXPIRED_HOLD_GRACE_DAYS = 30;

/**
 * Automatic deletion of attempts and inactive accounts, as the public
 * privacy info describes it (the engine's own condition, see
 * autoDeleteActive):
 *  - "on": the school confirmed the periods and auto-delete is on;
 *  - "unconfirmed": the periods are not confirmed yet (nothing is deleted
 *    automatically, whatever the switch says);
 *  - "off": the periods are confirmed with auto-delete switched off.
 */
export type AutoDeleteState = "on" | "unconfirmed" | "off";

export function autoDeleteState(retention: {
  confirmed: boolean;
  autoDeleteAttempts: boolean;
}): AutoDeleteState {
  if (!retention.confirmed) return "unconfirmed";
  return retention.autoDeleteAttempts ? "on" : "off";
}

/**
 * The caveat shown under the retention periods (on /privacy and on Mijn
 * gegevens) whenever attempts and old accounts are not deleted
 * automatically; null when they are.
 */
export function autoDeleteNotice(retention: {
  confirmed: boolean;
  autoDeleteAttempts: boolean;
}): string | null {
  switch (autoDeleteState(retention)) {
    case "on":
      return null;
    case "unconfirmed":
      return "Je school stelt deze bewaartermijnen nog definitief vast. Tot die tijd worden pogingen, antwoorden en oude accounts niet automatisch verwijderd.";
    case "off":
      return "Pogingen, antwoorden en oude accounts worden niet automatisch verwijderd. Je school verwijdert ze zelf, bijvoorbeeld bij het afsluiten van het schooljaar.";
  }
}

/** The moments before which each kind of data is deleted. */
export function computeRetentionCutoffs(
  retention: RetentionSettings,
  now: Date,
): RetentionCutoffs {
  const auto = autoDeleteActive(retention);
  return {
    sessionsBefore: now,
    verificationBefore: now,
    rateLimitBeforeMs: now.getTime() - DAY_MS,
    loginThrottleBefore: subtractDays(now, 1),
    attemptEventsBefore: subtractDays(now, retention.attemptEventsDays),
    attemptsBefore: auto
      ? subtractMonthsUtc(now, retention.attemptsMonths)
      : null,
    inactiveStudentsBefore: auto
      ? subtractMonthsUtc(now, retention.inactiveStudentMonths)
      : null,
    auditLogBefore: subtractMonthsUtc(now, retention.auditLogMonths),
  };
}

/** "1 maand" / "24 maanden", "1 dag" / "90 dagen". */
export function formatMonths(months: number): string {
  return `${months} ${months === 1 ? "maand" : "maanden"}`;
}

export function formatDays(days: number): string {
  return `${days} ${days === 1 ? "dag" : "dagen"}`;
}
