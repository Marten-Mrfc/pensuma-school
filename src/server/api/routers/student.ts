import { createHash } from "node:crypto";
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
import { accommodationsFor } from "@/server/api/routers/accommodation";
import {
  getClassOrThrow,
  type LoginLock,
  lastLoginAtSql,
  loginLocksFor,
} from "@/server/api/routers/class";
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
import { eraseStudentById } from "@/server/privacy/erasure";
import { databaseErrorOf, logServerError } from "@/server/privacy/error-log";
import {
  assertNotRestricted,
  hasActiveRestriction,
  RESTRICTED_MESSAGE,
  restrictedSql,
  restrictedUserIds,
} from "@/server/privacy/restriction";
import { clearStudentLoginThrottle } from "@/server/security/login-throttle";
import {
  createStudentAccount,
  getStudentPin,
  resetStudentPin,
} from "@/server/services/accounts";
import {
  type AuditEntry,
  auditFromCtx,
  auditManyFromCtx,
  auditRead,
  auditReadMany,
} from "@/server/services/audit";

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

const userIdSchema = z.string().min(1, "Ongeldige leerling.").max(64);

/* -------------------------------- Helpers --------------------------------- */

/** Students who are not deactivated. */
const isActive = sql`coalesce(${user.banned}, false) = false`;

const lastLoginAt = lastLoginAtSql;
const hasPin = sql<boolean>`exists(select 1 from ${studentPins} sp where sp.user_id = ${user}.id)`;

/** Escape LIKE wildcards in user input. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const NO_LOCK: LoginLock = { loginLockedUntil: null, recentFailures: 0 };

/** Short, stable id for a selection of students (audit de-duplication). */
function selectionId(ids: string[]): string {
  const digest = createHash("sha256")
    .update([...ids].sort().join(","))
    .digest("hex")
    .slice(0, 16);
  return `selectie-${digest}`;
}

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

