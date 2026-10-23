/**
 * AVG art. 18 (beperking van de verwerking): while a restriction applies
 * (a retention hold of kind "restriction", set via privacy.setRestriction),
 * the student's data may only be stored. The account is blocked and kept
 * from automatic deletion; this module lets other routers refuse changes
 * (rename, facilities, scores) and show the restriction to teachers.
 *
 * Rectifying disputed data is sometimes the very outcome of the procedure,
 * so a change can be forced with an explicit override, which the caller
 * writes to the audit log (`restrictionOverridden: true`).
 *
 * Deliberately free of "server-only" and Next.js imports.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, gt, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { retentionHolds } from "@/server/db/schema";
import type { AuditDb } from "./audit-writer";

export const RESTRICTED_MESSAGE =
  "Voor deze leerling is de verwerking beperkt (AVG art. 18). Hef de beperking op via Privacy & gegevens.";

/** Active = no end date, or an end date in the future. */
const activeHold = () =>
  and(
    eq(retentionHolds.kind, "restriction"),
    or(isNull(retentionHolds.until), gt(retentionHolds.until, sql`now()`)),
  );

/** Whether an active restriction applies to this student. */
export async function hasActiveRestriction(
  db: AuditDb,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: retentionHolds.id })
    .from(retentionHolds)
    .where(and(eq(retentionHolds.userId, userId), activeHold()))
    .limit(1);
  return !!row;
}

/** The students among `userIds` with an active restriction. */
export async function restrictedUserIds(
  db: AuditDb,
  userIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ userId: retentionHolds.userId })
    .from(retentionHolds)
    .where(and(inArray(retentionHolds.userId, ids), activeHold()));
  return new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])));
}

/**
 * SQL boolean: an active restriction applies to the user whose id is in
 * `userIdColumn` (e.g. `user.id` in a select).
 */
export function restrictedSql(userIdColumn: SQL | unknown): SQL<boolean> {
  return sql<boolean>`exists(
    select 1 from ${retentionHolds} rh
    where rh.user_id = ${userIdColumn}
      and rh.kind = 'restriction'
      and (rh.until is null or rh.until > now())
  )`;
}

/**
 * Refuse to change a restricted student's data (PRECONDITION_FAILED),
 * unless `override` is set. Returns whether a restriction was overridden,
 * so the caller can record that in its audit entry.
 */
export async function assertNotRestricted(
  db: AuditDb,
  userId: string,
  options: { override?: boolean } = {},
): Promise<boolean> {
  if (!(await hasActiveRestriction(db, userId))) return false;
  if (options.override) return true;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: RESTRICTED_MESSAGE,
  });
}
