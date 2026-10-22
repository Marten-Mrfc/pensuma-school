/**
 * Retention engine (AVG art. 5(1)(e) storage limitation): deletes data
 * whose retention period has passed.
 *
 * Always: expired sessions and verification rows, rate-limit and
 * login-throttle counters older than 24 hours, attempt logs (attempt_event)
 * older than `attemptEventsDays`, audit log and retention reports older than
 * `auditLogMonths`. Only after the school confirmed the periods and enabled
 * auto-delete: submitted attempts (answers cascade) and student accounts
 * without an active class. Every deletion of personal data skips rows
 * covered by an active retention hold.
 *
 * Deliberately free of "server-only" and Next.js imports: it runs from
 * tRPC (ctx.db), from instrumentation (the scheduler) and from the CLI.
 */
import { type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  autoDeleteActive,
  computeRetentionCutoffs,
  emptyRetentionReport,
  type RetentionReport,
  type RetentionSettings,
} from "@/lib/privacy/retention";
import type { PrivacySettings } from "@/lib/privacy/settings";
import type * as schema from "@/server/db/schema";
import { retentionRuns } from "@/server/db/schema";
import { studentThrottleKeys } from "@/server/security/login-throttle";
import { auditSystem, writeAudit } from "./audit-writer";
import { getPrivacySettings } from "./settings-store";

export type RetentionDb = NodePgDatabase<typeof schema>;
export type RetentionTrigger = "schedule" | "manual" | "cli";

export type RunRetentionOptions = {
  now?: Date;
  dryRun?: boolean;
  trigger: RetentionTrigger;
  triggeredById?: string | null;
  /** Write a retention_run row (default true; previews pass false). */
  record?: boolean;
  /** Use these retention periods instead of the stored ones (previews). */
  retentionOverride?: Partial<RetentionSettings>;
};

export const RETENTION_BATCH_SIZE = 5000;

/* --------------------------------- SQL bits ------------------------------- */

/** A timestamptz parameter. */
const tz = (d: Date) => sql`${d.toISOString()}::timestamptz`;
/**
 * The same moment as a UTC wall-clock `timestamp` (better-auth tables use
 * timestamp without time zone and store UTC).
 */
const utc = (d: Date) =>
  sql`(${d.toISOString()}::timestamptz at time zone 'UTC')`;

/** No active hold on the attempt's student or assignment (alias `a`). */
const attemptNotHeld = (now: Date) => sql`not exists (
  select 1 from retention_hold h
  where (h.user_id = a.user_id or h.assignment_id = a.assignment_id)
    and (h.until is null or h.until > ${tz(now)})
)`;

/** No active hold on the student or on an assignment they took (alias `u`). */
const userNotHeld = (now: Date) => sql`not exists (
  select 1 from retention_hold h
  where (h.user_id = u.id or h.assignment_id in (
      select a2.assignment_id from attempt a2 where a2.user_id = u.id
    ))
    and (h.until is null or h.until > ${tz(now)})
)`;

async function count(db: RetentionDb, query: SQL): Promise<number> {
  const result = await db.execute<{ n: number | string }>(query);
  return Number(result.rows[0]?.n ?? 0);
}

/** Run a `delete … limit N returning` statement until a batch comes back short. */
async function deleteInBatches(
  db: RetentionDb,
  build: () => SQL,
): Promise<number> {
  let total = 0;
  for (;;) {
    const result = await db.execute(build());
    const n = result.rowCount ?? result.rows.length;
    total += n;
    if (n < RETENTION_BATCH_SIZE) return total;
  }
}

/* --------------------------------- Steps --------------------------------- */

