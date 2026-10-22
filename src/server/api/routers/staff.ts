import { TRPCError } from "@trpc/server";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { ZodRealError, z } from "zod";
import { ADMIN_MAX_PASSWORD_LENGTH, ROLES } from "@/lib/auth-shared";
import { validateTeacherPassword } from "@/lib/security/password-policy";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { auth } from "@/server/auth";
import type { DB } from "@/server/db";
import { account, session, user, userActivity } from "@/server/db/schema";
import { generateTemporaryPassword } from "@/server/security/temporary-password";
import {
  createAdminAccount,
  setAccountPassword,
} from "@/server/services/accounts";
import { auditFromCtx } from "@/server/services/audit";

/** Docent (teacher) accounts. Teachers only. */

const userIdSchema = z
  .string()
  .min(1, "Ongeldige docent.")
  .max(64, "Ongeldige docent.");

const nameSchema = z
  .string()
  .trim()
  .min(2, "Vul de naam van de docent in.")
  .max(100, "De naam is te lang.");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Dit e-mailadres is te lang.")
  .pipe(z.email("Vul een geldig e-mailadres in."));

const WRONG_CURRENT_PASSWORD = "Je huidige wachtwoord klopt niet.";

/** Serialises teacher removals (pg_advisory_xact_lock). */
const STAFF_REMOVE_LOCK = "pensuma:staff-remove";

/** BAD_REQUEST whose zodError points at one field (shown under it). */
function fieldError(field: string, message: string) {
  return new TRPCError({
    code: "BAD_REQUEST",
    message,
    cause: new ZodRealError([
      { code: "custom", path: [field], message, input: undefined },
    ]),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getTeacherOrThrow(db: DB, id: string) {
  const [row] = await db
    .select()
    .from(user)
    .where(and(eq(user.id, id), eq(user.role, ROLES.admin)));
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze docent bestaat niet (meer).",
    });
  }
  return row;
}

/** Last sign-in: user_activity, else the newest session (older installs). */
const lastLoginAt =
  sql<Date | null>`coalesce(${userActivity.lastSignInAt}, (select max(ls.created_at) from ${session} ls where ls.user_id = ${user}.id))`.mapWith(
    session.createdAt,
  );

