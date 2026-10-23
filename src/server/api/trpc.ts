/**
 * tRPC setup: context, procedures and middleware.
 *
 * Procedures:
 *  - publicProcedure    anyone (rate-limited per user, or per IP when anonymous)
 *  - protectedProcedure signed-in user (ctx.user)
 *  - adminProcedure     teachers (role "admin"); blocked while a temporary
 *                       password is pending, unless the procedure has
 *                       meta { allowWithPendingPasswordChange: true }
 *  - studentProcedure   students (role "student")
 *
 * Safety nets (AVG accountability): every successful teacher mutation
 * without a semantic audit entry gets a generic `trpc.mutation` row (ids
 * only), and every FORBIDDEN on a student procedure is logged as
 * `security.access_denied`. Audit failures are logged, never thrown.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { env } from "@/env";
import { ROLES } from "@/lib/auth-shared";
import type { AuditAction } from "@/lib/privacy/audit-actions";
import { pickAuditIds } from "@/lib/privacy/audit-sanitize";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { logServerError } from "@/server/privacy/error-log";
import { clientIp } from "@/server/security/client-ip";
import { formatErrorShape, RateLimitError } from "@/server/security/errors";
import { take } from "@/server/security/rate-limit";
import { PER_IP_RATE_PATHS, rateRuleFor } from "@/server/security/rate-rules";
import {
  type AuditContext,
  actorFromCtx,
  writeAudit,
} from "@/server/services/audit";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  // Straight from the database (no cookie cache): deactivation, PIN resets
  // and removed teachers take effect on the very next request.
  const session = await auth.api.getSession({
    headers: opts.headers,
    query: { disableCookieCache: true },
  });
  return {
    db,
    session,
    headers: opts.headers,
    /** Set by auditFromCtx, read by the audit safety net (one per request). */
    auditState: { written: false },
  };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

export type TRPCMeta = {
  /** staff.me and staff.changeMyPassword work with a temporary password. */
  allowWithPendingPasswordChange?: boolean;
};

const isDev = env.NODE_ENV === "development";

const t = initTRPC
  .context<TRPCContext>()
  .meta<TRPCMeta>()
  .create({
    transformer: superjson,
    isDev,
    errorFormatter: ({ shape, error }) =>
      formatErrorShape(shape, error, { isDev }),
  });

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const middleware = t.middleware;

function logAuditFailure(action: AuditAction, path: string, error: unknown) {
  // Never log the raw message: Drizzle quotes the row's parameters.
  logServerError("audit_write_failed", error, { action, path });
}

/** Writes one audit row for the request's actor; never throws. */
async function auditSafely(
  ctx: AuditContext,
  action: AuditAction,
  path: string,
  extra: { subjectUserId?: string | null; details?: Record<string, unknown> },
) {
  try {
    await writeAudit(ctx.db, {
      ...actorFromCtx(ctx),
      action,
      subjectUserId: extra.subjectUserId ?? null,
      details: { path, ...extra.details },
    });
    if (ctx.auditState) ctx.auditState.written = true;
  } catch (error) {
    logAuditFailure(action, path, error);
  }
}

type SessionUser = { id: string; name: string; role?: string | null };

function sessionUserOf(ctx: TRPCContext): SessionUser | null {
  return (ctx.session?.user as SessionUser | undefined) ?? null;
}

/** The audit actor of a request, built from the session. */
function auditCtxOf(ctx: TRPCContext): AuditContext {
  const user = sessionUserOf(ctx);
  return {
    db: ctx.db,
    headers: ctx.headers,
    session: ctx.session,
    auditState: ctx.auditState,
    user: user
      ? { id: user.id, name: user.name, role: user.role ?? ROLES.student }
      : null,
  };
}

/** Optional request timing log (TRPC_LOG_TIMING=1). */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  const result = await next();
  if (process.env.TRPC_LOG_TIMING) {
    console.log(`[tRPC] ${path} took ${Date.now() - start}ms`);
  }
  return result;
});

/* ------------------------------- Rate limit ------------------------------- */

const AUDIT_SAMPLE_INTERVAL_MS = 60_000;
const AUDIT_SAMPLE_MAX_KEYS = 5000;

/**
 * Key → last audit time, so a repeating event (a script hammering an
 * endpoint, an exam tab that keeps polling after the student left the
 * class) gives at most one audit row per key per minute.
 */
