import { TRPCError } from "@trpc/server";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  lt,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { ROLES } from "@/lib/auth-shared";
import { formatDateTimeNl, toCsv } from "@/lib/export/csv";
import { computeGrade } from "@/lib/grading/grade-scale";
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditCategory,
} from "@/lib/privacy/audit-actions";
import {
  ACTOR_ROLE_LABELS,
  auditActionCategory,
  auditRowLabel,
  formatAuditDetails,
} from "@/lib/privacy/audit-format";
import { DATA_CATEGORIES, registerAsMarkdown } from "@/lib/privacy/register";
import {
  type RetentionHoldKind,
  retentionDeletedTotal,
} from "@/lib/privacy/retention";
import {
  privacySettingsSchema,
  toPublicPrivacyInfo,
} from "@/lib/privacy/settings";
import { assignmentSettingsSchema } from "@/lib/questions/schema";
import { assertNoActiveHolds } from "@/server/api/routers/assignment";
import {
  adminProcedure,
  createTRPCRouter,
  publicProcedure,
  studentProcedure,
} from "@/server/api/trpc";
import { auth } from "@/server/auth";
import {
  account,
  answers,
  assignments,
  attemptEvents,
  attempts,
  auditLog,
  classes,
  classMembers,
  retentionHolds,
  retentionRuns,
  session,
  studentAccommodations,
  tests,
  user,
} from "@/server/db/schema";
import { erasePreview, eraseStudentById } from "@/server/privacy/erasure";
import {
  previewRetention,
  runRetention,
} from "@/server/privacy/retention-core";
import {
  closeSchoolYear,
  listSchoolYears,
  schoolYearPreview,
} from "@/server/privacy/school-year";
import {
  getPrivacySettings,
  savePrivacySettings,
} from "@/server/privacy/settings-store";
import {
  lastSignInSql,
  loadStudentExport,
  toDate,
} from "@/server/privacy/student-export";
import { resultsVisible } from "@/server/services/assignment-status";
import { stillWorkingByAssignment } from "@/server/services/assignment-targets";
import { actorFromCtx, auditFromCtx } from "@/server/services/audit";

/**
 * AVG/GDPR: privacy settings and retention periods, data-subject rights
 * (inzage, verwijderen, beperken, bewaarblokkades), the audit log viewer,
 * year-end close, and the student's own "Mijn gegevens".
 */

export const RESTRICTION_BAN_REASON = "Verwerking beperkt (AVG art. 18)";

const userIdSchema = z.string().trim().min(1).max(64);
const reasonSchema = z
  .string()
  .trim()
  .min(1, "Vul een reden in.")
  .max(500, "Gebruik maximaal 500 tekens.");
const passwordSchema = z
  .string()
  .min(1, "Vul je wachtwoord in.")
  .max(128, "Dit wachtwoord is te lang.");
const schoolYearSchema = z
  .string()
  .trim()
  .min(1, "Kies een schooljaar.")
  .max(40);
const isoDate = z.iso.date("Kies een geldige datum.");

const retentionInput = privacySettingsSchema.shape.retention
  .unwrap()
  .omit({ confirmedAt: true, confirmedById: true });

const settingsInput = privacySettingsSchema.extend({
  retention: retentionInput,
  /** "Opslaan en vaststellen": record who confirmed the periods and when. */
  confirmRetention: z.boolean().optional(),
});

/** Retention fields behind the confirmation gate. */
const GATED_KEYS = [
  "attemptsMonths",
  "inactiveStudentMonths",
  "autoDeleteAttempts",
] as const;

const AUDIT_CATEGORIES = [
  "auth",
  "access",
  "change",
  "security",
  "privacy",
] as const satisfies readonly AuditCategory[];

const auditFilterSchema = z.object({
  actorId: userIdSchema.optional(),
  subjectUserId: userIdSchema.optional(),
  action: z
    .string()
    .max(64)
    .refine((a) => Object.hasOwn(AUDIT_ACTIONS, a), "Onbekende handeling.")
    .optional(),
  category: z.enum(AUDIT_CATEGORIES).optional(),
  /** yyyy-mm-dd, inclusive, Europe/Amsterdam. */
  from: isoDate.optional(),
  to: isoDate.optional(),
});
type AuditFilter = z.infer<typeof auditFilterSchema>;

/* -------------------------------- Helpers -------------------------------- */

/** "school.name", "retention.attemptsMonths": the leaf keys that differ. */
function changedKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix = "",
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: string[] = [];
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a)
    ) {
      out.push(
        ...changedKeys(
          a as Record<string, unknown>,
          b as Record<string, unknown>,
          path,
        ),
      );
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push(path);
    }
  }
  return out;
}

