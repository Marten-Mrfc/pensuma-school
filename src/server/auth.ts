import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { eq, sql } from "drizzle-orm";
import { env } from "@/env";
import { isStudentEmail, ROLES, STUDENT_EMAIL_DOMAIN } from "@/lib/auth-shared";
import { truncateIp } from "@/lib/privacy/ip";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { DISABLED_AUTH_PATHS } from "@/server/security/auth-routes";
import { clientIp, trustedProxiesFromEnv } from "@/server/security/client-ip";
import { loggableErrorMessage } from "@/server/security/errors";
import {
  ACCOUNT_LOCKED_MESSAGE,
  type AccountKey,
  accountKeyFor,
  clearAccountKey,
  IP_WINDOW_MINUTES,
  releaseIpAttempt,
  releaseSignInAttempt,
  reserveSignInAttempt,
  SIGN_IN_PATHS,
  type SignInReservation,
  SprayDetector,
} from "@/server/security/login-throttle";
import { auditSystem, writeAudit } from "@/server/services/audit";

/** Failures across all accounts in 10 minutes before an alert is logged. */
const SPRAY_THRESHOLD = 300;

/**
 * Longest a session lives: one school day. Remembered sessions (teachers)
 * end 12 hours after their last use; student sessions (rememberMe off,
 * never refreshed by better-auth) end 12 hours after signing in instead of
 * better-auth's fixed 24 hours.
 */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

/**
 * Attempts counted by the before hook, per sign-in call. Keyed by the
 * per-call context object better-auth hands to both hooks.
 */
const reservations = new WeakMap<object, SignInReservation>();

const SPRAY_KEY = Symbol.for("pensuma.loginSprayDetector");
/** One detector per process (survives HMR in development). */
function getSprayDetector(): SprayDetector {
  const g = globalThis as Record<symbol, SprayDetector | undefined>;
  let detector = g[SPRAY_KEY];
  if (!detector) {
    detector = new SprayDetector(SPRAY_THRESHOLD, IP_WINDOW_MINUTES);
    g[SPRAY_KEY] = detector;
  }
  return detector;
}

type HookContext = {
  path: string;
  body?: unknown;
  headers?: Headers;
  request?: Request;
};

function hookIp(ctx: HookContext): string | null {
  const headers = ctx.request?.headers ?? ctx.headers;
  return headers ? clientIp(headers) : null;
}

function logHookError(event: string, path: string, error: unknown) {
  console.error(
    JSON.stringify({
      level: "error",
      ts: new Date().toISOString(),
      event,
      path,
      // A failed throttle query would otherwise log its parameters (the
      // leerlingnummer or e-mail address).
      error: loggableErrorMessage(error, 300),
    }),
  );
}

/** The account a lock applies to, for the audit row (may not exist). */
async function lockedAccountUserId(account: AccountKey) {
  const where =
    account.kind === "student"
      ? eq(schema.user.username, account.identifier)
      : eq(schema.user.email, account.identifier);
  const [row] = await db
    .select({ id: schema.user.id, role: schema.user.role })
    .from(schema.user)
    .where(where)
    .limit(1);
  return row ?? null;
}

async function onSignInFailure(
  ctx: HookContext,
  reservation: SignInReservation | undefined,
) {
  if (getSprayDetector().record()) {
    await auditSystem(db, {
      action: "security.login_spray_suspected",
      subjectType: "system",
      details: {
        windowMinutes: IP_WINDOW_MINUTES,
        threshold: SPRAY_THRESHOLD,
      },
    });
  }

  // The failure itself was counted by the before hook; only the audit
  // rows are left.
  const account = accountKeyFor(ctx.path, ctx.body);
  if (account && reservation?.account?.lockedNow) {
    const target = await lockedAccountUserId(account);
    await auditSystem(db, {
      action: "auth.account_locked",
      subjectType:
        account.kind === "student" || target?.role === ROLES.student
          ? "student"
          : "staff",
      subjectId: target?.id ?? null,
      subjectUserId: target?.role === ROLES.student ? target.id : null,
      subjectLabel: account.identifier,
      details: {
        failuresCount: reservation.account.failures,
        // 8, or fewer while the network had many failures.
        threshold: reservation.account.maxFailures,
      },
    });
  }

  if (reservation?.ip?.reachedLimit) {
    await writeAudit(db, {
      actorId: null,
      actorRole: "system",
      ipPrefix: truncateIp(hookIp(ctx)),
      action: "auth.network_locked",
      subjectType: "system",
      details: { failuresCount: reservation.ip.failures },
    });
  }
}

async function onSignInSuccess(
  ctx: HookContext,
  newSession: { user: { id: string; name: string; role?: string | null } },
  reservation: SignInReservation | undefined,
) {
  const { user } = newSession;
  await db
    .insert(schema.userActivity)
    .values({ userId: user.id, lastSignInAt: sql`now()` })
    .onConflictDoUpdate({
      target: schema.userActivity.userId,
      set: { lastSignInAt: sql`now()` },
    });
  const account = accountKeyFor(ctx.path, ctx.body);
  if (account) await clearAccountKey(db, account.key);
  if (reservation?.ip) await releaseIpAttempt(db, reservation.ip);
  if (ctx.path === "/sign-in/email" && user.role === ROLES.admin) {
    await writeAudit(db, {
      actorId: user.id,
      actorRole: "admin",
      actorName: user.name,
      ipPrefix: truncateIp(hookIp(ctx)),
      action: "auth.sign_in",
      subjectType: "staff",
      subjectId: user.id,
    });
  }
}

