import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ROLES,
  STUDENT_NUMBER_REGEX,
  STUDENT_PIN_REGEX,
} from "@/lib/auth-shared";
import {
  MAX_IMPORT_ROWS,
  MAX_STUDENT_NAME_LENGTH,
  normalizeCell,
} from "@/lib/import/parse-students";
import { getClassOrThrow } from "@/server/api/routers/class";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { studentEmail } from "@/server/auth";
import type { DB } from "@/server/db";
import {
  account,
  assignments,
  attempts,
  classes,
  classMembers,
  session,
  studentPins,
  tests,
  user,
} from "@/server/db/schema";
import {
  createStudentAccount,
  getStudentPin,
  resetStudentPin,
} from "@/server/services/accounts";

/** Leerlingen (student accounts), PIN codes and import. Teachers only. */

/* --------------------------------- Inputs --------------------------------- */

const studentNumberSchema = z
  .string()
  .trim()
  .regex(
    STUDENT_NUMBER_REGEX,
    "Een leerlingnummer bestaat uit 3 tot 12 cijfers.",
  );

const studentNameSchema = z
  .string()
  .transform(normalizeCell)
  .pipe(
    z
      .string()
      .min(1, "Vul de naam van de leerling in.")
      .max(
        MAX_STUDENT_NAME_LENGTH,
        `De naam mag maximaal ${MAX_STUDENT_NAME_LENGTH} tekens hebben.`,
      ),
  );

const pinSchema = z
  .string()
  .trim()
  .regex(STUDENT_PIN_REGEX, "Een pincode bestaat uit precies 6 cijfers.");

const userIdSchema = z.string().min(1, "Ongeldige leerling.");

/* -------------------------------- Helpers --------------------------------- */

/** Students who are not deactivated. */
const isActive = sql`coalesce(${user.banned}, false) = false`;

/** Most recent sign-in (session start), if any session is still stored. */
const lastLoginAt =
  sql<Date | null>`(select max(ls.created_at) from ${session} ls where ls.user_id = ${user}.id)`.mapWith(
    session.createdAt,
  );
const hasPin = sql<boolean>`exists(select 1 from ${studentPins} sp where sp.user_id = ${user}.id)`;

/** Escape LIKE wildcards in user input. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function getStudentOrThrow(db: DB, id: string) {
  const [row] = await db
    .select()
    .from(user)
    .where(and(eq(user.id, id), eq(user.role, ROLES.student)));
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deze leerling bestaat niet (meer).",
    });
  }
  return row;
}

/** Run `fn` over `items` with limited concurrency, keeping order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/** Password hashing is CPU-bound; a few at a time keeps the server responsive. */
const ACCOUNT_CONCURRENCY = 4;

/**
 * Create a student account and never leave a half-created user behind: if
 * any step after inserting the user fails, the user row is removed again.
 * Callers must have checked up front that the number/email are free.
 */
