/**
 * Rate-limit rules per tRPC procedure (capacity / refill per second).
 * Calibrated against the client: answer autosave every 1.5–10 s, activity
 * log every 5 s, heartbeat every 30 s. Pure module.
 */
import type { BucketRule } from "./rate-limit";

const rule = (capacity: number, refillPerSec: number): BucketRule => ({
  capacity,
  refillPerSec,
});

/** Per user (or per IP when anonymous), for every procedure not listed. */
export const DEFAULT_RATE_RULE: BucketRule = rule(120, 5);

export const RATE_RULES: Readonly<Record<string, BucketRule>> = {
  // Student portal (exam screen).
  "portal.saveAnswer": rule(30, 1),
  "portal.logEvents": rule(12, 0.5),
  "portal.heartbeat": rule(6, 0.1),
  "portal.startAttempt": rule(5, 1 / 30),
  "portal.submitAttempt": rule(5, 1 / 30),
  "portal.getResult": rule(30, 0.5),

  // Server-side Python (sandbox CPU).
  "code.run": rule(20, 0.25),
  "code.grade": rule(10, 1 / 6),
  "code.generateExpected": rule(10, 1 / 6),
  "question.checkSolution": rule(10, 1 / 6),
  "review.regradeAttempt": rule(10, 1 / 6),
  "review.regradeAssignment": rule(3, 1 / 60),

  // Bulk account work (scrypt hashing) and exports.
  "student.import": rule(3, 1 / 60),
  "student.resetPins": rule(5, 1 / 30),
  "student.getPins": rule(20, 1 / 6),
  "review.exportCsv": rule(20, 1 / 6),
  "test.importJson": rule(5, 1 / 30),

  // First-run setup (keyed by IP).
  "setup.createFirstAdmin": rule(5, 1 / 60),
  // Anonymous, on the login page: a whole school signs in from one NAT
  // address at the start of a lesson. Two cheap queries.
  "setup.status": rule(600, 20),
  // Verifies the current password: no fast guessing with a stolen session.
  "staff.changeMyPassword": rule(10, 1 / 30),

  // Features.
  "help.revealHint": rule(10, 1 / 6),
  "similarity.assignment": rule(10, 1 / 6),
  "analysis.assignment": rule(10, 1 / 6),
  "privacy.exportStudent": rule(10, 1 / 30),
  "privacy.exportMyData": rule(10, 1 / 30),
  "privacy.exportAuditLog": rule(10, 1 / 30),
  "privacy.eraseStudent": rule(3, 1 / 60),
  "privacy.closeSchoolYear": rule(3, 1 / 60),
  "privacy.revokeAllSessions": rule(3, 1 / 60),
  "privacy.runRetention": rule(3, 1 / 60),
  "bank.search": rule(30, 1),
  "preferences.update": rule(20, 0.5),
};

/** Procedures limited per client IP, even when signed in. */
export const PER_IP_RATE_PATHS: ReadonlySet<string> = new Set([
  "setup.createFirstAdmin",
]);

export function rateRuleFor(path: string): BucketRule {
  return Object.hasOwn(RATE_RULES, path) ? RATE_RULES[path] : DEFAULT_RATE_RULE;
}
