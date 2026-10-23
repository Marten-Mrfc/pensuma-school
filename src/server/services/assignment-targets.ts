/**
 * Who an afname is for, and who is still taking it.
 *
 * Targeting (inhaaltoets/herkansing): an afname for selected students has
 * rows in `assignment_student`; only those students (of its class) see it.
 * The intent is also stored on the afname itself (`settings.targeted`),
 * because the rows cascade away when a student account is erased: an
 * afname whose selected students are all gone must stay hidden from the
 * rest of the class instead of silently becoming a whole-class afname.
 * Afnames without the flag and without rows are for the whole class.
 */
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type * as schema from "@/server/db/schema";
import { assignmentStudents, assignments, attempts } from "@/server/db/schema";
import { anyoneStillWorking } from "@/server/services/assignment-status";

type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

/** Key in `assignment.settings` that marks an afname for selected students. */
export const TARGETED_SETTINGS_KEY = "targeted";

/** Whether raw assignment settings carry the "selected students" flag. */
export function isTargetedSettings(settings: unknown): boolean {
  return (
    typeof settings === "object" &&
    settings !== null &&
    (settings as Record<string, unknown>)[TARGETED_SETTINGS_KEY] === true
  );
}

/**
 * Settings with the targeting flag set or removed. Parsed settings (zod)
 * drop unknown keys, so every write of `assignment.settings` passes
 * through this to keep the flag.
 */
export function withTargetingFlag<T extends object>(
  settings: T,
  targeted: boolean,
): T {
  const { [TARGETED_SETTINGS_KEY]: _old, ...rest } = settings as Record<
    string,
    unknown
  >;
  return (targeted ? { ...rest, [TARGETED_SETTINGS_KEY]: true } : rest) as T;
}

/** SQL value for `assignment.settings` with the flag set or removed. */
export function settingsWithTargetingSql(targeted: boolean): SQL {
  const key = sql.raw(`'${TARGETED_SETTINGS_KEY}'`);
  return targeted
    ? sql`(${assignments.settings} || jsonb_build_object(${key}, true))`
    : sql`(${assignments.settings} - ${key})`;
}

/** SQL: `assignment.settings` carries the flag (a constant, never user input). */
const flagSql = sql`${assignments}.settings -> ${sql.raw(`'${TARGETED_SETTINGS_KEY}'`)} = 'true'::jsonb`;

/** SQL: the afname is marked as "for selected students" (flag or rows). */
const targetedSql = sql`(coalesce(${flagSql}, false) or exists (select 1 from ${assignmentStudents} s where s.assignment_id = ${assignments}.id))`;

/**
 * SQL condition on `assignment`: true when the assignment targets the
 * whole class, or explicitly includes this student. Combine it with the
 * class membership check, e.g. `and(inArray(assignments.classId, ids),
 * assignmentVisibleToStudent(userId))`.
 */
export function assignmentVisibleToStudent(userId: string): SQL {
  return sql`(not ${targetedSql} or exists (select 1 from ${assignmentStudents} s where s.assignment_id = ${assignments}.id and s.user_id = ${userId}))`;
}

const globalForTargets = globalThis as unknown as {
  targetingBackfill?: Promise<void>;
};

/**
 * One-off backfill for afnames created before the flag existed: every
 * afname with selected students gets `settings.targeted = true`.
 * Idempotent; `ensureTargetingBackfill` runs it once per process.
 */
export async function backfillTargetingFlags(db: Db): Promise<number> {
  const result = await db.execute(sql`
    update ${assignments} a
       set settings = a.settings || ${JSON.stringify({ [TARGETED_SETTINGS_KEY]: true })}::jsonb
     where a.settings -> ${sql.raw(`'${TARGETED_SETTINGS_KEY}'`)} is null
       and exists (select 1 from ${assignmentStudents} s where s.assignment_id = a.id)`);
  return result.rowCount ?? 0;
}

/** Run `backfillTargetingFlags` once per process (errors are logged). */
export function ensureTargetingBackfill(db: Db): Promise<void> {
  globalForTargets.targetingBackfill ??= backfillTargetingFlags(db).then(
    () => undefined,
    (error: unknown) => {
      globalForTargets.targetingBackfill = undefined;
      console.error("[assignment-targets] backfill failed", error);
    },
  );
  return globalForTargets.targetingBackfill;
}

/**
 * Selected students per assignment. Only targeted assignments appear in
 * the map (absent = the whole class). A targeted afname whose students
 * were all erased maps to an empty list.
 */
export async function targetedStudentIds(
  db: Db,
  assignmentIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (assignmentIds.length === 0) return map;
  await ensureTargetingBackfill(db);
  const [rows, flagged] = await Promise.all([
    db
      .select({
        assignmentId: assignmentStudents.assignmentId,
        userId: assignmentStudents.userId,
      })
      .from(assignmentStudents)
      .where(inArray(assignmentStudents.assignmentId, assignmentIds)),
    db
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(inArray(assignments.id, assignmentIds), flagSql)),
  ]);
  for (const { id } of flagged) map.set(id, []);
  for (const row of rows) {
    const list = map.get(row.assignmentId);
    if (list) list.push(row.userId);
    else map.set(row.assignmentId, [row.userId]);
  }
  return map;
}

/**
 * Per afname: whether somebody can still work on it (see
 * `anyoneStillWorking`). Used to hold back results and right answers while
 * classmates with verlengde tijd are still busy after the close.
 */
export async function stillWorkingByAssignment(
  db: Db,
  list: readonly {
    id: string;
    status: "planned" | "open" | "closed";
    opensAt: Date | null;
    closesAt: Date | null;
  }[],
  now = new Date(),
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (list.length === 0) return result;
  const ids = [...new Set(list.map((a) => a.id))];
  const rows = await db
    .select({
      assignmentId: attempts.assignmentId,
      deadlineAt: attempts.deadlineAt,
    })
    .from(attempts)
    .where(
      and(
        inArray(attempts.assignmentId, ids),
        eq(attempts.status, "in_progress"),
      ),
    );
  const running = new Map<string, { deadlineAt: Date | null }[]>();
  for (const r of rows) {
    const entry = running.get(r.assignmentId);
    if (entry) entry.push(r);
    else running.set(r.assignmentId, [r]);
  }
  for (const a of list) {
    result.set(a.id, anyoneStillWorking(running.get(a.id) ?? [], a, now));
  }
  return result;
}

/** `stillWorkingByAssignment` for one afname. */
export async function stillWorking(
  db: Db,
  a: {
    id: string;
    status: "planned" | "open" | "closed";
    opensAt: Date | null;
    closesAt: Date | null;
  },
  now = new Date(),
): Promise<boolean> {
  return (await stillWorkingByAssignment(db, [a], now)).get(a.id) ?? false;
}
