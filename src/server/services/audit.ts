import "server-only";

import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { after } from "next/server";
import type {
  AuditAction,
  AuditSubjectType,
} from "@/lib/privacy/audit-actions";
import { sanitizeAuditDetails } from "@/lib/privacy/audit-sanitize";
import { clientIpFromHeaders, truncateIp } from "@/lib/privacy/ip";
import type * as schema from "@/server/db/schema";
import { auditLog } from "@/server/db/schema";

/**
 * Audit log writer (AVG art. 5(2) accountability, security logging).
 *
 *  - writeAudit    insert one row (inside the caller's transaction if given)
 *  - auditFromCtx  actor from the tRPC context (or anything shaped like it)
 *  - auditRead     read access: non-blocking, de-duplicated for 10 minutes
 *  - auditSystem   actions by the system itself (retention runs, scripts)
 *
 * Details pass through `sanitizeAuditDetails`: ids, counts, booleans,
 * dates and enum-like strings only. Never put names, PINs, passwords, code
 * or answer text in them; the leerlingnummer goes in `subjectLabel`.
 */

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

/**
 * Structural, so both the tRPC context and better-auth hooks can pass
 * something that fits.
 */
export type AuditContext = {
  db: AuditDb;
  headers: Headers;
  user?: { id: string; name: string; role: string } | null;
  session?: { session: { impersonatedBy?: string | null } } | null;
  auditState?: { written: boolean };
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

/**
 * The actor of a request: teachers get a name snapshot and a truncated IP;
 * students never get an IP. No user → "system".
 */
export function actorFromCtx(ctx: AuditContext): AuditActor {
  const user = ctx.user ?? null;
  const isAdmin = user?.role === "admin";
  return {
    actorId: user?.id ?? null,
    actorRole: !user ? "system" : isAdmin ? "admin" : "student",
    actorName: isAdmin ? user.name : null,
    impersonatorId: ctx.session?.session.impersonatedBy ?? null,
    ipPrefix: isAdmin ? truncateIp(clientIpFromHeaders(ctx.headers)) : null,
  };
}

/**
 * Write a semantic audit entry for the current request. Marks
 * `ctx.auditState.written` so the tRPC safety net does not add a generic
 * `trpc.mutation` entry as well.
 */
export async function auditFromCtx(
  ctx: AuditContext,
  entry: AuditEntry,
  dbOrTx: AuditDb = ctx.db,
): Promise<void> {
  await writeAudit(dbOrTx, { ...actorFromCtx(ctx), ...entry });
  if (ctx.auditState) ctx.auditState.written = true;
}

/* ------------------------------- Read access ------------------------------ */

const READ_DEDUPE_MS = 10 * 60_000;
const READ_DEDUPE_MAX = 1000;
/** actor|action|subjectId → last write time. Insertion order = LRU order. */
const recentReads = new Map<string, number>();

function seenRecently(key: string, now: number): boolean {
  const last = recentReads.get(key);
  if (last !== undefined && now - last < READ_DEDUPE_MS) return true;
  recentReads.delete(key);
  recentReads.set(key, now);
  while (recentReads.size > READ_DEDUPE_MAX) {
    const oldest = recentReads.keys().next().value;
    if (oldest === undefined) break;
    recentReads.delete(oldest);
  }
  return false;
}

function logAuditError(action: AuditAction, error: unknown) {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "audit_write_failed",
      action,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

/**
 * Log read access (student.viewed, attempt.viewed, student.pins_viewed …)
 * without blocking the response. A repeat of the same actor, action and
 * subject within 10 minutes is skipped. Never throws.
 */
export function auditRead(ctx: AuditContext, entry: AuditEntry): void {
  try {
    const actor = actorFromCtx(ctx);
    const key = `${actor.actorId ?? ""}|${entry.action}|${entry.subjectId ?? ""}`;
    if (seenRecently(key, Date.now())) return;
    const task = () =>
      writeAudit(ctx.db, { ...actor, ...entry }).catch((error: unknown) => {
        recentReads.delete(key);
        logAuditError(entry.action, error);
      });
    try {
      after(task);
    } catch {
      // No request scope (scripts, tests): run detached.
      void task();
    }
  } catch (error) {
    logAuditError(entry.action, error);
  }
}

/** An action by the system itself (no user, no IP). */
export async function auditSystem(
  dbOrTx: AuditDb,
  entry: AuditEntry,
): Promise<void> {
  await writeAudit(dbOrTx, { actorId: null, actorRole: "system", ...entry });
}
