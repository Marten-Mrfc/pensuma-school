import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { ROLES } from "@/lib/auth-shared";
import {
  assertNoActiveHolds,
  auditAttemptsDeleted,
  HOLDS_LOCATION,
  studentsWithAttempts,
} from "@/server/api/routers/assignment";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import type { DB } from "@/server/db";
import {
  assignments,
  classes,
  classMembers,
  loginThrottle,
  session,
  studentPins,
  user,
  userActivity,
} from "@/server/db/schema";
import {
  assertNotRestricted,
  RESTRICTED_MESSAGE,
  restrictedUserIds,
} from "@/server/privacy/restriction";
import { studentThrottleKeys } from "@/server/security/login-throttle";
import { effectiveAssignmentStatus } from "@/server/services/assignment-status";
import { auditFromCtx } from "@/server/services/audit";

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

/* ---------------------- Shared with the student router --------------------- */

/**
 * Last sign-in: user_activity (kept when sessions are pruned), else the
 * newest stored session (session times are stored as UTC without zone).
 */
export const lastLoginAtSql = sql<Date | null>`coalesce(
    (select ua.last_sign_in_at from ${userActivity} ua where ua.user_id = ${user}.id),
    (select max(ls.created_at) at time zone 'UTC' from ${session} ls where ls.user_id = ${user}.id)
  )`.mapWith(userActivity.lastSignInAt);

export type LoginLock = {
  /** Set while the account is locked (too many wrong PINs). */
  loginLockedUntil: Date | null;
  /** Failed sign-ins counted since the last success or reset. */
  recentFailures: number;
};

/**
 * Current login lockouts for these student numbers (one query). Students
 * without throttle rows are missing from the map.
 */
export async function loginLocksFor(
  db: DB,
  studentNumbers: string[],
): Promise<Map<string, LoginLock>> {
  const keyToNumber = new Map<string, string>();
  for (const nr of studentNumbers) {
    if (!nr) continue;
    for (const key of studentThrottleKeys(nr)) keyToNumber.set(key, nr);
  }
  const out = new Map<string, LoginLock>();
  if (keyToNumber.size === 0) return out;
  const rows = await db
    .select({
      key: loginThrottle.key,
      failures: loginThrottle.failures,
      lockedUntil: loginThrottle.lockedUntil,
      // Compared in SQL: the column has no time zone and is set with now().
      active: sql<boolean>`coalesce(${loginThrottle.lockedUntil} > now(), false)`,
    })
    .from(loginThrottle)
    .where(inArray(loginThrottle.key, [...keyToNumber.keys()]));
  for (const row of rows) {
    const nr = keyToNumber.get(row.key);
    if (!nr) continue;
    const lock = out.get(nr) ?? { loginLockedUntil: null, recentFailures: 0 };
    lock.recentFailures = Math.max(lock.recentFailures, row.failures);
    if (
      row.active &&
      row.lockedUntil &&
      (!lock.loginLockedUntil || row.lockedUntil > lock.loginLockedUntil)
    ) {
      lock.loginLockedUntil = row.lockedUntil;
    }
    out.set(nr, lock);
  }
  return out;
}

