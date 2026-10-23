/**
 * "Poging 2 van 3": the attempt number students and teachers see.
 *
 * `attempt.attempt_number` is the stable internal key: unique per student
 * and afname, never reused, and what "the latest attempt" is based on. It
 * can have gaps, because a teacher can reset (delete) an attempt and the
 * retention clean-up removes old ones. A label built from it could read
 * "poging 6 van 5". Every API output therefore numbers an attempt by its
 * position among the student's attempts at that afname that still exist
 * (1, 2, 3, …), so "poging X van Y" with Y = that number of attempts is
 * always right. The order is the same as attempt_number's.
 *
 * Stored data (audit log details, attempt events, the privacy export)
 * keeps the internal attempt_number.
 */
import { and, eq, getTableName, lte, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type * as schema from "@/server/db/schema";
import { attempts } from "@/server/db/schema";

type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

/** The outer query's `attempt` table, always qualified: drizzle leaves the
 * table name off columns in a single-table select, and inside the subquery
 * an unqualified column would mean the subquery's own row. */
const outer = sql.identifier(getTableName(attempts));

/**
 * SQL: the display number of the `attempt` row of the surrounding query
 * (select it as `attemptNumber`; the query must not alias the table). Uses
 * the unique index on (assignment_id, user_id, attempt_number).
 */
export const attemptDisplayNumberSql = sql<number>`(select count(*)::int from ${attempts} as "attempt_before" where "attempt_before"."assignment_id" = ${outer}."assignment_id" and "attempt_before"."user_id" = ${outer}."user_id" and "attempt_before"."attempt_number" <= ${outer}."attempt_number")`;

type NumberedAttempt = {
  id: string;
  userId: string;
  attemptNumber: number;
  /** Needed when the rows span more than one afname. */
  assignmentId?: string;
};

/**
 * Display numbers (attempt id → 1, 2, …) for rows that hold every attempt
 * of the students involved at their afnames.
 */
export function attemptDisplayNumbers(
  rows: readonly NumberedAttempt[],
): Map<string, number> {
  const groups = new Map<string, NumberedAttempt[]>();
  for (const row of rows) {
    const key = `${row.assignmentId ?? ""}|${row.userId}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const out = new Map<string, number>();
  for (const list of groups.values()) {
    list
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .forEach((row, index) => {
        out.set(row.id, index + 1);
      });
  }
  return out;
}

/** The display number of one attempt (one count on the unique index). */
export async function attemptDisplayNumberOf(
  db: Db,
  attempt: { assignmentId: string; userId: string; attemptNumber: number },
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attempts)
    .where(
      and(
        eq(attempts.assignmentId, attempt.assignmentId),
        eq(attempts.userId, attempt.userId),
        lte(attempts.attemptNumber, attempt.attemptNumber),
      ),
    );
  return row?.n || attempt.attemptNumber;
}
