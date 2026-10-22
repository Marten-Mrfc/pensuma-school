/**
 * Failed sign-in lockouts (table login_throttle). Keys are built like
 * `throttleKey` in src/server/auth.ts: "<path>:<identifier lower-cased>".
 * A student can be locked under the username path (leerlingnummer) and
 * under the email path (placeholder email).
 */
import { inArray, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { STUDENT_EMAIL_DOMAIN } from "@/lib/auth-shared";
import type * as schema from "@/server/db/schema";
import { loginThrottle } from "@/server/db/schema";

type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

/** Every login_throttle key that can hold this student's lock. */
export function studentThrottleKeys(studentNumber: string): string[] {
  const nr = studentNumber.trim().toLowerCase();
  return [
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
      // Compared in SQL: the column has no time zone and is set with now().
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
