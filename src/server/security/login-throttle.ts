/**
 * Failed sign-in throttling (table login_throttle), used by the better-auth
 * hooks in src/server/auth.ts.
 *
 * Keys:
 *  - `acct:student:<leerlingnummer>`  a student account (username sign-in,
 *    or e-mail sign-in with the placeholder student domain)
 *  - `acct:email:<email>`             any other e-mail sign-in (teachers)
 *  - `ip:<address>`                   failures from one client IP, counted
 *    in a fixed 10-minute window that starts at the first failure
 *    (updated_at holds the window start for these rows)
 *
 * Accounts lock for 15 minutes after 8 failures. After a lock has expired
 * the next failure sets the counter to 8 − 3, so a guesser gets three more
 * tries instead of a fresh eight (and a single typo does not re-lock at
 * once). IP addresses lock for 10 minutes at LOGIN_IP_MAX_FAILURES.
 *
 * All times are compared in SQL (the columns have no time zone and are
 * written with now()). No server-only import: the retention CLI uses
 * studentThrottleKeys.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { isStudentEmail, STUDENT_EMAIL_DOMAIN } from "@/lib/auth-shared";
import type * as schema from "@/server/db/schema";
import { loginThrottle } from "@/server/db/schema";

type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export const MAX_FAILURES = 8;
export const LOCK_MINUTES = 15;
export const IP_WINDOW_MINUTES = 10;
export const IP_LOCK_MINUTES = 10;
/** Failures after an expired lock: the counter restarts at this value. */
export const FAILURES_AFTER_EXPIRED_LOCK = MAX_FAILURES - 3;

export const ACCOUNT_LOCKED_MESSAGE = `Te veel mislukte pogingen. Probeer het over ${LOCK_MINUTES} minuten opnieuw of vraag je docent om hulp.`;
export const NETWORK_LOCKED_MESSAGE = `Te veel mislukte pogingen vanaf dit netwerk. Wacht ${IP_LOCK_MINUTES} minuten en probeer het opnieuw.`;

export const SIGN_IN_PATHS: ReadonlySet<string> = new Set([
  "/sign-in/username",
  "/sign-in/email",
]);

export type AccountKey = {
  key: string;
  kind: "student" | "email";
  /** The leerlingnummer or e-mail address (for the audit subjectLabel). */
  identifier: string;
};

const MAX_IDENTIFIER_LENGTH = 254;

/** The throttle key of a sign-in request body, or null without identifier. */
export function accountKeyFor(path: string, body: unknown): AccountKey | null {
  const b = (body ?? {}) as { username?: unknown; email?: unknown };
  const raw = path === "/sign-in/username" ? b.username : b.email;
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase().slice(0, MAX_IDENTIFIER_LENGTH);
  if (!id) return null;
  if (path === "/sign-in/username") {
    return { key: `acct:student:${id}`, kind: "student", identifier: id };
  }
  if (isStudentEmail(id)) {
    const nr = id.slice(0, id.lastIndexOf("@"));
    return { key: `acct:student:${nr}`, kind: "student", identifier: nr };
  }
  return { key: `acct:email:${id}`, kind: "email", identifier: id };
}

export function ipThrottleKey(ip: string): string {
  return `ip:${ip}`;
}

/**
 * Every login_throttle key that can hold this student's lock: the current
 * account key plus the per-path keys used before (rows that may still
 * exist after an upgrade).
 */
export function studentThrottleKeys(studentNumber: string): string[] {
  const nr = studentNumber.trim().toLowerCase();
  return [
    `acct:student:${nr}`,
    `/sign-in/username:${nr}`,
    `/sign-in/email:${`${nr}@${STUDENT_EMAIL_DOMAIN}`.toLowerCase()}`,
  ];
}

/**
 * The student's current lock: highest failure count over the keys, and
 * the latest lockedUntil that is still in the future. Null without rows.
 */
export async function getStudentLoginLock(
  db: Db,
  studentNumber: string,
): Promise<{ lockedUntil: Date | null; failures: number } | null> {
  const rows = await db
    .select({
      failures: loginThrottle.failures,
      lockedUntil: loginThrottle.lockedUntil,
      active: sql<boolean>`coalesce(${loginThrottle.lockedUntil} > now(), false)`,
    })
    .from(loginThrottle)
    .where(inArray(loginThrottle.key, studentThrottleKeys(studentNumber)));
  if (rows.length === 0) return null;
  let failures = 0;
  let lockedUntil: Date | null = null;
  for (const row of rows) {
    failures = Math.max(failures, row.failures);
    if (row.active && row.lockedUntil) {
      if (!lockedUntil || row.lockedUntil > lockedUntil) {
        lockedUntil = row.lockedUntil;
      }
    }
  }
  return { lockedUntil, failures };
}