/** AVG art. 18: an active restriction on this user (see privacy/restriction). */
const isRestricted = restrictedSql(sql`${user}.id`);

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
 * Callers must have checked up front that the number/email are free; a
 * number taken meanwhile (two teachers at once) is a CONFLICT.
 *
 * A failure is an INTERNAL_SERVER_ERROR without the leerlingnummer in its
 * message, with the original error as cause: the tRPC error log then keeps
 * only the database error code and constraint (never Drizzle's message with
 * the query parameters), and the teacher sees the same error code.
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
    if (databaseErrorOf(error)?.code === UNIQUE_VIOLATION) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Leerlingnummer ${input.studentNumber} is al in gebruik.`,
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Het account kon niet worden aangemaakt. Probeer het opnieuw.",
      cause: error,
    });
  }
}

/** Postgres SQLSTATE for a unique constraint violation. */
const UNIQUE_VIOLATION = "23505";

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
            restricted: isRestricted,
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

      const [classMap, locks] = await Promise.all([
        classesFor(
          ctx.db,
          rows.map((r) => r.id),
        ),
        loginLocksFor(
          ctx.db,
          rows.map((r) => r.username ?? ""),
        ),
      ]);

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
          ...(locks.get(username ?? "") ?? NO_LOCK),
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
          /** Processing restricted (AVG art. 18): show it, don't change data. */
          restricted: isRestricted,
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

      const studentNumber = row.username ?? "";
      const [locks, accommodations] = await Promise.all([
        loginLocksFor(ctx.db, [studentNumber]),
        accommodationsFor(ctx.db, [row.id]),
      ]);

      auditRead(ctx, {
        action: "student.viewed",
        subjectType: "student",
        subjectId: row.id,
        subjectUserId: row.id,
        subjectLabel: studentNumber || null,
      });

      const { username: _username, banned, ...student } = row;
      return {
        ...student,
        studentNumber,
        banned: banned ?? false,
        classes: classRows,
        attempts: attemptRows,
        ...(locks.get(studentNumber) ?? NO_LOCK),
        accommodation: accommodations.get(row.id) ?? null,
      };
    }),

  /**
   * Which of these student numbers already exist (for the import preview).
   * `inClass` is set when `classId` is given.
   */
  checkExisting: adminProcedure
    .input(
      z.object({
        studentNumbers: z
          .array(z.string().trim().max(64))
          .max(MAX_IMPORT_ROWS * 2),
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
      await auditFromCtx(ctx, {
        action: "student.created",
        subjectType: "student",
        subjectId: created.id,
        subjectUserId: created.id,
        subjectLabel: input.studentNumber,
        details: input.classId ? { classId: input.classId } : null,
      });
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
          // The row (with its leerlingnummer) goes back to the teacher; the
          // log line holds an error code and the database error code only.
          const internal =
            !(error instanceof TRPCError) ||
            error.code === "INTERNAL_SERVER_ERROR";
          const errorId = internal
            ? logServerError("student.import_create_failed", error)
            : null;
          errors.push({
            row: r.row,
            studentNumber: r.studentNumber,
            message:
              error instanceof TRPCError && !internal
                ? error.message
                : `Account aanmaken mislukt (foutcode: ${errorId}). Probeer het opnieuw.`,
          });
        }
      });

      // 4. Rename existing students when asked, except while their
      // processing is restricted (AVG art. 18): their name and klasindeling
      // stay as they are.
      const renamed = new Set<string>();
      const restricted =
        input.onExisting === "update_name" || input.classId
          ? await restrictedUserIds(
              ctx.db,
              toLink.map((r) => r.id),
            )
          : new Set<string>();
      if (input.onExisting === "update_name") {
        for (const r of toLink) {
          if (r.name !== r.previousName && !restricted.has(r.id)) {
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
        ...toLink.filter((r) => !restricted.has(r.id)).map((r) => r.id),
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

      // 6. Audit: one summary row, plus one row per new account and per
      // renamed student, so each shows up under that student in the audit
      // log and in their own inzage export.
      const classDetails = input.classId ? { classId: input.classId } : {};
      await auditManyFromCtx(ctx, [
        {
          action: "student.imported",
          subjectType: input.classId ? "class" : "student",
          subjectId: input.classId ?? null,
          details: {
            ...classDetails,
            rowsCount: input.rows.length,
            createdCount: created.length,
            existingCount: toLink.length,
            renamedCount: renamed.size,
            addedToClassCount: addedToClass.size,
            errorsCount: errors.length,
          },
        },
        ...created.map(
          (c): AuditEntry => ({
            action: "student.created",
            subjectType: "student",
            subjectId: c.id,
            subjectUserId: c.id,
            subjectLabel: c.studentNumber,
            details: { ...classDetails, via: "import" },
          }),
        ),
        ...toLink
          .filter((r) => renamed.has(r.id))
          .map(
            (r): AuditEntry => ({
              action: "student.updated",
              subjectType: "student",
              subjectId: r.id,
              subjectUserId: r.id,
              subjectLabel: r.studentNumber,
              details: { fields: ["name"], via: "import" },
            }),
          ),
      ]);

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
            /**
             * Processing restricted (AVG art. 18): not renamed and not
             * added to the class.
             */
            restricted: restricted.has(r.id),
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
        /**
         * Change anyway while the processing is restricted (AVG art. 18),
         * e.g. to rectify what the procedure is about. Recorded in the log.
         */
        overrideRestriction: z.boolean().optional(),
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
      const overridden = await assertNotRestricted(ctx.db, current.id, {
        override: input.overrideRestriction,
      });
      const fields: ("name" | "studentNumber")[] = [];
      if (patch.name !== undefined) fields.push("name");
      if (patch.username !== undefined) fields.push("studentNumber");
      try {
        const [updated] = await ctx.db
          .update(user)
          .set(patch)
          .where(eq(user.id, input.id))
          .returning();
        if (patch.username !== undefined && current.username) {
          // Lockouts are keyed by the old number; don't let them linger.
          await clearStudentLoginThrottle(ctx.db, current.username);
        }
        await auditFromCtx(ctx, {
          action: "student.updated",
          subjectType: "student",
          subjectId: updated.id,
          subjectUserId: updated.id,
          subjectLabel: updated.username ?? null,
          details: {
            fields,
            ...(overridden ? { restrictionOverridden: true } : {}),
          },
        });
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
      if (student.username) {
        await clearStudentLoginThrottle(ctx.db, student.username);
      }
      await auditFromCtx(ctx, {
        action: "student.pin_reset",
        subjectType: "student",
        subjectId: student.id,
        subjectUserId: student.id,
        subjectLabel: student.username ?? null,
        details: { count: 1 },
      });
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
      const result = await mapLimit(
        students,
        ACCOUNT_CONCURRENCY,
        async (s) => {
          const pin = await resetStudentPin(s.id);
          if (s.username) await clearStudentLoginThrottle(ctx.db, s.username);
          return {
            id: s.id,
            studentNumber: s.username ?? "",
            name: s.name,
            pin,
          };
        },
      );
      // One summary row for the class, and one per student so the reset
      // appears in each student's access log (inzage) and filter.
      const details = { classId: input.classId, count: result.length };
      await auditManyFromCtx(ctx, [
        {
          action: "student.pin_reset",
          subjectType: "class",
          subjectId: input.classId,
          details,
        },
        ...result.map(
          (r): AuditEntry => ({
            action: "student.pin_reset",
            subjectType: "student",
            subjectId: r.id,
            subjectUserId: r.id,
            subjectLabel: r.studentNumber || null,
            details,
          }),
        ),
      ]);
      return result;
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
          userIds: z.array(z.string().min(1).max(64)).max(1000).optional(),
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
      const result = await Promise.all(
        students.map(async (s) => ({
          id: s.id,
          studentNumber: s.username ?? "",
          name: s.name,
          pin: await getStudentPin(s.id),
        })),
      );
      // One row per student whose PIN was shown, so it appears in that
      // student's access log (inzage) and under the "Leerling" filter; for a
      // class or a selection also one summary row.
      const details = {
        ...(input.classId ? { classId: input.classId } : {}),
        count: result.length,
      };
      const perStudent = result.map(
        (r): AuditEntry => ({
          action: "student.pins_viewed",
          subjectType: "student",
          subjectId: r.id,
          subjectUserId: r.id,
          subjectLabel: r.studentNumber || null,
          details,
        }),
      );
      if (input.classId) {
        auditReadMany(ctx, [
          {
            action: "student.pins_viewed",
            subjectType: "class",
            subjectId: input.classId,
            details,
          },
          ...perStudent,
        ]);
      } else if (result.length > 1) {
        auditReadMany(ctx, [
          {
            action: "student.pins_viewed",
            subjectType: "student",
            subjectId: selectionId(result.map((r) => r.id)),
            details,
          },
          ...perStudent,
        ]);
      } else {
        auditReadMany(ctx, perStudent);
      }
      return result;
    }),

  /** Deactivate (blocks sign-in, signs out) or reactivate a student. */
  setActive: adminProcedure
    .input(z.object({ id: userIdSchema, active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const student = await getStudentOrThrow(ctx.db, input.id);
      // AVG art. 18: a restricted account stays blocked until the
      // restriction itself is lifted (privacy.setRestriction).
      if (input.active && (await hasActiveRestriction(ctx.db, student.id))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: RESTRICTED_MESSAGE,
        });
      }
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
      await auditFromCtx(ctx, {
        action: input.active ? "student.reactivated" : "student.deactivated",
        subjectType: "student",
        subjectId: student.id,
        subjectUserId: student.id,
        subjectLabel: student.username ?? null,
      });
      return { id: input.id, active: input.active };
    }),

  /**
   * Permanently delete a student, including all their attempts (AVG art.
   * 17). Goes through the shared erasure service: refused while a
   * retention hold applies, audited, and the login lockouts are cleared.
   */
  delete: adminProcedure
    .input(z.object({ id: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await getStudentOrThrow(ctx.db, input.id);
      await eraseStudentById(ctx.db, input.id, ctx);
      return { id: input.id };
    }),

  /** Lift a login lockout (too many wrong PINs) right away. */
  unlockLogin: adminProcedure
    .input(z.object({ id: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const student = await getStudentOrThrow(ctx.db, input.id);
      const cleared = student.username
        ? await clearStudentLoginThrottle(ctx.db, student.username)
        : 0;
      await auditFromCtx(ctx, {
        action: "auth.login_unlocked",
        subjectType: "student",
        subjectId: student.id,
        subjectUserId: student.id,
        subjectLabel: student.username ?? null,
        details: { count: cleared },
      });
      return { id: student.id };
    }),
});
