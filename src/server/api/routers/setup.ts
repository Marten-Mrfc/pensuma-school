import { createHash, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { ROLES } from "@/lib/auth-shared";
import { validateTeacherPassword } from "@/lib/security/password-policy";
import {
  adminProcedure,
  createTRPCRouter,
  publicProcedure,
} from "@/server/api/trpc";
import type { DB } from "@/server/db";
import { appSettings, user } from "@/server/db/schema";
import { loadDemoData } from "@/server/demo";
import { createAdminAccount } from "@/server/services/accounts";
import { type AuditDb, auditSystem } from "@/server/services/audit";

/**
 * First-run setup: create the very first teacher account.
 *
 * Setup is complete once app_setting "setup_completed_at" exists or any
 * teacher exists (older installs get the flag backfilled). It never
 * reopens: recover a lost account with `bun run admin:create`.
 * In production (or whenever SETUP_TOKEN is set) the installer must enter
 * SETUP_TOKEN, so a fresh deployment cannot be claimed by a stranger.
 */

export const SETUP_COMPLETED_KEY = "setup_completed_at";

/** Serialises concurrent setup attempts (pg_advisory_xact_lock). */
const SETUP_LOCK = "pensuma:setup";

async function adminExists(db: AuditDb | DB) {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, ROLES.admin))
    .limit(1);
  return rows.length > 0;
}

async function flagExists(db: AuditDb | DB) {
  const rows = await db
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(eq(appSettings.key, SETUP_COMPLETED_KEY))
    .limit(1);
  return rows.length > 0;
}

async function markCompleted(db: AuditDb | DB, userId: string | null) {
  await db
    .insert(appSettings)
    .values({
      key: SETUP_COMPLETED_KEY,
      value: { completedAt: new Date().toISOString() },
      updatedById: userId,
    })
    .onConflictDoNothing();
}

export function setupTokenRequired(): boolean {
  return env.NODE_ENV === "production" || !!env.SETUP_TOKEN;
}

/** Constant-time comparison (hashing first equalises the lengths). */
function tokenMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

const ALREADY_SET_UP = "Pensuma is al ingesteld. Log in met je docentaccount.";

const createFirstAdminInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Vul je naam in.")
      .max(100, "Je naam is te lang."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "Dit e-mailadres is te lang.")
      .pipe(z.email("Vul een geldig e-mailadres in.")),
    password: z.string().max(1000),
    setupToken: z.string().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    const result = validateTeacherPassword(value.password, {
      email: value.email,
      name: value.name,
    });
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: result.message,
      });
    }
  });

export const setupRouter = createTRPCRouter({
  status: publicProcedure.query(async ({ ctx }) => {
    let needsSetup = !(await flagExists(ctx.db));
    if (needsSetup && (await adminExists(ctx.db))) {
      // Installed before the flag existed: record it now.
      await markCompleted(ctx.db, null);
      needsSetup = false;
    }
    return { needsSetup, tokenRequired: setupTokenRequired() };
  }),

  createFirstAdmin: publicProcedure
    .input(createFirstAdminInput)
    .mutation(async ({ ctx, input }) => {
      if (setupTokenRequired()) {
        if (!env.SETUP_TOKEN) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "De installatie is vergrendeld. Zet SETUP_TOKEN in de serveromgeving.",
          });
        }
        if (
          !input.setupToken ||
          !tokenMatches(input.setupToken, env.SETUP_TOKEN)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "De installatiecode klopt niet.",
          });
        }
      }

      return ctx.db.transaction(async (tx) => {
        // Held until this transaction ends: a second request waits here
        // and then sees the first teacher.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${SETUP_LOCK}))`,
        );
        if ((await flagExists(tx)) || (await adminExists(tx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: ALREADY_SET_UP });
        }
        const [taken] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, input.email))
          .limit(1);
        if (taken) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Er bestaat al een account met dit e-mailadres.",
          });
        }
        // createAdminAccount uses better-auth's adapter on its own
        // connection, so the account commits outside this transaction.
        // That is safe: the advisory lock still serialises setup, and if
        // the flag insert below fails, "an admin exists" keeps setup closed
        // (status backfills the flag).
        const created = await createAdminAccount({
          name: input.name,
          email: input.email,
          password: input.password,
        });
        await markCompleted(tx, created.id);
        await auditSystem(tx, {
          action: "auth.setup_completed",
          subjectType: "staff",
          subjectId: created.id,
        });
        return { id: created.id, email: created.email };
      });
    }),

  /** Teachers: create the demo class, students, demo test and practice assignment (idempotent). */
  loadDemoData: adminProcedure.mutation(async ({ ctx }) =>
    loadDemoData(ctx.user.id),
  ),
});