async function technicalData(
  db: RetentionDb,
  report: RetentionReport,
  now: Date,
  cutoffs: ReturnType<typeof computeRetentionCutoffs>,
  dryRun: boolean,
) {
  const limit = RETENTION_BATCH_SIZE;
  const sessionWhere = sql`expires_at < ${utc(cutoffs.sessionsBefore)}`;
  const verificationWhere = sql`expires_at < ${utc(cutoffs.verificationBefore)}`;
  const rateLimitWhere = sql`last_request < ${cutoffs.rateLimitBeforeMs}`;
  const throttleWhere = sql`updated_at < ${utc(cutoffs.loginThrottleBefore)}
    and (locked_until is null or locked_until < ${utc(now)})`;

  if (dryRun) {
    report.sessions = await count(
      db,
      sql`select count(*)::int as n from "session" where ${sessionWhere}`,
    );
    report.verification = await count(
      db,
      sql`select count(*)::int as n from verification where ${verificationWhere}`,
    );
    report.rateLimit = await count(
      db,
      sql`select count(*)::int as n from rate_limit where ${rateLimitWhere}`,
    );
    report.loginThrottle = await count(
      db,
      sql`select count(*)::int as n from login_throttle where ${throttleWhere}`,
    );
    return;
  }
  report.sessions = await deleteInBatches(
    db,
    () => sql`delete from "session" where id in (
      select id from "session" where ${sessionWhere} limit ${limit}
    ) returning id`,
  );
  report.verification = await deleteInBatches(
    db,
    () => sql`delete from verification where id in (
      select id from verification where ${verificationWhere} limit ${limit}
    ) returning id`,
  );
  report.rateLimit = await deleteInBatches(
    db,
    () => sql`delete from rate_limit where id in (
      select id from rate_limit where ${rateLimitWhere} limit ${limit}
    ) returning id`,
  );
  report.loginThrottle = await deleteInBatches(
    db,
    () => sql`delete from login_throttle where key in (
      select key from login_throttle where ${throttleWhere} limit ${limit}
    ) returning key`,
  );
}

async function attemptEvents(
  db: RetentionDb,
  report: RetentionReport,
  now: Date,
  before: Date,
  dryRun: boolean,
) {
  const limit = RETENTION_BATCH_SIZE;
  const expired = sql`coalesce(a.submitted_at, a.updated_at) < ${tz(before)}`;
  const notHeld = attemptNotHeld(now);

  report.skippedByHold += await count(
    db,
    sql`select count(*)::int as n from attempt_event e
      join attempt a on a.id = e.attempt_id
      where ${expired} and not ${notHeld}`,
  );

  if (dryRun) {
    report.attemptEvents += await count(
      db,
      sql`select count(*)::int as n from attempt_event e
        join attempt a on a.id = e.attempt_id
        where ${expired} and ${notHeld}`,
    );
    report.attemptsReset = await count(
      db,
      sql`select count(*)::int as n from attempt a
        where a.focus_loss_count <> 0 and ${expired} and ${notHeld}`,
    );
    return;
  }
  report.attemptEvents += await deleteInBatches(
    db,
    () => sql`delete from attempt_event where id in (
      select e.id from attempt_event e
      join attempt a on a.id = e.attempt_id
      where ${expired} and ${notHeld}
      limit ${limit}
    ) returning id`,
  );
  // Raw SQL on purpose: updated_at must not move, or the attempt would
  // never age out.
  const reset = await db.execute(
    sql`update attempt a set focus_loss_count = 0
      where a.focus_loss_count <> 0 and ${expired} and ${notHeld}`,
  );
  report.attemptsReset = reset.rowCount ?? 0;
}

async function attempts(
  db: RetentionDb,
  report: RetentionReport,
  now: Date,
  before: Date,
  dryRun: boolean,
) {
  const limit = RETENTION_BATCH_SIZE;
  const expired = sql`a.status = 'submitted'
    and coalesce(s.closes_at, a.submitted_at, a.updated_at) < ${tz(before)}`;
  const notHeld = attemptNotHeld(now);
  const from = sql`from attempt a join assignment s on s.id = a.assignment_id`;

  report.skippedByHold += await count(
    db,
    sql`select count(*)::int as n ${from} where ${expired} and not ${notHeld}`,
  );

  if (dryRun) {
    const result = await db.execute<{
      attempts: number;
      answers: number;
      events: number;
    }>(sql`with doomed as (
        select a.id ${from} where ${expired} and ${notHeld}
      )
      select
        (select count(*) from doomed)::int as attempts,
        (select count(*) from answer where attempt_id in (select id from doomed))::int as answers,
        (select count(*) from attempt_event where attempt_id in (select id from doomed))::int as events`);
    const row = result.rows[0];
    report.attempts += Number(row?.attempts ?? 0);
    report.answers += Number(row?.answers ?? 0);
    report.attemptEvents += Number(row?.events ?? 0);
    return;
  }

  for (;;) {
    // One statement per batch: the counts see the snapshot before the
    // cascade, the delete removes the attempts (answers and events cascade).
    const result = await db.execute<{
      attempts: number;
      answers: number;
      events: number;
    }>(sql`with doomed as (
        select a.id ${from} where ${expired} and ${notHeld} limit ${limit}
      ),
      counted as (
        select
          (select count(*) from answer where attempt_id in (select id from doomed)) as answers,
          (select count(*) from attempt_event where attempt_id in (select id from doomed)) as events
      ),
      deleted as (
        delete from attempt where id in (select id from doomed) returning id
      )
      select
        (select count(*) from deleted)::int as attempts,
        (select answers from counted)::int as answers,
        (select events from counted)::int as events`);
    const row = result.rows[0];
    const n = Number(row?.attempts ?? 0);
    report.attempts += n;
    report.answers += Number(row?.answers ?? 0);
    report.attemptEvents += Number(row?.events ?? 0);
    if (n < limit) return;
  }
}