async function createStudentSafely(
  db: DB,
  input: { studentNumber: string; name: string; pin?: string },
) {
  const startedAt = new Date(Date.now() - 1000);
  try {
    return await createStudentAccount(input);
  } catch (error) {
    const email = studentEmail(input.studentNumber);
    const [partial] = await db
      .select({
        id: user.id,
        createdAt: user.createdAt,
        hasAccount: sql<boolean>`exists(select 1 from ${account} ac where ac.user_id = ${user}.id)`,
        hasPin,
      })
      .from(user)
      .where(eq(user.email, email));
    if (
      partial &&
      partial.createdAt >= startedAt &&
      !(partial.hasAccount && partial.hasPin)
    ) {
      await db.delete(user).where(eq(user.id, partial.id));
    }
    console.error(`[student] creating ${input.studentNumber} failed`, error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Het account voor leerlingnummer ${input.studentNumber} kon niet worden aangemaakt.`,
    });
  }
}

/** Users that already use these student numbers (as username or placeholder email). */
async function findByNumbers(db: DB, numbers: string[]) {
  if (numbers.length === 0)
    return new Map<
      string,
      { id: string; name: string; role: string; banned: boolean }
    >();
  const lower = numbers.map((n) => n.toLowerCase());
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      role: user.role,
      banned: user.banned,
      username: user.username,
      email: user.email,
    })
    .from(user)
    .where(
      or(
        inArray(user.username, lower),
        inArray(user.email, lower.map(studentEmail)),
      ),
    );
  const byNumber = new Map<
    string,
    { id: string; name: string; role: string; banned: boolean }
  >();
  for (const r of rows) {
    const key =
      r.username && lower.includes(r.username)
        ? r.username
        : r.email.split("@")[0];
    // Prefer the username match when both exist.
    if (!byNumber.has(key) || r.username === key) {
      byNumber.set(key, {
        id: r.id,
        name: r.name,
        role: r.role,
        banned: r.banned ?? false,
      });
    }
  }
  return byNumber;
}

function conflictMessage(studentNumber: string, role: string) {
  return role === ROLES.student
    ? `Er bestaat al een leerling met leerlingnummer ${studentNumber}.`
    : `Leerlingnummer ${studentNumber} is al in gebruik door een ander account.`;
}

async function classesFor(db: DB, userIds: string[]) {
  if (userIds.length === 0)
    return new Map<string, { id: string; name: string; archived: boolean }[]>();
  const rows = await db
    .select({
      userId: classMembers.userId,
      id: classes.id,
      name: classes.name,
      archived: classes.archived,
    })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(inArray(classMembers.userId, userIds))
    .orderBy(asc(classes.archived), asc(classes.name));
  const map = new Map<
    string,
    { id: string; name: string; archived: boolean }[]
  >();
  for (const { userId, ...c } of rows) {
    const list = map.get(userId) ?? [];
    list.push(c);
    map.set(userId, list);
  }
  return map;
}

/** Student members of a class (for PIN operations). */
async function classStudents(db: DB, classId: string) {
  return db
    .select({ id: user.id, name: user.name, username: user.username })
    .from(classMembers)
    .innerJoin(user, eq(user.id, classMembers.userId))
    .where(and(eq(classMembers.classId, classId), eq(user.role, ROLES.student)))
    .orderBy(asc(user.name));
}

/* --------------------------------- Router --------------------------------- */

export const studentRouter = createTRPCRouter({
  /** Paginated, searchable list of all students. */
  list: adminProcedure
    .input(
      z.object({
        search: z.string().trim().max(100).optional(),
        classId: z.uuid().optional(),
        /** Leave out members of this class (for "add existing student"). */
        excludeClassId: z.uuid().optional(),
        status: z.enum(["all", "active", "inactive"]).default("all"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: (SQL | undefined)[] = [eq(user.role, ROLES.student)];
      if (input.search) {
        const term = likeEscape(normalizeCell(input.search));
        where.push(
          or(
            sql`${user.name} ilike ${`%${term}%`}`,
            sql`${user.username} ilike ${`${term}%`}`,
          ),
        );
      }
      if (input.classId) {
        where.push(
          sql`exists(select 1 from ${classMembers} cm where cm.class_id = ${input.classId} and cm.user_id = ${user}.id)`,
        );
      }
      if (input.excludeClassId) {
        where.push(
          sql`not exists(select 1 from ${classMembers} cm where cm.class_id = ${input.excludeClassId} and cm.user_id = ${user}.id)`,
        );
      }
      if (input.status === "active") where.push(isActive);
      if (input.status === "inactive") where.push(sql`${user.banned} = true`);
      const condition = and(...where);

      const [rows, [{ total }]] = await Promise.all([
        ctx.db
          .select({
            id: user.id,
            name: user.name,
            username: user.username,
            banned: user.banned,
            createdAt: user.createdAt,
            hasPin,
            lastLoginAt,
          })
          .from(user)
          .where(condition)
          .orderBy(asc(user.name), asc(user.username))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        ctx.db
          .select({ total: sql<number>`count(*)::int` })
          .from(user)
          .where(condition),
      ]);

      const classMap = await classesFor(
        ctx.db,
        rows.map((r) => r.id),
      );

      return {
        total,
        page: input.page,
        pageSize: input.pageSize,
        pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
        rows: rows.map(({ username, banned, ...r }) => ({
          ...r,
          studentNumber: username ?? "",
          banned: banned ?? false,
          classes: classMap.get(r.id) ?? [],
        })),
      };
    }),

  /** One student with classes and an overview of their attempts. */
  get: adminProcedure
    .input(z.object({ id: userIdSchema }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          id: user.id,
          name: user.name,
          username: user.username,
          banned: user.banned,
          banReason: user.banReason,
          createdAt: user.createdAt,
          hasPin,
          lastLoginAt,
        })
        .from(user)
        .where(and(eq(user.id, input.id), eq(user.role, ROLES.student)));
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deze leerling bestaat niet (meer).",
        });
      }

      const [classRows, attemptRows] = await Promise.all([
        ctx.db
          .select({
            id: classes.id,
            name: classes.name,
            schoolYear: classes.schoolYear,
            archived: classes.archived,
            addedAt: classMembers.createdAt,
          })
          .from(classMembers)
          .innerJoin(classes, eq(classes.id, classMembers.classId))
          .where(eq(classMembers.userId, input.id))
          .orderBy(asc(classes.archived), asc(classes.name)),
        ctx.db
          .select({
            id: attempts.id,
            assignmentId: attempts.assignmentId,
            attemptNumber: attempts.attemptNumber,
            status: attempts.status,
            gradingStatus: attempts.gradingStatus,
            score: attempts.score,
            maxScore: attempts.maxScore,
            startedAt: attempts.startedAt,
            submittedAt: attempts.submittedAt,
            autoSubmitted: attempts.autoSubmitted,
            focusLossCount: attempts.focusLossCount,
            assignmentTitle: sql<string>`coalesce(${assignments.title}, ${tests.title})`,
            testTitle: tests.title,
            mode: assignments.mode,
            classId: classes.id,
            className: classes.name,
          })
          .from(attempts)
          .innerJoin(assignments, eq(assignments.id, attempts.assignmentId))
          .innerJoin(tests, eq(tests.id, assignments.testId))
          .innerJoin(classes, eq(classes.id, assignments.classId))
          .where(eq(attempts.userId, input.id))
          .orderBy(desc(attempts.startedAt)),
      ]);

      const { username, banned, ...student } = row;
      return {
        ...student,
        studentNumber: username ?? "",
        banned: banned ?? false,
        classes: classRows,
        attempts: attemptRows,
      };
    }),

  /**
   * Which of these student numbers already exist (for the import preview).
   * `inClass` is set when `classId` is given.
   */
  checkExisting: adminProcedure
    .input(
      z.object({
        studentNumbers: z.array(z.string().trim()).max(MAX_IMPORT_ROWS * 2),
        classId: z.uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const numbers = [
        ...new Set(
          input.studentNumbers.filter((n) => STUDENT_NUMBER_REGEX.test(n)),
        ),
      ];
      const found = await findByNumbers(ctx.db, numbers);
      let members = new Set<string>();
      if (input.classId && found.size > 0) {
        const rows = await ctx.db
          .select({ userId: classMembers.userId })
          .from(classMembers)
          .where(
            and(
              eq(classMembers.classId, input.classId),
              inArray(
                classMembers.userId,
                [...found.values()].map((f) => f.id),
              ),
            ),
          );
        members = new Set(rows.map((r) => r.userId));
      }
      return [...found.entries()].map(([studentNumber, f]) => ({
        studentNumber,
        id: f.id,
        name: f.name,
        banned: f.banned,
        isStudent: f.role === ROLES.student,
        inClass: members.has(f.id),
      }));
    }),

  /** Create one student. Returns the plaintext PIN once (it can be re-printed later). */
  create: adminProcedure
    .input(
      z.object({
        studentNumber: studentNumberSchema,
        name: studentNameSchema,
        classId: z.uuid().optional(),
        pin: pinSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.classId) await getClassOrThrow(ctx.db, input.classId);
      const existing = (await findByNumbers(ctx.db, [input.studentNumber])).get(
        input.studentNumber.toLowerCase(),
      );
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: conflictMessage(input.studentNumber, existing.role),
        });
      }
      const { user: created, pin } = await createStudentSafely(ctx.db, input);
      if (input.classId) {
        await ctx.db
          .insert(classMembers)
          .values({ classId: input.classId, userId: created.id })
          .onConflictDoNothing();
      }
      return {
        user: {
          id: created.id,
          name: created.name,
          studentNumber: input.studentNumber,
        },
        pin,
      };
    }),

  /**
   * Bulk import. Everything is validated before any account is created;
   * rows that fail validation are reported in `errors` and skipped.
   * Existing students are (optionally renamed and) added to the class.
   */
  import: adminProcedure
    .input(
      z.object({
        classId: z.uuid().optional(),
        rows: z
          .array(
            z.object({
              studentNumber: z.string().max(64),
              name: z.string().max(500),
              /** Line number in the pasted text, echoed back in errors. */
              line: z.number().int().positive().optional(),
            }),
          )
          .min(1, "De lijst is leeg.")
          .max(
            MAX_IMPORT_ROWS,
            `Je kunt maximaal ${MAX_IMPORT_ROWS} leerlingen tegelijk importeren.`,
          ),
        onExisting: z.enum(["skip", "update_name"]).default("skip"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.classId) await getClassOrThrow(ctx.db, input.classId);

      type Row = { row: number; studentNumber: string; name: string };
      const errors: { row: number; studentNumber: string; message: string }[] =
        [];
      const valid: Row[] = [];
      const seen = new Map<string, number>();

      // 1. Validate every row up front.
      input.rows.forEach((r, i) => {
        const row = r.line ?? i + 1;
        const studentNumber = normalizeCell(r.studentNumber);
        const name = normalizeCell(r.name);
        let message: string | null = null;
        if (!STUDENT_NUMBER_REGEX.test(studentNumber)) {
          message = `Leerlingnummer "${studentNumber}" is ongeldig: gebruik alleen cijfers (3 tot 12).`;
        } else if (!name) message = "Naam ontbreekt.";
        else if (name.length > MAX_STUDENT_NAME_LENGTH) {
          message = `Naam is te lang (maximaal ${MAX_STUDENT_NAME_LENGTH} tekens).`;
        } else if (seen.has(studentNumber)) {
          message = `Leerlingnummer ${studentNumber} staat dubbel in de lijst (ook op regel ${seen.get(studentNumber)}).`;
        }
        if (message) {
          errors.push({ row, studentNumber, message });
          return;
        }
        seen.set(studentNumber, row);
        valid.push({ row, studentNumber, name });
      });

      // 2. Split into new and existing accounts.
      const found = await findByNumbers(
        ctx.db,
        valid.map((r) => r.studentNumber),
      );
      const toCreate: Row[] = [];
      const toLink: (Row & { id: string; previousName: string })[] = [];
      for (const r of valid) {
        const existing = found.get(r.studentNumber.toLowerCase());
        if (!existing) toCreate.push(r);
        else if (existing.role !== ROLES.student) {
          errors.push({
            ...r,
            message: conflictMessage(r.studentNumber, existing.role),
          });
        } else
          toLink.push({ ...r, id: existing.id, previousName: existing.name });
      }

      // 3. Create new accounts (each one all-or-nothing).
      const created: {
        id: string;
        studentNumber: string;
        name: string;
        pin: string;
      }[] = [];
      await mapLimit(toCreate, ACCOUNT_CONCURRENCY, async (r) => {
        try {
          const res = await createStudentSafely(ctx.db, {
            studentNumber: r.studentNumber,
            name: r.name,
          });
          created.push({
            id: res.user.id,
            studentNumber: r.studentNumber,
            name: r.name,
            pin: res.pin,
          });
        } catch (error) {
          errors.push({
            row: r.row,
            studentNumber: r.studentNumber,
            message:
              error instanceof TRPCError
                ? error.message
                : "Account aanmaken mislukt.",
          });
        }
      });

      // 4. Rename existing students when asked.
      const renamed = new Set<string>();
      if (input.onExisting === "update_name") {
        for (const r of toLink) {
          if (r.name !== r.previousName) {
            await ctx.db
              .update(user)
              .set({ name: r.name })
              .where(eq(user.id, r.id));
            renamed.add(r.id);
          }
        }
      }

      // 5. Add everyone to the class.
      let addedToClass = new Set<string>();
      const memberIds = [
        ...created.map((c) => c.id),
        ...toLink.map((r) => r.id),
      ];
      if (input.classId && memberIds.length > 0) {
        const classId = input.classId;
        const inserted = await ctx.db
          .insert(classMembers)
          .values(memberIds.map((userId) => ({ classId, userId })))
          .onConflictDoNothing()
          .returning({ userId: classMembers.userId });
        addedToClass = new Set(inserted.map((i) => i.userId));
      }

      const order = new Map(
        input.rows.map((r, i) => [normalizeCell(r.studentNumber), i]),
      );
      const byInputOrder = (
        a: { studentNumber: string },
        b: { studentNumber: string },
      ) =>
        (order.get(a.studentNumber) ?? 0) - (order.get(b.studentNumber) ?? 0);

      return {
        created: created.sort(byInputOrder),
        existing: toLink
          .map((r) => ({
            id: r.id,
            studentNumber: r.studentNumber,
            name: renamed.has(r.id) ? r.name : r.previousName,
            importedName: r.name,
            nameUpdated: renamed.has(r.id),
            addedToClass: addedToClass.has(r.id),
          }))
          .sort(byInputOrder),
        errors: errors.sort((a, b) => a.row - b.row),
      };
    }),

  /** Rename a student and/or change their student number (= login name). */
  update: adminProcedure
    .input(
      z.object({
        id: userIdSchema,
        name: studentNameSchema.optional(),
        studentNumber: studentNumberSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const current = await getStudentOrThrow(ctx.db, input.id);
      const patch: Partial<typeof user.$inferInsert> = {};
      if (input.name && input.name !== current.name) patch.name = input.name;
      if (
        input.studentNumber &&
        input.studentNumber.toLowerCase() !== current.username
      ) {
        const number = input.studentNumber.toLowerCase();
        const existing = (await findByNumbers(ctx.db, [number])).get(number);
        if (existing && existing.id !== current.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Leerlingnummer ${number} is al in gebruik door ${existing.role === ROLES.student ? existing.name : "een ander account"}.`,
          });
        }
        patch.username = number;
        patch.displayUsername = number;
        patch.email = studentEmail(number);
      }
      if (Object.keys(patch).length === 0) {
        return {
          id: current.id,
          name: current.name,
          studentNumber: current.username ?? "",
        };
      }
      try {
        const [updated] = await ctx.db
          .update(user)
          .set(patch)
          .where(eq(user.id, input.id))
          .returning();
        return {
          id: updated.id,
          name: updated.name,
          studentNumber: updated.username ?? "",
        };
      } catch (error) {
        if (
          (error as { cause?: { code?: string }; code?: string }).cause
            ?.code === "23505"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Dit leerlingnummer is al in gebruik.",
          });
        }
        throw error;
      }
    }),

  /** New random PIN for one student (signs them out everywhere). */
  resetPin: adminProcedure
    .input(z.object({ id: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const student = await getStudentOrThrow(ctx.db, input.id);
      const pin = await resetStudentPin(student.id);
      return {
        id: student.id,
        studentNumber: student.username ?? "",
        name: student.name,
        pin,
      };
    }),

  /** New PINs for every student in a class. */
  resetPins: adminProcedure
    .input(z.object({ classId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await getClassOrThrow(ctx.db, input.classId);
      const students = await classStudents(ctx.db, input.classId);
      return mapLimit(students, ACCOUNT_CONCURRENCY, async (s) => ({
        id: s.id,
        studentNumber: s.username ?? "",
        name: s.name,
        pin: await resetStudentPin(s.id),
      }));
    }),

  /**
   * Current PINs (decrypted) for printing login cards: all students of a
   * class, specific students, or specific students within a class.
   */
  getPins: adminProcedure
    .input(
      z
        .object({
          classId: z.uuid().optional(),
          userIds: z.array(z.string().min(1)).max(1000).optional(),
        })
        .refine(
          (v) => v.classId || v.userIds?.length,
          "Kies een klas of leerlingen.",
        ),
    )
    .query(async ({ ctx, input }) => {
      let students: { id: string; name: string; username: string | null }[];
      if (input.classId) {
        await getClassOrThrow(ctx.db, input.classId);
        students = await classStudents(ctx.db, input.classId);
        if (input.userIds?.length) {
          const wanted = new Set(input.userIds);
          students = students.filter((s) => wanted.has(s.id));
        }
      } else {
        students = await ctx.db
          .select({ id: user.id, name: user.name, username: user.username })
          .from(user)
          .where(
            and(
              inArray(user.id, input.userIds ?? []),
              eq(user.role, ROLES.student),
            ),
          )
          .orderBy(asc(user.name));
      }
      return Promise.all(
        students.map(async (s) => ({
          id: s.id,
          studentNumber: s.username ?? "",
          name: s.name,
          pin: await getStudentPin(s.id),
        })),
      );
    }),

  /** Deactivate (blocks sign-in, signs out) or reactivate a student. */
  setActive: adminProcedure
    .input(z.object({ id: userIdSchema, active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await getStudentOrThrow(ctx.db, input.id);
      await ctx.db
        .update(user)
        .set(
          input.active
            ? { banned: false, banReason: null, banExpires: null }
            : {
                banned: true,
                banReason: "Gedeactiveerd door een docent.",
                banExpires: null,
              },
        )
        .where(eq(user.id, input.id));
      if (!input.active)
        await ctx.db.delete(session).where(eq(session.userId, input.id));
      return { id: input.id, active: input.active };
    }),

  /** Permanently delete a student, including all their attempts. */
  delete: adminProcedure
    .input(z.object({ id: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await getStudentOrThrow(ctx.db, input.id);
      await ctx.db.delete(user).where(eq(user.id, input.id));
      return { id: input.id };
    }),
});