export const auth = betterAuth({
  appName: "Pensuma",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: async (request) => {
    const origins = [env.BETTER_AUTH_URL];
    // In development, allow any localhost port (several dev servers run side by side).
    const origin = request?.headers.get("origin");
    if (
      env.NODE_ENV !== "production" &&
      origin &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) {
      origins.push(origin);
    }
    return origins;
  },
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Defence in depth: the route handler already answers 404 for these.
  // Server-side auth.api.* calls are not affected.
  disabledPaths: [...DISABLED_AUTH_PATHS],
  emailAndPassword: {
    enabled: true,
    // Accounts are created by teachers only (students) or via /setup + admin UI (teachers).
    disableSignUp: true,
    // Student PINs are 6 digits; the teacher password policy (min 12) is
    // enforced in our own procedures (src/lib/security/password-policy.ts).
    minPasswordLength: 6,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      /** Teachers with a temporary password must choose their own first. */
      passwordChangeRequired: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
  },
  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    updateAge: 60 * 60,
    // No better-auth.session_data cookie: every server read passes
    // disableCookieCache anyway, and for students (rememberMe off) the
    // cookie would sit on a shared computer until the browser closes with
    // their name, leerlingnummer and IP address in it. better-auth clears
    // a leftover copy on the next get-session.
    cookieCache: { enabled: false },
  },
  databaseHooks: {
    session: {
      create: {
        // better-auth gives a session without rememberMe a fixed 24 hours;
        // cap every new session at one school day (see the privacy
        // statement). Shorter ones (impersonation) are kept as they are.
        before: async (session) => {
          const start = session.createdAt
            ? new Date(session.createdAt).getTime()
            : Date.now();
          const cap = new Date(start + SESSION_MAX_AGE_SECONDS * 1000);
          const expiresAt = new Date(session.expiresAt);
          return { data: { expiresAt: expiresAt > cap ? cap : expiresAt } };
        },
      },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 300,
    customRules: {
      // Per IP. A whole school signs in from one NAT address, so successful
      // sign-ins must not exhaust a shared bucket; failures are limited by
      // the account lock (stricter while the network has many failures,
      // see login-throttle.ts), never by refusing the whole address.
      "/sign-in/username": { window: 60, max: 600 },
      "/sign-in/email": { window: 60, max: 60 },
      // Several classes sign out at the bell from that same address; a
      // refused sign-out would leave a session on a shared computer.
      "/sign-out": { window: 60, max: 3000 },
      // The login page reads the session for every visitor.
      "/get-session": { window: 60, max: 3000 },
    },
  },
  advanced: {
    // __Secure- cookies over HTTPS (not for an http LAN pilot).
    useSecureCookies: env.NODE_ENV === "production" && !env.ALLOW_INSECURE_HTTP,
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      trustedProxies: [...trustedProxiesFromEnv()],
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!SIGN_IN_PATHS.has(ctx.path)) return;
      // Students only sign in with their leerlingnummer. The placeholder
      // address gets the same answer as a wrong password, before any
      // password work, so the e-mail path cannot be used for guessing.
      if (ctx.path === "/sign-in/email") {
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email === "string" && isStudentEmail(email)) {
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid email or password",
            code: "INVALID_EMAIL_OR_PASSWORD",
          });
        }
      }
      // Count the attempt before the password is checked (atomic per
      // key), so parallel requests cannot all slip past the lock check.
      const result = await reserveSignInAttempt(db, {
        account: accountKeyFor(ctx.path, ctx.body),
        ip: hookIp(ctx),
        ipMaxFailures: env.LOGIN_IP_MAX_FAILURES,
      });
      if (!result.ok) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: ACCOUNT_LOCKED_MESSAGE,
          code: "ACCOUNT_LOCKED",
        });
      }
      reservations.set(ctx.context, result.reservation);
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (!SIGN_IN_PATHS.has(ctx.path)) return;
      const reservation = reservations.get(ctx.context);
      reservations.delete(ctx.context);
      // Bookkeeping only: a sign-in never fails because of it.
      try {
        const returned = ctx.context.returned;
        const newSession = ctx.context.newSession;
        if (newSession && !isAPIError(returned)) {
          await onSignInSuccess(ctx, newSession, reservation);
        } else if (isAPIError(returned) && returned.statusCode === 401) {
          await onSignInFailure(ctx, reservation);
        } else if (reservation) {
          // Not a wrong password (malformed request, banned account,
          // server error): the attempt does not count.
          await releaseSignInAttempt(db, reservation);
        }
      } catch (error) {
        logHookError("auth_hook_failed", ctx.path, error);
      }
    }),
  },
  plugins: [
    username({ minUsernameLength: 3, maxUsernameLength: 32 }),
    // Kept for the `role` field and the banned-user check only; every
    // /admin/* endpoint (impersonation included) is disabled above.
    admin({
      defaultRole: ROLES.student,
      adminRoles: [ROLES.admin],
      impersonationSessionDuration: 60 * 30,
    }),
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;

/** Placeholder email for a student account (better-auth requires an email). */
export function studentEmail(studentNumber: string) {
  return `${studentNumber.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}
