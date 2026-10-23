import "server-only";

import { after } from "next/server";
import type { AuditAction } from "@/lib/privacy/audit-actions";
import { truncateIp } from "@/lib/privacy/ip";
import {
  type AuditActor,
  type AuditDb,
  type AuditEntry,
  writeAudit,
} from "@/server/privacy/audit-writer";
import { clientIp } from "@/server/security/client-ip";

export {
  type AuditActor,
  type AuditActorRole,
  type AuditDb,
  type AuditEntry,
  auditSystem,
  writeAudit,
} from "@/server/privacy/audit-writer";

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

/**
 * The actor of a request: teachers get a name snapshot and a truncated IP;
 * students never get an IP. No user → "system". The IP comes from
 * `clientIp()` (TRUSTED_PROXIES-aware), never from the left-most
 * X-Forwarded-For entry, which the client controls.
 */
export function actorFromCtx(ctx: AuditContext): AuditActor {
  const user = ctx.user ?? null;
  const isAdmin = user?.role === "admin";
  return {
    actorId: user?.id ?? null,
    actorRole: !user ? "system" : isAdmin ? "admin" : "student",
    actorName: isAdmin ? user.name : null,
    impersonatorId: ctx.session?.session.impersonatedBy ?? null,
    ipPrefix: isAdmin ? truncateIp(clientIp(ctx.headers)) : null,
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
