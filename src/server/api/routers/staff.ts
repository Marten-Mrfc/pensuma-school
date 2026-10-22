import { randomInt } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { ADMIN_MIN_PASSWORD_LENGTH, ROLES } from "@/lib/auth-shared";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import type { DB } from "@/server/db";
import { session, user } from "@/server/db/schema";
import {
  createAdminAccount,
  setAccountPassword,
} from "@/server/services/accounts";

/** Docent (teacher) accounts. Teachers only. */

/** Short, unambiguous Dutch words for readable temporary passwords. */
const WORDS = [
  "appel",
  "banaan",
  "beker",
  "berg",
  "bloem",
  "boom",
  "brug",
  "bus",
  "das",
  "deur",
  "dijk",
  "duin",
  "eend",
  "fiets",
  "fluit",
  "gans",
  "gitaar",
  "haven",
  "hek",
  "hond",
  "huis",
  "jas",
  "kaas",
  "kade",
  "kam",
  "kast",
  "kat",
  "kerk",
  "klok",
  "koe",
  "kom",
  "kraan",
  "kroon",
  "lamp",
  "leeuw",
  "maan",
  "mand",
  "meer",
  "mol",
  "muur",
  "nest",
  "noot",
  "oven",
  "paard",
  "pan",
  "pen",
  "peer",
  "plant",
  "pomp",
  "raam",
  "regen",
  "ring",
  "rots",
  "schip",
  "sjaal",
  "slak",
  "sleutel",
  "sok",
  "spin",
  "stad",
  "stoel",
  "storm",
  "strand",
  "tafel",
  "tak",
  "tent",
  "tijger",
  "toren",
  "trein",
  "tuin",
  "uil",
  "vaas",
  "veer",
  "vis",
  "vlag",
  "vos",
  "vuur",
  "wagen",
  "wiel",
  "wolk",
  "zaag",
  "zand",
  "zebra",
  "zee",
  "zeil",
  "zon",
  "zwaan",
];

/** e.g. "tafel-wolk-trein-47" (≥ ADMIN_MIN_PASSWORD_LENGTH, easy to read aloud). */
export function generateTemporaryPassword(): string {
  for (;;) {
    const words = Array.from(
      { length: 3 },
      () => WORDS[randomInt(WORDS.length)],
    );
    const password = `${words.join("-")}-${randomInt(10, 100)}`;
    if (password.length >= ADMIN_MIN_PASSWORD_LENGTH) return password;
  }
}

const userIdSchema = z.string().min(1, "Ongeldige docent.");

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

const lastLoginAt =
  sql<Date | null>`(select max(ls.created_at) from ${session} ls where ls.user_id = ${user}.id)`.mapWith(
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
        lastLoginAt,
      })
      .from(user)
      .where(eq(user.role, ROLES.admin))
      .orderBy(asc(user.name));
    return rows.map((r) => ({ ...r, isMe: r.id === ctx.user.id }));
  }),

  /** The signed-in teacher's own profile. */
  me: adminProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
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
        and(eq(session.userId, ctx.user.id), sql`${session.expiresAt} > now()`),
      );
    return { ...row, activeSessions: sessions };
  }),

  /**
   * Add a teacher. Without a password a readable temporary one is generated
   * and returned once (`temporaryPassword`).
   */
  create: adminProcedure
    .input(
      z.object({
        name: z
          .string()
          .trim()
          .min(2, "Vul de naam van de docent in.")
          .max(100, "De naam is te lang."),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .pipe(z.email("Vul een geldig e-mailadres in.")),
        password: z
          .string()
          .min(
            ADMIN_MIN_PASSWORD_LENGTH,
            `Het wachtwoord moet minstens ${ADMIN_MIN_PASSWORD_LENGTH} tekens hebben.`,
          )
          .max(128, "Het wachtwoord is te lang.")
          .optional(),
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
      return {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        password,
      };
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
      await getTeacherOrThrow(ctx.db, input.id);
      const [{ others }] = await ctx.db
        .select({ others: sql<number>`count(*)::int` })
        .from(user)
        .where(and(eq(user.role, ROLES.admin), ne(user.id, input.id)));
      if (others < 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Er moet minstens één docent overblijven.",
        });
      }
      await ctx.db.delete(user).where(eq(user.id, input.id));
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
