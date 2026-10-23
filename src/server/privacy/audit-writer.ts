/**
 * The pure audit-log insert, without "server-only" or Next.js imports, so
 * the retention engine can use it from instrumentation and the CLI.
 * Application code imports these through src/server/services/audit.ts.
 */
import { sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type {
  AuditAction,
  AuditSubjectType,
} from "@/lib/privacy/audit-actions";
import { sanitizeAuditDetails } from "@/lib/privacy/audit-sanitize";
import type * as schema from "@/server/db/schema";
import { auditLog } from "@/server/db/schema";

/** The app database, a transaction of it, or any drizzle db with the schema. */
export type AuditDb = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export type AuditActorRole = "admin" | "student" | "system";

export type AuditEntry = {
  action: AuditAction;
  subjectType?: AuditSubjectType;
  subjectId?: string | null;
  /** The student concerned. */
  subjectUserId?: string | null;
  /** E.g. the leerlingnummer. */
  subjectLabel?: string | null;
  details?: Record<string, unknown> | null;
};

export type AuditActor = {
  actorId: string | null;
  actorRole: AuditActorRole;
  actorName?: string | null;
  impersonatorId?: string | null;
  ipPrefix?: string | null;
};

const clip = (value: string | null | undefined, max = 200) =>
  value == null ? null : value.slice(0, max);

function toRow(entry: AuditActor & AuditEntry) {
  return {
    actorId: clip(entry.actorId, 64),
    actorRole: entry.actorRole,
    actorName: clip(entry.actorName),
    impersonatorId: clip(entry.impersonatorId, 64),
    ipPrefix: clip(entry.ipPrefix, 64),
    action: entry.action,
    subjectType: entry.subjectType ?? null,
    subjectId: clip(entry.subjectId, 128),
    subjectUserId: clip(entry.subjectUserId, 64),
    subjectLabel: clip(entry.subjectLabel),
    details: sanitizeAuditDetails(entry.details),
  };
}

/** Insert one audit row. Throws on failure (so a transaction rolls back). */
export async function writeAudit(
  dbOrTx: AuditDb,
  entry: AuditActor & AuditEntry,
): Promise<void> {
  await dbOrTx.insert(auditLog).values(toRow(entry));
}

const MANY_CHUNK = 500;

/**
 * Insert several audit rows with multi-row inserts (e.g. one row per
 * student when a teacher prints a class's login cards). Throws on failure.
 */
export async function writeAuditMany(
  dbOrTx: AuditDb,
  entries: readonly (AuditActor & AuditEntry)[],
): Promise<void> {
  for (let i = 0; i < entries.length; i += MANY_CHUNK) {
    await dbOrTx
      .insert(auditLog)
      .values(entries.slice(i, i + MANY_CHUNK).map(toRow));
  }
}

/**
 * Detail keys that describe a student's data rather than only that
 * something happened: old and new scores (answer.score_changed) and
 * facilities (student.accommodation_updated, including the change flags
 * written since).
 */
export const STUDENT_DATA_DETAIL_KEYS = [
  "from",
  "to",
  "manualScore",
  "extraTimePercent",
  "allowPaste",
  "ignoreFocusEvents",
  "extraTimeChanged",
  "allowPasteChanged",
  "focusLogChanged",
  "facilityActive",
] as const;

/** Actions whose details can hold STUDENT_DATA_DETAIL_KEYS. */
const STUDENT_DATA_ACTIONS = [
  "answer.score_changed",
  "student.accommodation_updated",
] as const;

const studentDataKeys = () =>
  sql`array[${sql.join(
    STUDENT_DATA_DETAIL_KEYS.map((k) => sql`${k}`),
    sql`, `,
  )}]::text[]`;

const studentDataActions = () =>
  sql.join(
    STUDENT_DATA_ACTIONS.map((a) => sql`${a}`),
    sql`, `,
  );

/**
 * Erasure (AVG art. 17): strip the student-data keys from the earlier audit
 * rows about these students, in the caller's transaction. What remains is
 * that it happened: who, when, which action and the leerlingnummer, without
 * a name, a score or a facility. Returns the number of rows changed.
 */
export async function redactErasedStudentsAudit(
  dbOrTx: AuditDb,
  userIds: readonly string[],
): Promise<number> {
  if (userIds.length === 0) return 0;
  const result = await dbOrTx.execute(sql`update ${auditLog}
    set details = nullif(details - ${studentDataKeys()}, '{}'::jsonb)
    where ${auditLog.subjectUserId} in (${sql.join(
      userIds.map((id) => sql`${id}`),
      sql`, `,
    )})
      and ${auditLog.action} in (${studentDataActions()})
      and details ?| ${studentDataKeys()}`);
  return result.rowCount ?? 0;
}

/**
 * The same redaction for every student who no longer exists, e.g. students
 * deleted before deletion started redacting the log (rows that are already
 * in production databases).
 * Idempotent and cheap once done (rows without these keys are skipped);
 * the retention engine runs it on every real run. Returns the number of
 * rows changed.
 */
export async function redactDeletedStudentsAudit(
  dbOrTx: AuditDb,
): Promise<number> {
  const result = await dbOrTx.execute(sql`update audit_log
    set details = nullif(details - ${studentDataKeys()}, '{}'::jsonb)
    where action in (${studentDataActions()})
      and subject_user_id is not null
      and details ?| ${studentDataKeys()}
      and not exists (
        select 1 from "user" u where u.id = audit_log.subject_user_id
      )`);
  return result.rowCount ?? 0;
}

/** An action by the system itself (no user, no IP). */
export async function auditSystem(
  dbOrTx: AuditDb,
  entry: AuditEntry,
): Promise<void> {
  await writeAudit(dbOrTx, { actorId: null, actorRole: "system", ...entry });
}