function createAuditSampler() {
  const audited = new Map<string, number>();
  return (key: string, now: number): boolean => {
    const last = audited.get(key);
    if (last !== undefined && now - last < AUDIT_SAMPLE_INTERVAL_MS) {
      return false;
    }
    audited.delete(key);
    audited.set(key, now);
    while (audited.size > AUDIT_SAMPLE_MAX_KEYS) {
      const oldest = audited.keys().next().value;
      if (oldest === undefined) break;
      audited.delete(oldest);
    }
    return true;
  };
}

/** One security.rate_limited per bucket key per minute. */
const shouldAuditRateLimit = createAuditSampler();
/** One security.access_denied per student and procedure per minute. */
const shouldAuditAccessDenied = createAuditSampler();

const seconds = (n: number) => (n === 1 ? "1 seconde" : `${n} seconden`);

const rateLimitMiddleware = t.middleware(async ({ ctx, path, next }) => {
  const user = sessionUserOf(ctx);
  const subject =
    user && !PER_IP_RATE_PATHS.has(path)
      ? `user:${user.id}`
      : `ip:${clientIp(ctx.headers) ?? "unknown"}`;
  const key = `${subject}|${path}`;
  const result = take(key, rateRuleFor(path));
  if (result.ok) return next();

  const wait = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  if (shouldAuditRateLimit(key, Date.now())) {
    // Not awaited and without auditState: the request is denied anyway.
    void auditSafely(
      { ...auditCtxOf(ctx), auditState: undefined },
      "security.rate_limited",
      path,
      {},
    );
  }
  throw new RateLimitError(
    user?.role === ROLES.student
      ? `Rustig aan! Je doet dit te vaak achter elkaar. Wacht ${seconds(wait)} en probeer het opnieuw.`
      : `Te veel verzoeken achter elkaar. Probeer het over ${seconds(wait)} opnieuw.`,
    wait,
  );
});

export const publicProcedure = t.procedure
  .use(timingMiddleware)
  .use(rateLimitMiddleware);

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Je bent niet ingelogd.",
    });
  }
  const user = ctx.session.user as typeof ctx.session.user & {
    role?: string | null;
    username?: string | null;
  };
  return next({
    ctx: {
      session: ctx.session,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role ?? ROLES.student,
        username: user.username ?? null,
      },
    },
  });
});

/* -------------------------------- Teachers -------------------------------- */

/** Generic audit row for teacher mutations without a semantic one. */
const auditSafetyNet = t.middleware(
  async ({ ctx, type, path, getRawInput, next }) => {
    const result = await next();
    if (type === "mutation" && result.ok && !ctx.auditState.written) {
      let input: Record<string, unknown> = {};
      try {
        const raw = await getRawInput();
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          input = raw as Record<string, unknown>;
        }
      } catch {
        // Unparseable input: audit the path only.
      }
      const subjectUserId =
        typeof input.userId === "string"
          ? input.userId
          : path.startsWith("student.") && typeof input.id === "string"
            ? input.id
            : null;
      await auditSafely(auditCtxOf(ctx), "trpc.mutation", path, {
        subjectUserId,
        details: pickAuditIds(input),
      });
    }
    return result;
  },
);

export const adminProcedure = protectedProcedure
  .use(({ ctx, next }) => {
    if (ctx.user.role !== ROLES.admin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Alleen voor docenten.",
      });
    }
    return next();
  })
  .use(({ ctx, meta, next }) => {
    const pending =
      (ctx.session.user as { passwordChangeRequired?: boolean | null })
        .passwordChangeRequired === true;
    if (pending && !meta?.allowWithPendingPasswordChange) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Wijzig eerst je tijdelijke wachtwoord.",
      });
    }
    return next();
  })
  .use(auditSafetyNet);

/* -------------------------------- Students -------------------------------- */

/**
 * Logs a student's FORBIDDEN (not NOT_FOUND) as a security event, sampled
 * per student and procedure (see createAuditSampler).
 */
const accessDeniedAudit = t.middleware(async ({ ctx, path, next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "FORBIDDEN") {
    const userId = sessionUserOf(ctx)?.id ?? "anonymous";
    if (shouldAuditAccessDenied(`${userId}|${path}`, Date.now())) {
      await auditSafely(auditCtxOf(ctx), "security.access_denied", path, {});
    }
  }
  return result;
});

export const studentProcedure = protectedProcedure
  .use(({ ctx, next }) => {
    if (ctx.user.role !== ROLES.student) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Alleen voor leerlingen.",
      });
    }
    return next();
  })
  .use(accessDeniedAudit);
