import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { ROLES } from "@/lib/auth-shared";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import type { DB } from "@/server/db";
import {
  assignments,
  classes,
  classMembers,
  session,
  studentPins,
  user,
} from "@/server/db/schema";
import { effectiveAssignmentStatus } from "@/server/services/assignment-status";

/** Klassen (classes) and their members. Teachers only. */

const classIdSchema = z.uuid("Ongeldige klas.");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Geef de klas een naam.")
  .max(60, "De naam mag maximaal 60 tekens hebben.");

/** Optional text: empty string → null. */
const optionalText = (maxLength: number, message: string) =>
  z
    .string()
    .trim()
    .max(maxLength, message)
    .nullish()
    .transform((v) => (v ? v : null));

const schoolYearSchema = optionalText(
  20,
  "Het schooljaar mag maximaal 20 tekens hebben.",
);
const descriptionSchema = optionalText(
  500,
  "De omschrijving mag maximaal 500 tekens hebben.",
);

/** Load a class or throw NOT_FOUND. */
export async function getClassOrThrow(db: DB, id: string) {
  const [row] = await db.select().from(classes).where(eq(classes.id, id));
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze klas bestaat niet (meer).",
    });
  }
  return row;
}

async function assertUniqueName(
  db: DB,
  name: string,
  schoolYear: string | null,
  exceptId?: string,
) {
  const [dupe] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(
      and(
        sql`lower(${classes.name}) = lower(${name})`,
        schoolYear
          ? eq(classes.schoolYear, schoolYear)
          : isNull(classes.schoolYear),
        exceptId ? ne(classes.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (dupe) {
    throw new TRPCError({
      code: "CONFLICT",
      message: schoolYear
        ? `Er bestaat al een klas "${name}" in schooljaar ${schoolYear}.`
        : `Er bestaat al een klas "${name}".`,
    });
  }
}

export const classRouter = createTRPCRouter({
  /** All classes with member and assignment counts. */
  list: adminProcedure
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(classes)
        .where(input?.includeArchived ? undefined : eq(classes.archived, false))
        .orderBy(
          asc(classes.archived),
          sql`${classes.schoolYear} desc nulls last`,
          asc(classes.name),
        );
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const [memberCounts, assignmentRows] = await Promise.all([
        ctx.db
          .select({
            classId: classMembers.classId,
            count: sql<number>`count(*)::int`,
          })
          .from(classMembers)
          .innerJoin(user, eq(user.id, classMembers.userId))
          .where(
            and(
              inArray(classMembers.classId, ids),
              eq(user.role, ROLES.student),
            ),
          )
          .groupBy(classMembers.classId),
        ctx.db
          .select({
            classId: assignments.classId,
            status: assignments.status,
            opensAt: assignments.opensAt,
            closesAt: assignments.closesAt,
          })
          .from(assignments)
          .where(inArray(assignments.classId, ids)),
      ]);

      const studentCount = new Map(
        memberCounts.map((m) => [m.classId, m.count]),
      );
      const now = new Date();
      const counts = new Map<
        string,
        { open: number; planned: number; total: number }
      >();
      for (const a of assignmentRows) {
        const c = counts.get(a.classId) ?? { open: 0, planned: 0, total: 0 };
        const status = effectiveAssignmentStatus(a, now);
        c.total++;
        if (status === "open") c.open++;
        if (status === "planned") c.planned++;
        counts.set(a.classId, c);
      }

      return rows.map((r) => {
        const c = counts.get(r.id) ?? { open: 0, planned: 0, total: 0 };
        return {
          ...r,
          studentCount: studentCount.get(r.id) ?? 0,
          openAssignmentCount: c.open,
          plannedAssignmentCount: c.planned,
          assignmentCount: c.total,
        };
      });
    }),

  /** One class with its members (students first by name). */
  get: adminProcedure
    .input(z.object({ id: classIdSchema }))
    .query(async ({ ctx, input }) => {
      const klas = await getClassOrThrow(ctx.db, input.id);

      const [members, assignmentRows] = await Promise.all([
        ctx.db
          .select({
            id: user.id,
            name: user.name,
            username: user.username,
            role: user.role,
            banned: user.banned,
            createdAt: user.createdAt,
            addedAt: classMembers.createdAt,
            hasPin: sql<boolean>`${studentPins.userId} is not null`,
            lastLoginAt:
              sql<Date | null>`(select max(ls.created_at) from ${session} ls where ls.user_id = ${user}.id)`.mapWith(
                session.createdAt,
              ),
          })
          .from(classMembers)
          .innerJoin(user, eq(user.id, classMembers.userId))
          .leftJoin(studentPins, eq(studentPins.userId, user.id))
          .where(eq(classMembers.classId, input.id))
          .orderBy(asc(user.name)),
        ctx.db
          .select({
            status: assignments.status,
            opensAt: assignments.opensAt,
            closesAt: assignments.closesAt,
          })
          .from(assignments)
          .where(eq(assignments.classId, input.id)),
      ]);

      const now = new Date();
      const openAssignmentCount = assignmentRows.filter(
        (a) => effectiveAssignmentStatus(a, now) === "open",
      ).length;

      return {
        ...klas,
        assignmentCount: assignmentRows.length,
        openAssignmentCount,
        members: members
          .filter((m) => m.role === ROLES.student)
          .map(({ role: _role, username, banned, ...m }) => ({
            ...m,
            studentNumber: username ?? "",
            banned: banned ?? false,
          })),
      };
    }),

  create: adminProcedure
    .input(
      z.object({
        name: nameSchema,
        schoolYear: schoolYearSchema,
        description: descriptionSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertUniqueName(ctx.db, input.name, input.schoolYear);
      const [created] = await ctx.db
        .insert(classes)
        .values({
          name: input.name,
          schoolYear: input.schoolYear,
          description: input.description,
        })
        .returning();
      return created;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: classIdSchema,
        name: nameSchema.optional(),
        schoolYear: schoolYearSchema.optional(),
        description: descriptionSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const current = await getClassOrThrow(ctx.db, input.id);
      const name = input.name ?? current.name;
      const schoolYear =
        input.schoolYear === undefined ? current.schoolYear : input.schoolYear;
      if (
        name.toLowerCase() !== current.name.toLowerCase() ||
        schoolYear !== current.schoolYear
      ) {
        await assertUniqueName(ctx.db, name, schoolYear, input.id);
      }
      const [updated] = await ctx.db
        .update(classes)
        .set({
          name,
          schoolYear,
          description:
            input.description === undefined
              ? current.description
              : input.description,
        })
        .where(eq(classes.id, input.id))
        .returning();
      return updated;
    }),

  setArchived: adminProcedure
    .input(z.object({ id: classIdSchema, archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await getClassOrThrow(ctx.db, input.id);
      const [updated] = await ctx.db
        .update(classes)
        .set({ archived: input.archived })
        .where(eq(classes.id, input.id))
        .returning();
      return updated;
    }),

  /**
   * Delete a class. Cascades to its assignments (and their attempts/answers)
   * and memberships; student accounts themselves are kept.
   */
  delete: adminProcedure
    .input(z.object({ id: classIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await getClassOrThrow(ctx.db, input.id);
      await ctx.db.delete(classes).where(eq(classes.id, input.id));
      return { id: input.id };
    }),

  /** Add existing students to a class (already-members are ignored). */
  addMembers: adminProcedure
    .input(
      z.object({
        classId: classIdSchema,
        userIds: z
          .array(z.string().min(1))
          .min(1, "Kies minstens één leerling.")
          .max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getClassOrThrow(ctx.db, input.classId);
      const ids = [...new Set(input.userIds)];
      const students = await ctx.db
        .select({ id: user.id })
        .from(user)
        .where(and(inArray(user.id, ids), eq(user.role, ROLES.student)));
      if (students.length !== ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Een of meer gekozen leerlingen bestaan niet (meer).",
        });
      }
      const inserted = await ctx.db
        .insert(classMembers)
        .values(students.map((s) => ({ classId: input.classId, userId: s.id })))
        .onConflictDoNothing()
        .returning({ userId: classMembers.userId });
      return {
        added: inserted.length,
        alreadyMember: ids.length - inserted.length,
      };
    }),

  /** Remove a student from a class (the account itself stays). */
  removeMember: adminProcedure
    .input(z.object({ classId: classIdSchema, userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const removed = await ctx.db
        .delete(classMembers)
        .where(
          and(
            eq(classMembers.classId, input.classId),
            eq(classMembers.userId, input.userId),
          ),
        )
        .returning({ userId: classMembers.userId });
      if (removed.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze leerling zit niet (meer) in deze klas.",
        });
      }
      return { classId: input.classId, userId: input.userId };
    }),
});
