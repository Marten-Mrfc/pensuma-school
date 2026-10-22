/**
 * Assignments for selected students (inhaaltoets/herkansing): when an
 * assignment has rows in `assignment_student`, only those students (of its
 * class) see it; without rows the whole class does.
 */
import { inArray, type SQL, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type * as schema from "@/server/db/schema";
import { assignmentStudents, assignments } from "@/server/db/schema";

type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

/**
 * SQL condition on `assignment`: true when the assignment targets the
 * whole class, or explicitly includes this student. Combine it with the
 * class membership check, e.g. `and(inArray(assignments.classId, ids),
 * assignmentVisibleToStudent(userId))`.
 */
export function assignmentVisibleToStudent(userId: string): SQL {
  return sql`(not exists (select 1 from ${assignmentStudents} s where s.assignment_id = ${assignments.id}) or exists (select 1 from ${assignmentStudents} s where s.assignment_id = ${assignments.id} and s.user_id = ${userId}))`;
}

/**
 * Selected students per assignment. Only assignments that have rows
 * appear in the map (absent = the whole class).
 */
export async function targetedStudentIds(
  db: Db,
  assignmentIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (assignmentIds.length === 0) return map;
  const rows = await db
    .select({
      assignmentId: assignmentStudents.assignmentId,
      userId: assignmentStudents.userId,
    })
    .from(assignmentStudents)
    .where(inArray(assignmentStudents.assignmentId, assignmentIds));
  for (const row of rows) {
    const list = map.get(row.assignmentId);
    if (list) list.push(row.userId);
    else map.set(row.assignmentId, [row.userId]);
  }
  return map;
}