/** Wrong-password attempts per teacher (in memory; resets on restart). */
const PASSWORD_WINDOW_MS = 15 * 60_000;
const PASSWORD_MAX_FAILURES = 5;
const passwordFailures = new Map<string, { count: number; since: number }>();

/** Re-check the signed-in teacher's own password before a drastic action. */
async function verifyOwnPassword(
  db: typeof import("@/server/db").db,
  userId: string,
  password: string,
): Promise<void> {
  const now = Date.now();
  const failures = passwordFailures.get(userId);
  if (failures && now - failures.since > PASSWORD_WINDOW_MS) {
    passwordFailures.delete(userId);
  } else if (failures && failures.count >= PASSWORD_MAX_FAILURES) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "Te vaak een verkeerd wachtwoord ingevuld. Probeer het over een kwartier opnieuw.",
    });
  }
  const [row] = await db
    .select({ hash: account.password })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential")),
    )
    .limit(1);
  let ok = false;
  if (row?.hash) {
    const authContext = await auth.$context;
    ok = await authContext.password.verify({ password, hash: row.hash });
  }
  if (!ok) {
    const current = passwordFailures.get(userId);
    passwordFailures.set(userId, {
      count: (current?.count ?? 0) + 1,
      since: current?.since ?? now,
    });
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Je wachtwoord klopt niet.",
    });
  }
  passwordFailures.delete(userId);
}

async function loadStudent(
  db: typeof import("@/server/db").db,
  userId: string,
) {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row || row.role !== ROLES.student) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Leerling niet gevonden.",
    });
  }
  return row;
}

const amsterdamDateFormat = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** yyyy-mm-dd of a moment in Dutch local time. */
function amsterdamDate(moment: Date): string {
  const parts = amsterdamDateFormat.formatToParts(moment);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** created_at bounds for yyyy-mm-dd dates in Dutch local time. */
function dateBounds(filter: AuditFilter): SQL[] {
  const out: SQL[] = [];
  if (filter.from) {
    out.push(
      sql`${auditLog.createdAt} >= (${filter.from}::date::timestamp at time zone 'Europe/Amsterdam')`,
    );
  }
  if (filter.to) {
    out.push(
      sql`${auditLog.createdAt} < ((${filter.to}::date + 1)::timestamp at time zone 'Europe/Amsterdam')`,
    );
  }
  return out;
}

function auditConditions(filter: AuditFilter): SQL[] {
  const out: SQL[] = [...dateBounds(filter)];
  if (filter.actorId) out.push(eq(auditLog.actorId, filter.actorId));
  if (filter.subjectUserId) {
    out.push(eq(auditLog.subjectUserId, filter.subjectUserId));
  }
  if (filter.action) {
    out.push(eq(auditLog.action, filter.action as AuditAction));
  }
  if (filter.category) {
    const actions = Object.entries(AUDIT_ACTIONS)
      .filter(([, meta]) => meta.category === filter.category)
      .map(([action]) => action as AuditAction);
    out.push(inArray(auditLog.action, actions));
  }
  return out;
}

const actorUser = alias(user, "actor_user");
const subjectUser = alias(user, "subject_user");

async function queryAuditRows(
  db: typeof import("@/server/db").db,
  conditions: SQL[],
  limit: number,
) {
  const rows = await db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      actorRole: auditLog.actorRole,
      actorId: auditLog.actorId,
      actorNameSnapshot: auditLog.actorName,
      actorCurrentName: actorUser.name,
      impersonatorId: auditLog.impersonatorId,
      subjectType: auditLog.subjectType,
      subjectId: auditLog.subjectId,
      subjectUserId: auditLog.subjectUserId,
      subjectLabel: auditLog.subjectLabel,
      subjectCurrentName: subjectUser.name,
      subjectCurrentNumber: subjectUser.username,
      subjectCurrentRole: subjectUser.role,
      subjectExists: sql<boolean>`${subjectUser.id} is not null`,
      details: auditLog.details,
      ipPrefix: auditLog.ipPrefix,
    })
    .from(auditLog)
    .leftJoin(actorUser, eq(actorUser.id, auditLog.actorId))
    .leftJoin(subjectUser, eq(subjectUser.id, auditLog.subjectUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    action: r.action,
    label: auditRowLabel(r.action, r.details),
    category: auditActionCategory(r.action),
    actorRole: r.actorRole,
    actorId: r.actorId,
    /** Current name; the snapshot when the account no longer exists. */
    actorName:
      r.actorCurrentName ??
      r.actorNameSnapshot ??
      ACTOR_ROLE_LABELS[r.actorRole] ??
      null,
    impersonated: r.impersonatorId != null,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    subjectUserId: r.subjectUserId,
    subjectLabel: r.subjectCurrentNumber ?? r.subjectLabel,
    subjectName: r.subjectCurrentName,
    /** The subject still exists and is a student (link to their page). */
    subjectIsStudent: r.subjectCurrentRole === ROLES.student,
    /** The student was deleted after this entry was written. */
    subjectDeleted: r.subjectUserId != null && !r.subjectExists,
    details: r.details,
    detailsText: formatAuditDetails(r.details, 8, r.action),
    ipPrefix: r.ipPrefix,
  }));
}