async function inactiveStudents(
  db: RetentionDb,
  report: RetentionReport,
  now: Date,
  before: Date,
  dryRun: boolean,
) {
  const limit = RETENTION_BATCH_SIZE;
  const inactive = sql`u.role = 'student'
    and not exists (
      select 1 from class_member cm join class c on c.id = cm.class_id
      where cm.user_id = u.id and c.archived = false
    )
    and coalesce(ua.last_sign_in_at, u.created_at at time zone 'UTC') < ${tz(before)}`;
  const notHeld = userNotHeld(now);
  const from = sql`from "user" u left join user_activity ua on ua.user_id = u.id`;

  report.skippedByHold += await count(
    db,
    sql`select count(*)::int as n ${from} where ${inactive} and not ${notHeld}`,
  );

  const totals = (ids: SQL) => sql`select
      (select count(*) from attempt where user_id in (${ids}))::int as attempts,
      (select count(*) from answer an join attempt a on a.id = an.attempt_id
        where a.user_id in (${ids}))::int as answers,
      (select count(*) from attempt_event e join attempt a on a.id = e.attempt_id
        where a.user_id in (${ids}))::int as events`;

  if (dryRun) {
    // Estimate: attempts that the attempts step would also remove are
    // counted again here (a real run deletes them only once).
    const doomed = sql`select u.id ${from} where ${inactive} and ${notHeld}`;
    report.inactiveStudents += await count(
      db,
      sql`select count(*)::int as n from (${doomed}) d`,
    );
    const result = await db.execute<{
      attempts: number;
      answers: number;
      events: number;
    }>(totals(doomed));
    const row = result.rows[0];
    report.attempts += Number(row?.attempts ?? 0);
    report.answers += Number(row?.answers ?? 0);
    report.attemptEvents += Number(row?.events ?? 0);
    return;
  }

  for (;;) {
    const n = await db.transaction(async (tx) => {
      const batch = await tx.execute<{ id: string; username: string | null }>(
        sql`select u.id, u.username ${from}
          where ${inactive} and ${notHeld}
          order by u.id limit ${limit}
          for update of u skip locked`,
      );
      const rows = batch.rows;
      if (rows.length === 0) return 0;
      const ids = sql.join(
        rows.map((r) => sql`${r.id}`),
        sql`, `,
      );
      const counted = await tx.execute<{
        attempts: number;
        answers: number;
        events: number;
      }>(totals(ids));
      const c = counted.rows[0];
      report.attempts += Number(c?.attempts ?? 0);
      report.answers += Number(c?.answers ?? 0);
      report.attemptEvents += Number(c?.events ?? 0);
      await tx.execute(sql`delete from "user" where id in (${ids})`);
      // Lockout counters keyed by leerlingnummer (they expire anyway).
      const keys = rows.flatMap((r) =>
        r.username ? studentThrottleKeys(r.username) : [],
      );
      if (keys.length > 0) {
        await tx.execute(
          sql`delete from login_throttle where key in (${sql.join(
            keys.map((k) => sql`${k}`),
            sql`, `,
          )})`,
        );
      }
      // Proof of erasure per student: leerlingnummer only, no name.
      for (const r of rows) {
        await writeAudit(tx, {
          actorId: null,
          actorRole: "system",
          action: "student.deleted",
          subjectType: "student",
          subjectId: r.id,
          subjectUserId: r.id,
          subjectLabel: r.username,
          details: { via: "retention" },
        });
      }
      return rows.length;
    });
    report.inactiveStudents += n;
    if (n < limit) return;
  }
}

