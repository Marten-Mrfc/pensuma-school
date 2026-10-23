/**
 * Year-end close (schooljaar afsluiten): archive the classes of a school
 * year and, optionally, delete the attempt logs, the attempts and the
 * accounts of students who leave. Retention holds are always respected.
 */
import { type SQL, sql } from "drizzle-orm";
import type { RetentionHoldKind } from "@/lib/privacy/retention";
import { studentThrottleKeys } from "@/server/security/login-throttle";
import {
  type AuditActor,
  type AuditDb,
  redactErasedStudentsAudit,
  writeAudit,
} from "./audit-writer";

export type SchoolYearSummary = {
  schoolYear: string;
  classes: number;
  archivedClasses: number;
  students: number;
  attempts: number;
};

export type SchoolYearHold = {
  id: string;
  kind: RetentionHoldKind;
  reason: string;
  until: Date | null;
  /** "17053 · Sem de Vries" or the assignment title. */
  target: string;
};

export type SchoolYearPreview = SchoolYearSummary & {
  answers: number;
  events: number;
  /** Students not in an active class of another (later) year. */
  leavers: number;
  holds: SchoolYearHold[];
};

export type CloseSchoolYearOptions = {
  schoolYear: string;
  archiveClasses: boolean;
  deleteEvents: boolean;
  deleteAttempts: boolean;
  deleteLeavers: boolean;
  /** Who closes the year (for the per-student `student.deleted` rows). */
  actor: AuditActor;
};

export type CloseSchoolYearResult = {
  schoolYear: string;
  archivedClasses: number;
  events: number;
  attemptsReset: number;
  attempts: number;
  answers: number;
  students: number;
  skippedByHold: number;
  holds: SchoolYearHold[];
};

/* --------------------------------- SQL bits ------------------------------- */

const yearClasses = (year: string) =>
  sql`select c.id from class c where c.school_year = ${year}`;

const yearAttempts = (year: string) => sql`select a.id from attempt a
  join assignment s on s.id = a.assignment_id
  where s.class_id in (${yearClasses(year)})`;

/**
 * Students of this year who are not in a class of a later year and not in
 * any other non-archived class: they leave (or already left) the school.
 */
const leaverIds = (year: string) => sql`select distinct cm.user_id as id
  from class_member cm
  join "user" u on u.id = cm.user_id and u.role = 'student'
  where cm.class_id in (${yearClasses(year)})
    and not exists (
      select 1 from class_member cm2 join class c2 on c2.id = cm2.class_id
      where cm2.user_id = cm.user_id
        and (c2.school_year is distinct from ${year})
        and (c2.school_year > ${year} or c2.archived = false)
    )`;

const activeHold = sql`(h.until is null or h.until > now())`;

const attemptNotHeld = sql`not exists (
  select 1 from retention_hold h
  where (h.user_id = a.user_id or h.assignment_id = a.assignment_id)
    and ${activeHold}
)`;

const userNotHeld = sql`not exists (
  select 1 from retention_hold h
  where (h.user_id = u.id or h.assignment_id in (
      select a2.assignment_id from attempt a2 where a2.user_id = u.id
    ))
    and ${activeHold}
)`;

async function one<T extends Record<string, unknown>>(
  db: AuditDb,
  query: SQL,
): Promise<T> {
  const result = await db.execute<T>(query);
  return (result.rows[0] ?? {}) as T;
}

const n = (value: unknown) => Number(value ?? 0);

/* ---------------------------------- Reads --------------------------------- */