export const staffRouter = createTRPCRouter({
  /** All teacher accounts. */
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        passwordChangeRequired: user.passwordChangeRequired,
        lastLoginAt,
      })
      .from(user)
      .leftJoin(userActivity, eq(userActivity.userId, user.id))
      .where(eq(user.role, ROLES.admin))
      .orderBy(asc(user.name));
    return rows.map((r) => ({ ...r, isMe: r.id === ctx.user.id }));
  }),

  /** The signed-in teacher's own profile (also with a temporary password). */
  me: adminProcedure
    .meta({ allowWithPendingPasswordChange: true })
    .query(async ({ ctx }) => {
      const [row] = await ctx.db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          passwordChangeRequired: user.passwordChangeRequired,
        })
        .from(user)
        .where(eq(user.id, ctx.user.id));
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Je account bestaat niet (meer).",
        });
      const [{ sessions }] = await ctx.db
        .select({ sessions: sql<number>`count(*)::int` })
        .from(session)
        .where(
          and(
            eq(session.userId, ctx.user.id),
            sql`${session.expiresAt} > now()`,
          ),
        );
      return { ...row, activeSessions: sessions };
    }),

  /**
   * Add a teacher. Without a password a readable temporary one is generated
   * and returned once (`temporaryPassword`); the teacher must replace it at
   * the first sign-in.
   */
  create: adminProcedure
    .input(
      z
        .object({
          name: nameSchema,
          email: emailSchema,
          password: z.string().max(1000).optional(),
        })
        .superRefine((value, refine) => {
          if (value.password === undefined) return;
          const result = validateTeacherPassword(value.password, {
            email: value.email,
            name: value.name,
          });
          if (!result.ok) {
            refine.addIssue({
              code: "custom",
              path: ["password"],
              message: result.message,
            });
          }
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, input.email));
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Er bestaat al een account met dit e-mailadres.",
        });
      }
      const temporaryPassword = input.password
        ? null
        : generateTemporaryPassword();
      const created = await createAdminAccount({
        name: input.name,
        email: input.email,
        password: input.password ?? (temporaryPassword as string),
      });
      if (temporaryPassword) {
        await ctx.db
          .update(user)
          .set({ passwordChangeRequired: true })
          .where(eq(user.id, created.id));
      }
      await auditFromCtx(ctx, {
        action: "staff.created",
        subjectType: "staff",
        subjectId: created.id,
        subjectLabel: created.email,
        details: { passwordChangeRequired: !!temporaryPassword },
      });
      return {
        user: { id: created.id, name: created.name, email: created.email },
        temporaryPassword,
      };
    }),

  /** Give another teacher a new temporary password (signs them out). */
  resetPassword: adminProcedure
    .input(z.object({ id: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Je eigen wachtwoord wijzig je via Mijn account.",
        });
      }
      const teacher = await getTeacherOrThrow(ctx.db, input.id);
      const password = generateTemporaryPassword();
      await setAccountPassword(teacher.id, password);
      await ctx.db
        .update(user)
        .set({ passwordChangeRequired: true })
        .where(eq(user.id, teacher.id));
      await auditFromCtx(ctx, {
        action: "staff.password_reset",
        subjectType: "staff",
        subjectId: teacher.id,
        subjectLabel: teacher.email,
      });
      return {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        password,
      };
    }),

  /**
   * Change your own password. Works with a pending temporary password (it
   * is how the teacher gets out of that state). Signs out every other
   * session of this teacher.
   */
  changeMyPassword: adminProcedure
    .meta({ allowWithPendingPasswordChange: true })
    .input(
      z.object({
        currentPassword: z
          .string()
          .min(1, "Vul je huidige wachtwoord in.")
          .max(ADMIN_MAX_PASSWORD_LENGTH, WRONG_CURRENT_PASSWORD),
        newPassword: z.string().max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const authContext = await auth.$context;
      const [credential] = await ctx.db
        .select({ id: account.id, password: account.password })
        .from(account)
        .where(
          and(
            eq(account.userId, ctx.user.id),
            eq(account.providerId, "credential"),
          ),
        )
        .limit(1);
      const valid = credential?.password
        ? await authContext.password.verify({
            hash: credential.password,
            password: input.currentPassword,
          })
        : false;
      if (!credential || !valid) {
        // Slows down guessing with a stolen session.
        await sleep(400);
        throw fieldError("currentPassword", WRONG_CURRENT_PASSWORD);
      }
      if (input.newPassword === input.currentPassword) {
        throw fieldError(
          "newPassword",
          "Kies een ander wachtwoord dan je huidige.",
        );
      }
      const policy = validateTeacherPassword(input.newPassword, {
        email: ctx.user.email,
        name: ctx.user.name,
      });
      if (!policy.ok) throw fieldError("newPassword", policy.message);

      const hash = await authContext.password.hash(input.newPassword);
      const currentSessionId = ctx.session.session.id;
      const signedOut = await ctx.db.transaction(async (tx) => {
        await tx
          .update(account)
          .set({ password: hash })
          .where(eq(account.id, credential.id));
        await tx
          .update(user)
          .set({ passwordChangeRequired: false })
          .where(eq(user.id, ctx.user.id));
        const removed = await tx
          .delete(session)
          .where(
            and(
              eq(session.userId, ctx.user.id),
              ne(session.id, currentSessionId),
            ),
          )
          .returning({ id: session.id });
        await auditFromCtx(
          ctx,
          {
            action: "auth.password_changed",
            subjectType: "staff",
            subjectId: ctx.user.id,
            details: { otherSessionsCount: removed.length },
          },
          tx,
        );
        return removed.length;
      });
      return { ok: true as const, otherSessionsSignedOut: signedOut };
    }),

  /** Sign out all your other sessions (this one stays signed in). */
  signOutOtherSessions: adminProcedure.mutation(async ({ ctx }) => {
    const removed = await ctx.db
      .delete(session)
      .where(
        and(
          eq(session.userId, ctx.user.id),
          ne(session.id, ctx.session.session.id),
        ),
      )
      .returning({ id: session.id });
    return { signedOut: removed.length };
  }),

  /** Remove a teacher account (not yourself; at least one teacher remains). */
  remove: adminProcedure
    .input(z.object({ id: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Je kunt je eigen account niet verwijderen.",
        });
      }
      const teacher = await getTeacherOrThrow(ctx.db, input.id);
      await ctx.db.transaction(async (tx) => {
        // Two teachers removing each other at the same moment must not
        // leave nobody: count and delete under one lock.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${STAFF_REMOVE_LOCK}))`,
        );
        const [{ others }] = await tx
          .select({ others: sql<number>`count(*)::int` })
          .from(user)
          .where(and(eq(user.role, ROLES.admin), ne(user.id, input.id)));
        if (others < 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Er moet minstens één docent overblijven.",
          });
        }
        await tx.delete(user).where(eq(user.id, input.id));
        await auditFromCtx(
          ctx,
          {
            action: "staff.removed",
            subjectType: "staff",
            subjectId: teacher.id,
            subjectLabel: teacher.email,
          },
          tx,
        );
      });
      return { id: input.id };
    }),

  /** Change your own display name. */
  updateMe: adminProcedure
    .input(
      z.object({
        name: z
          .string()
          .trim()
          .min(2, "Vul je naam in.")
          .max(100, "Je naam is te lang."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(user)
        .set({ name: input.name })
        .where(eq(user.id, ctx.user.id))
        .returning({ id: user.id, name: user.name, email: user.email });
      return updated;
    }),
});
