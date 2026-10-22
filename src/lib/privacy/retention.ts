/**
 * Retention (bewaartermijnen) types shared by the schema, the retention
 * engine and the UI. Pure module; the engine itself lives in
 * src/server/privacy/.
 */

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
  skippedByHold: number;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
}