/** Every school year that has classes, newest first. */
export async function listSchoolYears(db: AuditDb): Promise<{
  years: SchoolYearSummary[];
  classesWithoutYear: number;
}> {
  const result = await db.execute<{
    school_year: string;
    classes: number;
    archived: number;
    students: number;
    attempts: number;
  }>(sql`select c.school_year,
      count(*)::int as classes,
      count(*) filter (where c.archived)::int as archived,
      (select count(distinct cm.user_id) from class_member cm
        join class c3 on c3.id = cm.class_id
        where c3.school_year = c.school_year)::int as students,
      (select count(*) from attempt a join assignment s on s.id = a.assignment_id
        join class c4 on c4.id = s.class_id
        where c4.school_year = c.school_year)::int as attempts
    from class c
    where c.school_year is not null and c.school_year <> ''
    group by c.school_year
    order by c.school_year desc`);
  const without = await one<{ n: number }>(
    db,
    sql`select count(*)::int as n from class
      where school_year is null or school_year = ''`,
  );
  return {
    years: result.rows.map((r) => ({
      schoolYear: r.school_year,
      classes: n(r.classes),
      archivedClasses: n(r.archived),
      students: n(r.students),
      attempts: n(r.attempts),
    })),
    classesWithoutYear: n(without.n),
  };
}

/** Active holds that touch this year (its assignments, attempts or leavers). */
async function yearHolds(db: AuditDb, year: string): Promise<SchoolYearHold[]> {
  const result = await db.execute<{
    id: string;
    kind: RetentionHoldKind;
    reason: string;
    until: string | Date | null;
    username: string | null;
    name: string | null;
    assignment_title: string | null;
  }>(sql`select h.id, h.kind, h.reason, h.until,
      u.username, u.name,
      coalesce(nullif(s.title, ''), t.title) as assignment_title
    from retention_hold h
    left join "user" u on u.id = h.user_id
    left join assignment s on s.id = h.assignment_id
    left join test t on t.id = s.test_id
    where ${activeHold}
      and (
        s.class_id in (${yearClasses(year)})
        or h.user_id in (
          select cm.user_id from class_member cm
          where cm.class_id in (${yearClasses(year)})
        )
      )
    order by h.created_at`);
  return result.rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    reason: r.reason,
    until: r.until ? new Date(r.until) : null,
    target: r.assignment_title
      ? `Afname: ${r.assignment_title}`
      : [r.username, r.name].filter(Boolean).join(" · ") || "Leerling",
  }));
}

export async function schoolYearPreview(
  db: AuditDb,
  year: string,
): Promise<SchoolYearPreview> {
  const counts = await one<Record<string, number>>(
    db,
    sql`select
      (select count(*) from class where school_year = ${year})::int as classes,
      (select count(*) from class where school_year = ${year} and archived)::int as archived,
      (select count(distinct cm.user_id) from class_member cm
        where cm.class_id in (${yearClasses(year)}))::int as students,
      (select count(*) from (${yearAttempts(year)}) x)::int as attempts,
      (select count(*) from answer where attempt_id in (${yearAttempts(year)}))::int as answers,
      (select count(*) from attempt_event where attempt_id in (${yearAttempts(year)}))::int as events,
      (select count(*) from (${leaverIds(year)}) l)::int as leavers`,
  );
  return {
    schoolYear: year,
    classes: n(counts.classes),
    archivedClasses: n(counts.archived),
    students: n(counts.students),
    attempts: n(counts.attempts),
    answers: n(counts.answers),
    events: n(counts.events),
    leavers: n(counts.leavers),
    holds: await yearHolds(db, year),
  };
}

/* ---------------------------------- Close --------------------------------- */

/**
 * Close a school year in one transaction. Writes `student.deleted` per
 * deleted leaver; the caller writes `privacy.school_year_closed`.
 */
