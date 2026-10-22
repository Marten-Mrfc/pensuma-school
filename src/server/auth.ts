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
import {
  ACCOUNT_LOCKED_MESSAGE,
  type AccountKey,
  accountKeyFor,
  clearAccountKey,
  IP_WINDOW_MINUTES,
  ipThrottleKey,
  lockedKeys,
  NETWORK_LOCKED_MESSAGE,
  recordAccountFailure,
  recordIpFailure,
  SIGN_IN_PATHS,
  SprayDetector,
} from "@/server/security/login-throttle";
import { auditSystem, writeAudit } from "@/server/services/audit";

/** Failures across all accounts in 10 minutes before an alert is logged. */
const SPRAY_THRESHOLD = 300;

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
      error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
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

async function onSignInFailure(ctx: HookContext) {
  const account = accountKeyFor(ctx.path, ctx.body);
  const ip = hookIp(ctx);

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

  if (account) {
    const result = await recordAccountFailure(db, account.key);
    if (result.lockedNow) {
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
        details: { failuresCount: result.failures },
      });
    }
  }

  if (ip) {
    const result = await recordIpFailure(db, ip, env.LOGIN_IP_MAX_FAILURES);
    if (result.lockedNow) {
      await writeAudit(db, {
        actorId: null,
        actorRole: "system",
        ipPrefix: truncateIp(ip),
        action: "auth.network_locked",
        subjectType: "system",
        details: { failuresCount: result.failures },
      });
    }
  }
}

async function onSignInSuccess(
  ctx: HookContext,
  newSession: { user: { id: string; name: string; role?: string | null } },
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
    expiresIn: 60 * 60 * 12, // 12 hours: one school day
    updateAge: 60 * 60,
    // Only for better-auth's own endpoints: the tRPC context and the
    // server guards read the session with disableCookieCache, so
    // deactivation, PIN resets and removals take effect at once.
    cookieCache: { enabled: true, maxAge: 60 },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 300,
    customRules: {
      // Per IP. A whole school signs in from one NAT address, so successful
      // sign-ins must not exhaust a shared bucket; failures are limited by
      // the account and IP failure counters below.
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
      const account = accountKeyFor(ctx.path, ctx.body);
      const ip = hookIp(ctx);
      const ipKey = ip ? ipThrottleKey(ip) : null;
      const locked = await lockedKeys(
        db,
        [account?.key, ipKey].filter((k): k is string => !!k),
      );
      if (ipKey && locked.has(ipKey)) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: NETWORK_LOCKED_MESSAGE,
          code: "NETWORK_LOCKED",
        });
      }
      if (account && locked.has(account.key)) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: ACCOUNT_LOCKED_MESSAGE,
          code: "ACCOUNT_LOCKED",
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (!SIGN_IN_PATHS.has(ctx.path)) return;
      // Bookkeeping only: a sign-in never fails because of it.
      try {
        const returned = ctx.context.returned;
        const newSession = ctx.context.newSession;
        if (newSession && !isAPIError(returned)) {
          await onSignInSuccess(ctx, newSession);
        } else if (isAPIError(returned) && returned.statusCode === 401) {
          await onSignInFailure(ctx);
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