/* --------------------------------- Router -------------------------------- */

export const privacyRouter = createTRPCRouter({
  /** Contacts and retention periods for /privacy (no ids, no teacher names). */
  publicInfo: publicProcedure.query(async ({ ctx }) => {
    const { settings, updatedAt } = await getPrivacySettings(ctx.db);
    return toPublicPrivacyInfo(settings, updatedAt);
  }),

  /* ------------------------------ Settings ------------------------------ */

  getSettings: adminProcedure.query(async ({ ctx }) => {
    const stored = await getPrivacySettings(ctx.db);
    const ids = [
      stored.updatedById,
      stored.settings.retention.confirmedById,
    ].filter((v): v is string => !!v);
    const names = ids.length
      ? await ctx.db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, ids))
      : [];
    const nameOf = (id: string | null) =>
      id ? (names.find((n) => n.id === id)?.name ?? null) : null;
    return {
      settings: stored.settings,
      updatedAt: stored.updatedAt,
      updatedByName: nameOf(stored.updatedById),
      confirmedByName: nameOf(stored.settings.retention.confirmedById),
    };
  }),

  updateSettings: adminProcedure
    .input(settingsInput)
    .mutation(async ({ ctx, input }) => {
      const { confirmRetention, ...rest } = input;
      const current = await getPrivacySettings(ctx.db);
      const prev = current.settings.retention;
      const gatedChanged = GATED_KEYS.some(
        (key) => rest.retention[key] !== prev[key],
      );
      const now = new Date();
      // Changing what the school confirmed withdraws the confirmation.
      const confirmedAt = confirmRetention
        ? now.toISOString()
        : gatedChanged
          ? null
          : prev.confirmedAt;
      const confirmedById = confirmRetention
        ? ctx.user.id
        : gatedChanged
          ? null
          : prev.confirmedById;
      const saved = await savePrivacySettings(
        ctx.db,
        {
          ...rest,
          retention: { ...rest.retention, confirmedAt, confirmedById },
        },
        ctx.user.id,
      );
      const changed = changedKeys(current.settings, saved.settings);
      await auditFromCtx(ctx, {
        action: "privacy.settings_updated",
        subjectType: "settings",
        details: {
          changedKeys: changed.slice(0, 20),
          changedKeysCount: changed.length,
          retentionConfirmed: confirmRetention === true,
        },
      });
      return {
        settings: saved.settings,
        updatedAt: saved.updatedAt,
        confirmationWithdrawn:
          !confirmRetention && gatedChanged && prev.confirmedAt != null,
      };
    }),

  /* ------------------------------ Overview ------------------------------ */

  overview: adminProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.execute<Record<string, unknown>>(sql`select
      (select count(*) from "user" where role = 'student')::int as students,
      (select count(*) from "user" u where u.role = 'student' and not exists (
        select 1 from class_member cm join class c on c.id = cm.class_id
        where cm.user_id = u.id and c.archived = false
      ))::int as students_without_active_class,
      (select count(*) from attempt)::int as attempts,
      (select count(*) from answer)::int as answers,
      (select count(*) from attempt_event)::int as attempt_events,
      (select min(started_at) from attempt) as oldest_attempt_at,
      (select count(*) from "session" where expires_at > (now() at time zone 'UTC'))::int as active_sessions,
      (select count(*) from audit_log)::int as audit_entries,
      (select count(*) from retention_hold where until is null or until > now())::int as holds`);
    const row = result.rows[0] ?? {};
    const [lastRun] = await ctx.db
      .select()
      .from(retentionRuns)
      .where(eq(retentionRuns.dryRun, false))
      .orderBy(desc(retentionRuns.startedAt))
      .limit(1);
    return {
      students: Number(row.students ?? 0),
      studentsWithoutActiveClass: Number(
        row.students_without_active_class ?? 0,
      ),
      attempts: Number(row.attempts ?? 0),
      answers: Number(row.answers ?? 0),
      attemptEvents: Number(row.attempt_events ?? 0),
      oldestAttemptAt: toDate(row.oldest_attempt_at),
      activeSessions: Number(row.active_sessions ?? 0),
      auditEntries: Number(row.audit_entries ?? 0),
      holds: Number(row.holds ?? 0),
      lastRun: lastRun
        ? {
            startedAt: lastRun.startedAt,
            finishedAt: lastRun.finishedAt,
            trigger: lastRun.trigger,
            error: lastRun.error ? "De opschoning is mislukt." : null,
            deletedTotal: retentionDeletedTotal(lastRun.report),
            report: lastRun.report,
          }
        : null,
    };
  }),

  /* ------------------------------ Retention ----------------------------- */

  /** Dry run; optionally with the (unsaved) periods from the form. */
  retentionPreview: adminProcedure
    .input(
      z.object({ retention: retentionInput.partial().optional() }).nullish(),
    )
    .query(async ({ ctx, input }) => {
      const override = input?.retention;
      if (!override) return previewRetention(ctx.db);
      // The form's own switch only counts once the school has confirmed.
      const { settings } = await getPrivacySettings(ctx.db);
      return previewRetention(ctx.db, new Date(), {
        ...override,
        confirmedAt: settings.retention.confirmedAt,
      });
    }),

  runRetention: adminProcedure.mutation(async ({ ctx }) => {
    const report = await runRetention(ctx.db, {
      trigger: "manual",
      triggeredById: ctx.user.id,
    });
    // runRetention wrote privacy.retention_run (with triggeredById).
    ctx.auditState.written = true;
    return report;
  }),

  /* ------------------------- Data-subject rights ------------------------ */

  /** A mutation, so it is never prefetched or cached. */
  exportStudent: adminProcedure
    .input(z.object({ userId: userIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const data = await loadStudentExport(ctx.db, input.userId, "admin");
      await auditFromCtx(ctx, {
        action: "student.exported",
        subjectType: "student",
        subjectId: input.userId,
        subjectUserId: input.userId,
        subjectLabel: data.student.studentNumber || null,
        details: { attemptsCount: data.attempts.length },
      });
      return data;
    }),

  erasePreview: adminProcedure
    .input(z.object({ userId: userIdSchema }))
    .query(async ({ ctx, input }) => {
      const [preview, { settings }] = await Promise.all([
        erasePreview(ctx.db, input.userId),
        getPrivacySettings(ctx.db),
      ]);
      return { ...preview, backupDays: settings.processor.backupDays };
    }),

  eraseStudent: adminProcedure
    .input(
      z.object({
        userId: userIdSchema,
        confirmStudentNumber: z.string().trim().max(32),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const student = await loadStudent(ctx.db, input.userId);
      if (
        !student.username ||
        student.username.toLowerCase() !==
          input.confirmStudentNumber.toLowerCase()
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Het leerlingnummer klopt niet.",
        });
      }
      return eraseStudentById(ctx.db, input.userId, ctx);
    }),

  /** AVG art. 18: block sign-in and automatic deletion until lifted. */
  setRestriction: adminProcedure
    .input(
      z.discriminatedUnion("restricted", [
        z.object({
          userId: userIdSchema,
          restricted: z.literal(true),
          reason: reasonSchema,
        }),
        z.object({
          userId: userIdSchema,
          restricted: z.literal(false),
          reason: z.string().max(500).optional(),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const student = await loadStudent(ctx.db, input.userId);
      return ctx.db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: retentionHolds.id })
          .from(retentionHolds)
          .where(
            and(
              eq(retentionHolds.userId, student.id),
              eq(retentionHolds.kind, "restriction"),
            ),
          );
        if (input.restricted) {
          if (existing.length === 0) {
            await tx.insert(retentionHolds).values({
              userId: student.id,
              kind: "restriction",
              reason: input.reason,
              createdById: ctx.user.id,
            });
          } else {
            await tx
              .update(retentionHolds)
              .set({ reason: input.reason, until: null })
              .where(
                inArray(
                  retentionHolds.id,
                  existing.map((h) => h.id),
                ),
              );
          }
          // An account a teacher already deactivated keeps that reason, so
          // lifting the restriction later never reactivates it.
          const deactivatedOtherwise =
            student.banned === true &&
            !!student.banReason &&
            student.banReason !== RESTRICTION_BAN_REASON;
          await tx
            .update(user)
            .set(
              deactivatedOtherwise
                ? { banned: true }
                : { banned: true, banReason: RESTRICTION_BAN_REASON },
            )
            .where(eq(user.id, student.id));
          await tx.delete(session).where(eq(session.userId, student.id));
        } else {
          if (existing.length > 0) {
            await tx.delete(retentionHolds).where(
              inArray(
                retentionHolds.id,
                existing.map((h) => h.id),
              ),
            );
          }
          // Only lift our own block, not a deactivation by a teacher.
          if (student.banReason === RESTRICTION_BAN_REASON) {
            await tx
              .update(user)
              .set({ banned: false, banReason: null })
              .where(eq(user.id, student.id));
          }
        }
        await auditFromCtx(
          ctx,
          {
            action: input.restricted
              ? "student.restricted"
              : "student.unrestricted",
            subjectType: "student",
            subjectId: student.id,
            subjectUserId: student.id,
            subjectLabel: student.username,
          },
          tx,
        );
        return { restricted: input.restricted };
      });
    }),

  deleteAttemptEvents: adminProcedure
    .input(z.object({ attemptId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [attempt] = await ctx.db
        .select({
          id: attempts.id,
          assignmentId: attempts.assignmentId,
          userId: attempts.userId,
          username: user.username,
        })
        .from(attempts)
        .innerJoin(user, eq(user.id, attempts.userId))
        .where(eq(attempts.id, input.attemptId))
        .limit(1);
      if (!attempt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Poging niet gevonden.",
        });
      }
      return ctx.db.transaction(async (tx) => {
        // A bewaarblokkade (bezwaar, examendossier, AVG art. 18) on the
        // afname or the student keeps the log as it is.
        await assertNoActiveHolds(
          tx,
          { assignmentIds: [attempt.assignmentId], userIds: [attempt.userId] },
          {
            afname: "deze afname",
            consequence: "Je kunt het logboek daarom niet wissen.",
          },
        );
        const deleted = await tx
          .delete(attemptEvents)
          .where(eq(attemptEvents.attemptId, attempt.id))
          .returning({ id: attemptEvents.id });
        // Raw SQL: keep updated_at (it drives the retention period).
        await tx.execute(
          sql`update attempt set focus_loss_count = 0 where id = ${attempt.id}`,
        );
        await auditFromCtx(
          ctx,
          {
            action: "attempt.events_deleted",
            subjectType: "attempt",
            subjectId: attempt.id,
            subjectUserId: attempt.userId,
            subjectLabel: attempt.username,
            details: { eventsCount: deleted.length },
          },
          tx,
        );
        return { deleted: deleted.length };
      });
    }),

  /* -------------------------------- Holds ------------------------------- */

  listHolds: adminProcedure.query(async ({ ctx }) => {
    const createdBy = alias(user, "hold_created_by");
    const holdUser = alias(user, "hold_user");
    const rows = await ctx.db
      .select({
        id: retentionHolds.id,
        kind: retentionHolds.kind,
        reason: retentionHolds.reason,
        until: retentionHolds.until,
        createdAt: retentionHolds.createdAt,
        userId: retentionHolds.userId,
        studentName: holdUser.name,
        studentNumber: holdUser.username,
        assignmentId: retentionHolds.assignmentId,
        assignmentTitle: assignments.title,
        testTitle: tests.title,
        className: classes.name,
        createdByName: createdBy.name,
      })
      .from(retentionHolds)
      .leftJoin(holdUser, eq(holdUser.id, retentionHolds.userId))
      .leftJoin(assignments, eq(assignments.id, retentionHolds.assignmentId))
      .leftJoin(tests, eq(tests.id, assignments.testId))
      .leftJoin(classes, eq(classes.id, assignments.classId))
      .leftJoin(createdBy, eq(createdBy.id, retentionHolds.createdById))
      .orderBy(desc(retentionHolds.createdAt));
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      reason: r.reason,
      until: r.until,
      createdAt: r.createdAt,
      active: r.until == null || r.until.getTime() > now,
      userId: r.userId,
      studentName: r.studentName,
      studentNumber: r.studentNumber,
      assignmentId: r.assignmentId,
      assignmentTitle: r.assignmentId
        ? r.assignmentTitle?.trim() || r.testTitle
        : null,
      className: r.className,
      createdByName: r.createdByName,
    }));
  }),

  createHold: adminProcedure
    .input(
      z
        .object({
          userId: userIdSchema.optional(),
          assignmentId: z.uuid().optional(),
          kind: z.enum(["dispute", "exam_dossier"]),
          reason: reasonSchema,
          /** yyyy-mm-dd, inclusive. */
          until: isoDate.optional(),
        })
        .refine((v) => !!v.userId !== !!v.assignmentId, {
          message: "Kies een leerling of een afname.",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      let subjectLabel: string | null = null;
      if (input.userId) {
        subjectLabel = (await loadStudent(ctx.db, input.userId)).username;
      } else if (input.assignmentId) {
        const [a] = await ctx.db
          .select({ id: assignments.id })
          .from(assignments)
          .where(eq(assignments.id, input.assignmentId))
          .limit(1);
        if (!a) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Afname niet gevonden.",
          });
        }
      }
      let until: Date | null = null;
      if (input.until) {
        // End of that day in Dutch time.
        const result = await ctx.db.execute<{ until: string }>(
          sql`select (((${input.until}::date + 1)::timestamp at time zone 'Europe/Amsterdam') - interval '1 second')::text as until`,
        );
        until = toDate(result.rows[0]?.until);
        if (until && until.getTime() <= Date.now()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Kies een datum in de toekomst.",
          });
        }
      }
      const [hold] = await ctx.db
        .insert(retentionHolds)
        .values({
          userId: input.userId ?? null,
          assignmentId: input.assignmentId ?? null,
          kind: input.kind as RetentionHoldKind,
          reason: input.reason,
          until,
          createdById: ctx.user.id,
        })
        .returning({ id: retentionHolds.id });
      await auditFromCtx(ctx, {
        action: "privacy.hold_created",
        subjectType: input.userId ? "student" : "assignment",
        subjectId: input.userId ?? input.assignmentId ?? null,
        subjectUserId: input.userId ?? null,
        subjectLabel,
        details: { holdId: hold?.id, kind: input.kind },
      });
      return { id: hold?.id ?? null };
    }),

  removeHold: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [hold] = await ctx.db
        .select({
          id: retentionHolds.id,
          kind: retentionHolds.kind,
          userId: retentionHolds.userId,
          assignmentId: retentionHolds.assignmentId,
          username: user.username,
        })
        .from(retentionHolds)
        .leftJoin(user, eq(user.id, retentionHolds.userId))
        .where(eq(retentionHolds.id, input.id))
        .limit(1);
      if (!hold) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bewaarblokkade niet gevonden.",
        });
      }
      if (hold.kind === "restriction") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Dit is een beperking van de verwerking. Hef die op via ‘Beperking opheffen’.",
        });
      }
      await ctx.db.delete(retentionHolds).where(eq(retentionHolds.id, hold.id));
      await auditFromCtx(ctx, {
        action: "privacy.hold_removed",
        subjectType: hold.userId ? "student" : "assignment",
        subjectId: hold.userId ?? hold.assignmentId,
        subjectUserId: hold.userId,
        subjectLabel: hold.username,
        details: { holdId: hold.id, kind: hold.kind },
      });
      return { removed: true };
    }),

  /** Afnames for the hold dialog (newest first). */
  holdAssignments: adminProcedure
    .input(z.object({ search: z.string().trim().max(100).optional() }))
    .query(async ({ ctx, input }) => {
      const term = input.search
        ? `%${input.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
        : null;
      return ctx.db
        .select({
          id: assignments.id,
          title: sql<string>`coalesce(nullif(${assignments.title}, ''), ${tests.title})`,
          className: classes.name,
          mode: assignments.mode,
          createdAt: assignments.createdAt,
        })
        .from(assignments)
        .innerJoin(tests, eq(tests.id, assignments.testId))
        .innerJoin(classes, eq(classes.id, assignments.classId))
        .where(
          term
            ? or(
                sql`${assignments.title} ilike ${term}`,
                sql`${tests.title} ilike ${term}`,
                sql`${classes.name} ilike ${term}`,
              )
            : undefined,
        )
        .orderBy(desc(assignments.createdAt))
        .limit(500);
    }),

  /* ------------------------------ Audit log ----------------------------- */

  auditLog: adminProcedure
    .input(
      auditFilterSchema.extend({
        cursor: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = auditConditions(input);
      if (input.cursor) conditions.push(lt(auditLog.id, input.cursor));
      const rows = await queryAuditRows(ctx.db, conditions, input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        rows: page,
        nextCursor:
          rows.length > input.limit
            ? (page[page.length - 1]?.id ?? null)
            : null,
      };
    }),

  exportAuditLog: adminProcedure
    .input(auditFilterSchema)
    .mutation(async ({ ctx, input }) => {
      // "Today" in Dutch time: the date bounds are Europe/Amsterdam too, so
      // a UTC date would drop everything after local midnight.
      const to = input.to ?? amsterdamDate(new Date());
      const from =
        input.from ??
        new Date(Date.parse(`${to}T00:00:00Z`) - 30 * 86_400_000)
          .toISOString()
          .slice(0, 10);
      const days =
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
          86_400_000 +
        1;
      if (days < 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "De begindatum ligt na de einddatum.",
        });
      }
      if (days > 31) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Kies een periode van maximaal 31 dagen.",
        });
      }
      const filter = { ...input, from, to };
      const rows = await queryAuditRows(
        ctx.db,
        auditConditions(filter),
        50_000,
      );
      const csv = toCsv([
        ["Tijdstip", "Docent", "Handeling", "Betreft", "Details"],
        ...rows.map((r) => [
          formatDateTimeNl(r.createdAt),
          r.actorName ?? ACTOR_ROLE_LABELS[r.actorRole] ?? "",
          r.label,
          [
            r.subjectLabel,
            r.subjectName,
            r.subjectDeleted ? "(verwijderd)" : null,
          ]
            .filter(Boolean)
            .join(" "),
          [r.detailsText, r.ipPrefix ? `ip: ${r.ipPrefix}` : null]
            .filter(Boolean)
            .join(" · "),
        ]),
      ]);
      await auditFromCtx(ctx, {
        action: "privacy.audit_exported",
        subjectType: "system",
        details: { from, to, rowCount: rows.length },
      });
      return {
        csv,
        rowCount: rows.length,
        filename: `pensuma-logboek-${from}-tm-${to}.csv`,
      };
    }),

  /* ----------------------------- School year ---------------------------- */

  schoolYears: adminProcedure.query(({ ctx }) => listSchoolYears(ctx.db)),

  schoolYearPreview: adminProcedure
    .input(z.object({ schoolYear: schoolYearSchema }))
    .query(({ ctx, input }) => schoolYearPreview(ctx.db, input.schoolYear)),

  closeSchoolYear: adminProcedure
    .input(
      z.object({
        schoolYear: schoolYearSchema,
        archiveClasses: z.boolean(),
        deleteEvents: z.boolean(),
        deleteAttempts: z.boolean(),
        deleteLeavers: z.boolean(),
        confirm: z.literal("VERWIJDEREN", {
          error: "Typ VERWIJDEREN om te bevestigen.",
        }),
        password: passwordSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyOwnPassword(ctx.db, ctx.user.id, input.password);
      const [exists] = await ctx.db
        .select({ n: count() })
        .from(classes)
        .where(eq(classes.schoolYear, input.schoolYear));
      if (!exists?.n) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Er zijn geen klassen in dit schooljaar.",
        });
      }
      const result = await closeSchoolYear(ctx.db, {
        schoolYear: input.schoolYear,
        archiveClasses: input.archiveClasses,
        deleteEvents: input.deleteEvents,
        deleteAttempts: input.deleteAttempts,
        deleteLeavers: input.deleteLeavers,
        actor: actorFromCtx(ctx),
      });
      await auditFromCtx(ctx, {
        action: "privacy.school_year_closed",
        subjectType: "class",
        subjectLabel: input.schoolYear,
        details: {
          archivedClasses: result.archivedClasses,
          events: result.events,
          attempts: result.attempts,
          answers: result.answers,
          students: result.students,
          skippedByHold: result.skippedByHold,
          archiveClasses: input.archiveClasses,
          deleteEvents: input.deleteEvents,
          deleteAttempts: input.deleteAttempts,
          deleteLeavers: input.deleteLeavers,
        },
      });
      return result;
    }),

  /* ------------------------------- Security ----------------------------- */

  /** Breach response: sign everybody out except the caller. */
  revokeAllSessions: adminProcedure
    .input(z.object({ password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      await verifyOwnPassword(ctx.db, ctx.user.id, input.password);
      const deleted = await ctx.db
        .delete(session)
        .where(ne(session.id, ctx.session.session.id))
        .returning({ id: session.id });
      await auditFromCtx(ctx, {
        action: "privacy.sessions_revoked",
        subjectType: "system",
        details: { revokedCount: deleted.length },
      });
      return { revoked: deleted.length };
    }),

  /* ------------------------------- Register ----------------------------- */

  processingRegister: adminProcedure.query(async ({ ctx }) => {
    const { settings } = await getPrivacySettings(ctx.db);
    return {
      categories: DATA_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        examples: c.examples,
        subjects: c.subjects,
        purpose: c.purpose,
        legalBasis: c.legalBasis,
        retention: c.retention(settings),
        recipients: c.recipients,
        tables: c.tables,
        sharedTables: c.sharedTables ?? [],
      })),
      markdown: registerAsMarkdown(settings),
    };
  }),

  /* ---------------------------- Student: own data ----------------------- */

  myData: studentProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const [me] = await ctx.db
      .select({
        name: user.name,
        username: user.username,
        createdAt: user.createdAt,
        lastSignInAt: lastSignInSql(user.id),
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const [classRows, attemptRows, accommodation, { settings, updatedAt }] =
      await Promise.all([
        ctx.db
          .select({ name: classes.name, schoolYear: classes.schoolYear })
          .from(classMembers)
          .innerJoin(classes, eq(classes.id, classMembers.classId))
          .where(
            and(eq(classMembers.userId, userId), eq(classes.archived, false)),
          )
          .orderBy(classes.name),
        ctx.db
          .select({
            id: attempts.id,
            assignmentId: attempts.assignmentId,
            status: attempts.status,
            submittedAt: attempts.submittedAt,
            score: attempts.score,
            maxScore: attempts.maxScore,
            assignmentTitle: assignments.title,
            testTitle: tests.title,
            mode: assignments.mode,
            assignmentStatus: assignments.status,
            opensAt: assignments.opensAt,
            closesAt: assignments.closesAt,
            settings: assignments.settings,
            resultsReleased: assignments.resultsReleased,
            answers: sql<number>`(select count(*)::int from ${answers} where ${answers.attemptId} = ${attempts.id})`,
          })
          .from(attempts)
          .innerJoin(assignments, eq(assignments.id, attempts.assignmentId))
          .innerJoin(tests, eq(tests.id, assignments.testId))
          .where(eq(attempts.userId, userId))
          .orderBy(desc(attempts.startedAt)),
        ctx.db
          .select({
            extraTimePercent: studentAccommodations.extraTimePercent,
            allowPaste: studentAccommodations.allowPaste,
            ignoreFocusEvents: studentAccommodations.ignoreFocusEvents,
          })
          .from(studentAccommodations)
          .where(eq(studentAccommodations.userId, userId))
          .limit(1),
        getPrivacySettings(ctx.db),
      ]);
    const now = new Date();
    const submitted = attemptRows.filter((a) => a.status === "submitted");
    // Results that wait for the close stay hidden while a classmate with
    // verlengde tijd is still working (as on the portal).
    const working = await stillWorkingByAssignment(
      ctx.db,
      submitted.map((a) => ({
        id: a.assignmentId,
        status: a.assignmentStatus,
        opensAt: a.opensAt,
        closesAt: a.closesAt,
      })),
      now,
    );
    const visible = submitted.filter((a) => {
      try {
        return resultsVisible(
          {
            status: a.assignmentStatus,
            opensAt: a.opensAt,
            closesAt: a.closesAt,
            settings: a.settings,
            resultsReleased: a.resultsReleased,
          },
          now,
          working.get(a.assignmentId) ?? false,
        );
      } catch {
        return false;
      }
    });
    const acc = accommodation[0];
    return {
      profile: {
        name: me?.name ?? ctx.user.name,
        studentNumber: me?.username ?? ctx.user.username ?? "",
        createdAt: me?.createdAt ?? null,
        lastSignInAt: toDate(me?.lastSignInAt),
      },
      classes: classRows,
      accommodation:
        acc &&
        (acc.extraTimePercent > 0 || acc.allowPaste || acc.ignoreFocusEvents)
          ? acc
          : null,
      attempts: {
        total: attemptRows.length,
        submitted: submitted.length,
        withResults: visible.length,
        recent: visible.slice(0, 5).map((a) => {
          const parsed = assignmentSettingsSchema.safeParse(a.settings ?? {});
          return {
            id: a.id,
            title: a.assignmentTitle?.trim() || a.testTitle,
            mode: a.mode,
            submittedAt: a.submittedAt,
            answers: Number(a.answers),
            grade:
              a.score != null && a.maxScore != null
                ? computeGrade(
                    a.score,
                    a.maxScore,
                    parsed.success ? parsed.data.grading : undefined,
                  )
                : null,
          };
        }),
      },
      privacy: toPublicPrivacyInfo(settings, updatedAt),
    };
  }),

  /** The student's own data as JSON (only results they may already see). */
  exportMyData: studentProcedure.mutation(({ ctx }) =>
    loadStudentExport(ctx.db, ctx.user.id, "student"),
  ),
});