async function auditAndRuns(
  db: RetentionDb,
  report: RetentionReport,
  before: Date,
  dryRun: boolean,
) {
  const limit = RETENTION_BATCH_SIZE;
  const auditWhere = sql`created_at < ${tz(before)}`;
  const runWhere = sql`started_at < ${tz(before)}`;
  if (dryRun) {
    report.auditLog = await count(
      db,
      sql`select count(*)::int as n from audit_log where ${auditWhere}`,
    );
    report.retentionRuns = await count(
      db,
      sql`select count(*)::int as n from retention_run where ${runWhere}`,
    );
    return;
  }
  report.auditLog = await deleteInBatches(
    db,
    () => sql`delete from audit_log where id in (
      select id from audit_log where ${auditWhere} limit ${limit}
    ) returning id`,
  );
  report.retentionRuns = await deleteInBatches(
    db,
    () => sql`delete from retention_run where id in (
      select id from retention_run where ${runWhere} limit ${limit}
    ) returning id`,
  );
}

/* ---------------------------------- API ---------------------------------- */

function applyOverride(
  settings: PrivacySettings,
  override: Partial<RetentionSettings> | undefined,
): PrivacySettings {
  if (!override) return settings;
  return { ...settings, retention: { ...settings.retention, ...override } };
}

/** Counts per kind of data in a run report (for logs and audit details). */
export function reportCounts(report: RetentionReport) {
  const { dryRun: _d, startedAt: _s, finishedAt: _f, ...counts } = report;
  return counts;
}

/**
 * Apply the retention periods. Returns what was deleted (or, with dryRun,
 * what would be deleted). Records a retention_run row (unless
 * `record: false`) and, for real runs, a `privacy.retention_run` audit row.
 */
export async function runRetention(
  db: RetentionDb,
  options: RunRetentionOptions,
): Promise<RetentionReport> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const record = options.record ?? true;
  const startedAt = new Date();
  const report = emptyRetentionReport(dryRun, startedAt);

  try {
    const stored = await getPrivacySettings(db);
    const settings = applyOverride(stored.settings, options.retentionOverride);
    const cutoffs = computeRetentionCutoffs(settings.retention, now);

    await technicalData(db, report, now, cutoffs, dryRun);
    await attemptEvents(db, report, now, cutoffs.attemptEventsBefore, dryRun);
    if (cutoffs.attemptsBefore && autoDeleteActive(settings.retention)) {
      await attempts(db, report, now, cutoffs.attemptsBefore, dryRun);
    }
    if (cutoffs.inactiveStudentsBefore) {
      await inactiveStudents(
        db,
        report,
        now,
        cutoffs.inactiveStudentsBefore,
        dryRun,
      );
    }
    await auditAndRuns(db, report, cutoffs.auditLogBefore, dryRun);
    report.finishedAt = new Date().toISOString();

    if (record) {
      await db.insert(retentionRuns).values({
        trigger: options.trigger,
        triggeredById: options.triggeredById ?? null,
        dryRun,
        startedAt,
        finishedAt: new Date(report.finishedAt),
        report,
      });
    }
    if (!dryRun) {
      await auditSystem(db, {
        action: "privacy.retention_run",
        subjectType: "system",
        details: {
          ...reportCounts(report),
          trigger: options.trigger,
          triggeredById: options.triggeredById ?? null,
        },
      });
    }
    return report;
  } catch (error) {
    if (record) {
      try {
        await db.insert(retentionRuns).values({
          trigger: options.trigger,
          triggeredById: options.triggeredById ?? null,
          dryRun,
          startedAt,
          finishedAt: new Date(),
          report: { ...report, finishedAt: new Date().toISOString() },
          error: (error instanceof Error ? error.message : String(error)).slice(
            0,
            1000,
          ),
        });
      } catch {
        // The database itself is probably unavailable; the caller logs.
      }
    }
    throw error;
  }
}

/** What the next run would delete (nothing is changed or recorded). */
export function previewRetention(
  db: RetentionDb,
  now: Date = new Date(),
  retentionOverride?: Partial<RetentionSettings>,
): Promise<RetentionReport> {
  return runRetention(db, {
    now,
    dryRun: true,
    trigger: "manual",
    record: false,
    retentionOverride,
  });
}