/** Removes the student's failure counters and locks. Returns rows deleted. */
export async function clearStudentLoginThrottle(
  db: Db,
  studentNumber: string,
): Promise<number> {
  const result = await db
    .delete(loginThrottle)
    .where(inArray(loginThrottle.key, studentThrottleKeys(studentNumber)));
  return result.rowCount ?? 0;
}

/** Which of these keys are locked right now. */
export async function lockedKeys(db: Db, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await db
    .select({ key: loginThrottle.key })
    .from(loginThrottle)
    .where(
      and(
        inArray(loginThrottle.key, keys),
        sql`${loginThrottle.lockedUntil} > now()`,
      ),
    );
  return new Set(rows.map((r) => r.key));
}

/**
 * Counts one failed sign-in for an account. `lockedNow` is true for the
 * failure that triggered the lock (for the audit log).
 */
export async function recordAccountFailure(
  db: Db,
  key: string,
): Promise<{ failures: number; lockedNow: boolean }> {
  const t = loginThrottle;
  const expired = sql`(${t.lockedUntil} is not null and ${t.lockedUntil} <= now())`;
  const next = sql`(case when ${expired} then ${FAILURES_AFTER_EXPIRED_LOCK} else ${t.failures} + 1 end)`;
  const [row] = await db
    .insert(t)
    .values({ key, failures: 1, updatedAt: sql`now()` })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        failures: next,
        lockedUntil: sql`(case when ${next} >= ${MAX_FAILURES} then now() + make_interval(mins => ${LOCK_MINUTES}) when ${expired} then null else ${t.lockedUntil} end)`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ failures: t.failures });
  const failures = row?.failures ?? 1;
  return { failures, lockedNow: failures === MAX_FAILURES };
}

/**
 * Counts one failed sign-in from an IP address in its 10-minute window.
 * `lockedNow` is true for the failure that locked the address.
 */
export async function recordIpFailure(
  db: Db,
  ip: string,
  maxFailures: number,
): Promise<{ failures: number; lockedNow: boolean }> {
  const t = loginThrottle;
  const fresh = sql`(${t.updatedAt} < now() - make_interval(mins => ${IP_WINDOW_MINUTES}))`;
  const next = sql`(case when ${fresh} then 1 else ${t.failures} + 1 end)`;
  const [row] = await db
    .insert(t)
    .values({
      key: ipThrottleKey(ip),
      failures: 1,
      lockedUntil:
        maxFailures <= 1
          ? sql`now() + make_interval(mins => ${IP_LOCK_MINUTES})`
          : null,
      updatedAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        failures: next,
        lockedUntil: sql`(case when ${next} >= ${maxFailures} then now() + make_interval(mins => ${IP_LOCK_MINUTES}) when ${t.lockedUntil} > now() then ${t.lockedUntil} else null end)`,
        // Window start: only moves when a new window begins.
        updatedAt: sql`(case when ${fresh} then now() else ${t.updatedAt} end)`,
      },
    })
    .returning({ failures: t.failures });
  const failures = row?.failures ?? 1;
  return { failures, lockedNow: failures === maxFailures };
}

/** Forget an account's failures after a successful sign-in. */
export async function clearAccountKey(db: Db, key: string): Promise<void> {
  await db.delete(loginThrottle).where(eq(loginThrottle.key, key));
}

/**
 * Global password-spray detector: failures over all keys in a sliding
 * 10-minute window (per-minute buckets, in memory). `record` returns true
 * when the threshold is crossed and no alert was raised in the last 10
 * minutes. Pure (injectable clock).
 */
export class SprayDetector {
  private readonly buckets = new Map<number, number>();
  private lastAlertAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly threshold = 300,
    private readonly windowMinutes = 10,
  ) {}

  record(now = Date.now()): boolean {
    const minute = Math.floor(now / 60_000);
    this.buckets.set(minute, (this.buckets.get(minute) ?? 0) + 1);
    let total = 0;
    for (const [m, count] of this.buckets) {
      if (m <= minute - this.windowMinutes) this.buckets.delete(m);
      else total += count;
    }
    if (
      total > this.threshold &&
      now - this.lastAlertAt >= this.windowMinutes * 60_000
    ) {
      this.lastAlertAt = now;
      return true;
    }
    return false;
  }
}
