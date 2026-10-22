/**
 * The pure audit-log insert, without "server-only" or Next.js imports, so
 * the retention engine can use it from instrumentation and the CLI.
 * Application code imports these through src/server/services/audit.ts.
 */
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

/** Insert one audit row. Throws on failure (so a transaction rolls back). */
export async function writeAudit(
  dbOrTx: AuditDb,
  entry: AuditActor & AuditEntry,
): Promise<void> {
  await dbOrTx.insert(auditLog).values({
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
  });
}

/** An action by the system itself (no user, no IP). */
export async function auditSystem(
  dbOrTx: AuditDb,
  entry: AuditEntry,
): Promise<void> {
  await writeAudit(dbOrTx, { actorId: null, actorRole: "system", ...entry });
}
