/**
 * Privacy (AVG/GDPR) tables: settings, audit log, retention holds and runs,
 * last sign-in. See src/lib/privacy/* for the shared contracts.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AuditAction,
  AuditSubjectType,
} from "@/lib/privacy/audit-actions";
import type {
  RetentionHoldKind,
  RetentionReport,
} from "@/lib/privacy/retention";
import { assignments } from "./app";
import { user } from "./auth";

/**
 * Key/value settings. Keys used: "privacy" → PrivacySettings (validate with
 * `privacySettingsSchema`), "setup_completed_at" → ISO string.
 */
export const appSettings = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedById: text("updated_by_id").references(() => user.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Append-only audit log. No foreign keys on purpose: rows outlive deleted
 * accounts (proof of erasure, accountability). Details hold ids and counts
 * only, never content, names or PINs (see sanitizeAuditDetails).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** Null = system. */
    actorId: text("actor_id"),
    actorRole: text("actor_role")
      .$type<"admin" | "student" | "system">()
      .notNull(),
    /** Name snapshot (teachers only). */
    actorName: text("actor_name"),
    impersonatorId: text("impersonator_id"),
    action: text("action").$type<AuditAction>().notNull(),
    subjectType: text("subject_type").$type<AuditSubjectType>(),
    subjectId: text("subject_id"),
    /** The student concerned. */
    subjectUserId: text("subject_user_id"),
    /** E.g. the leerlingnummer "17053". */
    subjectLabel: text("subject_label"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    /** Truncated IP: "192.0.2.0/24" or "2001:db8:1::/48" (teachers only). */
    ipPrefix: text("ip_prefix"),
  },
  (t) => [
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_subject_user_idx").on(t.subjectUserId, t.createdAt),
    index("audit_log_actor_idx").on(t.actorId, t.createdAt),
    index("audit_log_action_idx").on(t.action, t.createdAt),
  ],
);

/**
 * Excludes data from automatic deletion (bezwaar/beroep, examendossier,
 * AVG art. 18 restriction). Targets a student, an assignment, or both.
 */
export const retentionHolds = pgTable(
  "retention_hold",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id").references(() => assignments.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").$type<RetentionHoldKind>().notNull(),
    reason: text("reason").notNull(),
    /** Null = until removed. */
    until: timestamp("until", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "retention_hold_target",
      sql`${t.userId} is not null or ${t.assignmentId} is not null`,
    ),
    index("retention_hold_user_idx").on(t.userId),
    index("retention_hold_assignment_idx").on(t.assignmentId),
  ],
);

/** Last successful sign-in (sessions are deleted at expiry). No IP address. */
export const userActivity = pgTable("user_activity", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }).notNull(),
});

/** One row per run of the retention engine. */
export const retentionRuns = pgTable(
  "retention_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trigger: text("trigger").$type<"schedule" | "manual" | "cli">().notNull(),
    triggeredById: text("triggered_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    dryRun: boolean("dry_run").default(false).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    report: jsonb("report").$type<RetentionReport>(),
    error: text("error"),
  },
  (t) => [index("retention_run_started_idx").on(t.startedAt)],
);
