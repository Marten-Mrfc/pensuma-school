import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { eq, sql } from "drizzle-orm";
import { env } from "@/env";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { ROLES, STUDENT_EMAIL_DOMAIN } from "@/lib/auth-shared";

const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;
const SIGN_IN_PATHS = new Set(["/sign-in/username", "/sign-in/email"]);

function throttleKey(path: string, body: unknown): string | null {
  const b = (body ?? {}) as { username?: unknown; email?: unknown };
  const id = path === "/sign-in/username" ? b.username : b.email;
  return typeof id === "string" && id.trim()
    ? `${path}:${id.trim().toLowerCase()}`
    : null;
}

export const auth = betterAuth({
  appName: "Pensuma",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: async (request) => {
    const origins = [env.BETTER_AUTH_URL];
    // In development, allow any localhost port (several dev servers run side by side).
    const origin = request?.headers.get("origin");
    if (env.NODE_ENV !== "production" && origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      origins.push(origin);
    }
    return origins;
  },
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by teachers only (students) or via /setup + admin UI (teachers).
    disableSignUp: true,
    // Student PINs are 6 digits; teacher passwords are validated (min 10) in our own forms.
    minPasswordLength: 6,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12 hours: one school day
    updateAge: 60 * 60,
    cookieCache: { enabled: true, maxAge: 60 },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 300,
    customRules: {
      // Generous per-IP limits: a whole class signs in from the same school IP.
      "/sign-in/username": { window: 60, max: 120 },
      "/sign-in/email": { window: 60, max: 30 },
    },
  },
  advanced: {
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!SIGN_IN_PATHS.has(ctx.path)) return;
      const key = throttleKey(ctx.path, ctx.body);
      if (!key) return;
      const [row] = await db
        .select()
        .from(schema.loginThrottle)
        .where(eq(schema.loginThrottle.key, key));
      if (row?.lockedUntil && row.lockedUntil > new Date()) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: `Te veel mislukte pogingen. Probeer het over ${LOCK_MINUTES} minuten opnieuw of vraag je docent om hulp.`,
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (!SIGN_IN_PATHS.has(ctx.path)) return;
      const key = throttleKey(ctx.path, ctx.body);
      if (!key) return;
      const failed = ctx.context.returned instanceof APIError;
      if (!failed) {
        await db
          .delete(schema.loginThrottle)
          .where(eq(schema.loginThrottle.key, key));
        return;
      }
      await db
        .insert(schema.loginThrottle)
        .values({ key, failures: 1 })
        .onConflictDoUpdate({
          target: schema.loginThrottle.key,
          set: {
            failures: sql`${schema.loginThrottle.failures} + 1`,
            lockedUntil: sql`case when ${schema.loginThrottle.failures} + 1 >= ${MAX_FAILURES} then now() + make_interval(mins => ${LOCK_MINUTES}) else null end`,
          },
        });
    }),
  },
  plugins: [
    username({ minUsernameLength: 3, maxUsernameLength: 32 }),
    admin({ defaultRole: ROLES.student, adminRoles: [ROLES.admin] }),
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;

/** Placeholder email for a student account (better-auth requires an email). */
export function studentEmail(studentNumber: string) {
  return `${studentNumber.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}
