/**
 * Faciliteiten (accommodations) per student: verlengde tijd, always allow
 * paste, don't log window switches. Set once, applied to every test.
 * Facilities only: never a reason or diagnosis (AVG art. 5 and 9).
 * Teachers only.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ROLES } from "@/lib/auth-shared";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import type { DB } from "@/server/db";
import { classMembers, studentAccommodations, user } from "@/server/db/schema";
import { auditFromCtx } from "@/server/services/audit";

export type Accommodation = {
  extraTimePercent: number;
  allowPaste: boolean;
  ignoreFocusEvents: boolean;
};

const userIdSchema = z.string().min(1, "Ongeldige leerling.").max(64);
const percentSchema = z
  .number()
  .int("Kies een heel percentage.")
  .min(0, "Het percentage kan niet negatief zijn.")
  .max(100, "Verlengde tijd kan hoogstens +100% zijn.");

const isDefault = (a: Accommodation) =>
  a.extraTimePercent === 0 && !a.allowPaste && !a.ignoreFocusEvents;

async function requireStudent(db: DB, id: string) {
  const [row] = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(and(eq(user.id, id), eq(user.role, ROLES.student)));
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Leerling niet gevonden.",
    });
  }
  return row;
}

/** Accommodations of these students (only rows that exist). */
export async function accommodationsFor(
  db: DB,
  userIds: string[],
): Promise<Map<string, Accommodation>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: studentAccommodations.userId,
      extraTimePercent: studentAccommodations.extraTimePercent,
      allowPaste: studentAccommodations.allowPaste,
      ignoreFocusEvents: studentAccommodations.ignoreFocusEvents,
    })
    .from(studentAccommodations)
    .where(inArray(studentAccommodations.userId, userIds));
  return new Map(rows.map(({ userId, ...a }) => [userId, a]));
}

export const accommodationRouter = createTRPCRouter({
  get: adminProcedure
    .input(z.object({ userId: userIdSchema }))
    .query(async ({ ctx, input }) => {
      await requireStudent(ctx.db, input.userId);
      const found = await accommodationsFor(ctx.db, [input.userId]);
      return found.get(input.userId) ?? null;
    }),

  /** Save one student's facilities. All defaults → the row is removed. */
  set: adminProcedure
    .input(
      z.object({
        userId: userIdSchema,
        extraTimePercent: percentSchema,
        allowPaste: z.boolean(),
        ignoreFocusEvents: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const student = await requireStudent(ctx.db, input.userId);
      const value: Accommodation = {
        extraTimePercent: input.extraTimePercent,
        allowPaste: input.allowPaste,
        ignoreFocusEvents: input.ignoreFocusEvents,
      };
      await ctx.db.transaction(async (tx) => {
        if (isDefault(value)) {
          await tx
            .delete(studentAccommodations)
            .where(eq(studentAccommodations.userId, student.id));
        } else {
          await tx
            .insert(studentAccommodations)
            .values({ userId: student.id, ...value, updatedById: ctx.user.id })
            .onConflictDoUpdate({
              target: studentAccommodations.userId,
              set: { ...value, updatedById: ctx.user.id },
            });
        }
        await auditFromCtx(
          ctx,
          {
            action: "student.accommodation_updated",
            subjectType: "student",
            subjectId: student.id,
            subjectUserId: student.id,
            subjectLabel: student.username ?? null,
            details: { ...value },
          },
          tx,
        );
      });
      return isDefault(value) ? null : value;
    }),

  /** Set only the verlengde tijd for several students at once. */
  setMany: adminProcedure
    .input(
      z.object({
        userIds: z
          .array(userIdSchema)
          .min(1, "Kies minstens één leerling.")
          .max(500, "Je kunt maximaal 500 leerlingen tegelijk aanpassen."),
        extraTimePercent: percentSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ids = [...new Set(input.userIds)];
      const students = await ctx.db
        .select({ id: user.id, username: user.username })
        .from(user)
        .where(and(inArray(user.id, ids), eq(user.role, ROLES.student)));
      if (students.length !== ids.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Een of meer leerlingen bestaan niet (meer).",
        });
      }
      const current = await accommodationsFor(ctx.db, ids);
      await ctx.db.transaction(async (tx) => {
        for (const student of students) {
          const value: Accommodation = {
            allowPaste: false,
            ignoreFocusEvents: false,
            ...current.get(student.id),
            extraTimePercent: input.extraTimePercent,
          };
          if (isDefault(value)) {
            await tx
              .delete(studentAccommodations)
              .where(eq(studentAccommodations.userId, student.id));
          } else {
            await tx
              .insert(studentAccommodations)
              .values({
                userId: student.id,
                ...value,
                updatedById: ctx.user.id,
              })
              .onConflictDoUpdate({
                target: studentAccommodations.userId,
                set: {
                  extraTimePercent: value.extraTimePercent,
                  updatedById: ctx.user.id,
                },
              });
          }
          await auditFromCtx(
            ctx,
            {
              action: "student.accommodation_updated",
              subjectType: "student",
              subjectId: student.id,
              subjectUserId: student.id,
              subjectLabel: student.username ?? null,
              details: { ...value },
            },
            tx,
          );
        }
      });
      return { updated: students.length };
    }),

  /** Facilities of the students in a class, keyed by user id. */
  listForClass: adminProcedure
    .input(z.object({ classId: z.uuid("Ongeldige klas.") }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          userId: studentAccommodations.userId,
          extraTimePercent: studentAccommodations.extraTimePercent,
          allowPaste: studentAccommodations.allowPaste,
          ignoreFocusEvents: studentAccommodations.ignoreFocusEvents,
        })
        .from(studentAccommodations)
        .innerJoin(
          classMembers,
          eq(classMembers.userId, studentAccommodations.userId),
        )
        .where(eq(classMembers.classId, input.classId));
      const out: Record<string, Accommodation> = {};
      for (const { userId, ...a } of rows) out[userId] = a;
      return out;
    }),
});