export async function closeSchoolYear(
  db: AuditDb,
  options: CloseSchoolYearOptions,
): Promise<CloseSchoolYearResult> {
  const year = options.schoolYear;
  const holds = await yearHolds(db, year);
  return db.transaction(async (tx) => {
    const result: CloseSchoolYearResult = {
      schoolYear: year,
      archivedClasses: 0,
      events: 0,
      attemptsReset: 0,
      attempts: 0,
      answers: 0,
      students: 0,
      skippedByHold: 0,
      holds,
    };
    const attemptsOfYear = sql`a.assignment_id in (
      select s.id from assignment s where s.class_id in (${yearClasses(year)})
    )`;

    if (options.deleteAttempts) {
      const skipped = await one<{ n: number }>(
        tx,
        sql`select count(*)::int as n from attempt a
          where ${attemptsOfYear} and not ${attemptNotHeld}`,
      );
      result.skippedByHold += n(skipped.n);
      const deleted = await one<Record<string, number>>(
        tx,
        sql`with doomed as (
            select a.id from attempt a where ${attemptsOfYear} and ${attemptNotHeld}
          ),
          counted as (
            select
              (select count(*) from answer where attempt_id in (select id from doomed)) as answers,
              (select count(*) from attempt_event where attempt_id in (select id from doomed)) as events
          ),
          deleted as (
            delete from attempt where id in (select id from doomed) returning id
          )
          select (select count(*) from deleted)::int as attempts,
            (select answers from counted)::int as answers,
            (select events from counted)::int as events`,
      );
      result.attempts = n(deleted.attempts);
      result.answers = n(deleted.answers);
      result.events += n(deleted.events);
    }

    if (options.deleteEvents) {
      const held = await one<{ n: number }>(
        tx,
        sql`select count(*)::int as n from attempt_event e
          join attempt a on a.id = e.attempt_id
          where ${attemptsOfYear} and not ${attemptNotHeld}`,
      );
      if (!options.deleteAttempts) result.skippedByHold += n(held.n);
      const deleted = await tx.execute(
        sql`delete from attempt_event where attempt_id in (
          select a.id from attempt a where ${attemptsOfYear} and ${attemptNotHeld}
        )`,
      );
      result.events += deleted.rowCount ?? 0;
      const reset = await tx.execute(
        sql`update attempt a set focus_loss_count = 0
          where a.focus_loss_count <> 0 and ${attemptsOfYear} and ${attemptNotHeld}`,
      );
      result.attemptsReset = reset.rowCount ?? 0;
    }

    if (options.deleteLeavers) {
      const leavers = sql`u.id in (${leaverIds(year)})`;
      const skipped = await one<{ n: number }>(
        tx,
        sql`select count(*)::int as n from "user" u
          where ${leavers} and not ${userNotHeld}`,
      );
      result.skippedByHold += n(skipped.n);
      const doomed = await tx.execute<{ id: string; username: string | null }>(
        sql`select u.id, u.username from "user" u
          where ${leavers} and ${userNotHeld}`,
      );
      const rows = doomed.rows;
      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000);
        const ids = sql.join(
          chunk.map((r) => sql`${r.id}`),
          sql`, `,
        );
        const counted = await one<Record<string, number>>(
          tx,
          sql`select
            (select count(*) from attempt where user_id in (${ids}))::int as attempts,
            (select count(*) from answer an join attempt a on a.id = an.attempt_id
              where a.user_id in (${ids}))::int as answers,
            (select count(*) from attempt_event e join attempt a on a.id = e.attempt_id
              where a.user_id in (${ids}))::int as events`,
        );
        result.attempts += n(counted.attempts);
        result.answers += n(counted.answers);
        result.events += n(counted.events);
        await tx.execute(sql`delete from "user" where id in (${ids})`);
        const keys = chunk.flatMap((r) =>
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
        // Earlier audit rows keep that something happened, not the scores
        // or facilities of the deleted students.
        await redactErasedStudentsAudit(
          tx,
          chunk.map((r) => r.id),
        );
        for (const r of chunk) {
          await writeAudit(tx, {
            ...options.actor,
            action: "student.deleted",
            subjectType: "student",
            subjectId: r.id,
            subjectUserId: r.id,
            subjectLabel: r.username,
            details: { via: "school_year" },
          });
        }
      }
      result.students = rows.length;
    }

    if (options.archiveClasses) {
      const archived = await tx.execute(
        sql`update class set archived = true, updated_at = now()
          where school_year = ${year} and archived = false`,
      );
      result.archivedClasses = archived.rowCount ?? 0;
    }
    return result;
  });
}