/* --------------------------------- Helpers -------------------------------- */

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
            lastLoginAt: lastLoginAtSql,
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
      const students = members.filter((m) => m.role === ROLES.student);
      const locks = await loginLocksFor(
        ctx.db,
        students.map((m) => m.username ?? ""),
      );

      return {
        ...klas,
        assignmentCount: assignmentRows.length,
        openAssignmentCount,
        members: students.map(({ role: _role, username, banned, ...m }) => ({
          ...m,
          studentNumber: username ?? "",
          banned: banned ?? false,
          ...(locks.get(username ?? "") ?? {
            loginLockedUntil: null,
            recentFailures: 0,
          }),
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
   * and memberships; student accounts themselves are kept. Refused while a
   * retention hold covers one of its afnames or one of the students with
   * work in them; every affected student gets an audit row.
   */
  delete: adminProcedure
    .input(z.object({ id: classIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await getClassOrThrow(ctx.db, input.id);
      await ctx.db.transaction(async (tx) => {
        // Lock the class and its afnames: a hold created meanwhile waits
        // for us (and then fails) instead of being removed by the cascade.
        await tx
          .select({ id: classes.id })
          .from(classes)
          .where(eq(classes.id, input.id))
          .for("update");
        const afnames = await tx
          .select({ id: assignments.id })
          .from(assignments)
          .where(eq(assignments.classId, input.id))
          .for("update");
        const assignmentIds = afnames.map((a) => a.id);
        const students = await studentsWithAttempts(tx, assignmentIds);
        await assertNoActiveHolds(
          tx,
          { assignmentIds, userIds: students.map((s) => s.userId) },
          {
            afname: "een afname van deze klas",
            consequence: "Je kunt de klas daarom niet verwijderen.",
            remedy: `Hef de blokkade eerst op onder ${HOLDS_LOCATION}, of archiveer de klas in plaats van hem te verwijderen.`,
          },
        );
        await auditAttemptsDeleted(ctx, tx, {
          path: "class.delete",
          subjectType: "class",
          subjectId: input.id,
          details: { classId: input.id, assignmentsCount: afnames.length },
          students,
        });
        await tx.delete(classes).where(eq(classes.id, input.id));
      });
      return { id: input.id };
    }),

  /**
   * Add existing students to a class (already-members are ignored).
   * Students whose processing is restricted (AVG art. 18) are skipped and
   * counted: their klasindeling stays as it is until the restriction ends.
   */
  addMembers: adminProcedure
    .input(
      z.object({
        classId: classIdSchema,
        userIds: z
          .array(z.string().min(1).max(64))
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
      const restricted = await restrictedUserIds(ctx.db, ids);
      const allowed = students.filter((s) => !restricted.has(s.id));
      if (allowed.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            students.length === 1
              ? RESTRICTED_MESSAGE
              : "Voor deze leerlingen is de verwerking beperkt (AVG art. 18). Hef de beperking op via Privacy & gegevens.",
        });
      }
      const inserted = await ctx.db
        .insert(classMembers)
        .values(allowed.map((s) => ({ classId: input.classId, userId: s.id })))
        .onConflictDoNothing()
        .returning({ userId: classMembers.userId });
      return {
        added: inserted.length,
        alreadyMember: allowed.length - inserted.length,
        skippedRestricted: students.length - allowed.length,
      };
    }),

  /**
   * Remove a student from a class (the account itself stays). Refused
   * while the student's processing is restricted (AVG art. 18), unless
   * the teacher overrides it (recorded in the log).
   */
  removeMember: adminProcedure
    .input(
      z.object({
        classId: classIdSchema,
        userId: z.string().min(1).max(64),
        /** Remove anyway while the processing is restricted (AVG art. 18). */
        overrideRestriction: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [member] = await ctx.db
        .select({ userId: classMembers.userId, studentNumber: user.username })
        .from(classMembers)
        .innerJoin(user, eq(user.id, classMembers.userId))
        .where(
          and(
            eq(classMembers.classId, input.classId),
            eq(classMembers.userId, input.userId),
          ),
        );
      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze leerling zit niet (meer) in deze klas.",
        });
      }
      const overridden = await assertNotRestricted(ctx.db, input.userId, {
        override: input.overrideRestriction,
      });
      await ctx.db.transaction(async (tx) => {
        await tx
          .delete(classMembers)
          .where(
            and(
              eq(classMembers.classId, input.classId),
              eq(classMembers.userId, input.userId),
            ),
          );
        if (overridden) {
          await auditFromCtx(
            ctx,
            {
              action: "trpc.mutation",
              subjectType: "class",
              subjectId: input.classId,
              subjectUserId: input.userId,
              subjectLabel: member.studentNumber,
              details: {
                path: "class.removeMember",
                classId: input.classId,
                restrictionOverridden: true,
              },
            },
            tx,
          );
        }
      });
      return { classId: input.classId, userId: input.userId };
    }),
});
