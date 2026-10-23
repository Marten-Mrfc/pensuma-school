/**
 * Failed sign-in throttling (table login_throttle), used by the better-auth
 * hooks in src/server/auth.ts.
 *
 * Keys:
 *  - `acct:student:<leerlingnummer>`  a student account (username sign-in,
 *    or e-mail sign-in with the placeholder student domain)
 *  - `acct:email:<email>`             any other e-mail sign-in (teachers)
 *  - `ip:<address>`                   failures from one client IP, counted
 *    in a fixed 10-minute window that starts at the first failure
 *    (updated_at holds the window start for these rows)
 *
 * Accounts lock for 15 minutes after 8 failures. After a lock has expired
 * the next failure sets the counter to 8 − 3, so a guesser gets three more
 * tries instead of a fresh eight (and a single typo does not re-lock at
 * once).
 *
 * The network counter never refuses anyone by itself: a whole school signs
 * in from one NAT address, so one pupil must not be able to lock out every
 * pupil and teacher. While an address has LOGIN_IP_MAX_FAILURES failures
 * in its window (and for 10 minutes after the last one over the limit) it
 * is "restricted": student accounts signing in from it lock after
 * RESTRICTED_NETWORK_MAX_FAILURES failures instead of 8, which limits a
 * spray over many leerlingnummers. Accounts without failures, and teachers
 * (e-mail sign-in), sign in as usual; a teacher can lift a student's lock.
 *
 * Race-free counting: an attempt is reserved (counted) before the password
 * check, in one atomic upsert per key, so parallel requests cannot all pass
 * the lock check first. A success clears the account and gives the network
 * slot back; any outcome other than a wrong password (a malformed request,
 * a server error) gives both back, so only genuine 401s count.
 *
 * All times are compared in SQL (the columns have no time zone and are
 * written with now()). No server-only import: the retention CLI uses
 * studentThrottleKeys.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { isStudentEmail, STUDENT_EMAIL_DOMAIN } from "@/lib/auth-shared";
import type * as schema from "@/server/db/schema";
import { loginThrottle } from "@/server/db/schema";

type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export const MAX_FAILURES = 8;
export const LOCK_MINUTES = 15;
export const IP_WINDOW_MINUTES = 10;
export const IP_LOCK_MINUTES = 10;
/** Failures after an expired lock: the counter restarts at this value. */
export const FAILURES_AFTER_EXPIRED_LOCK = MAX_FAILURES - 3;
/**
 * Lock threshold for a student account while its network is restricted.
 * Equal to the restart value, so after an expired lock every further wrong
 * PIN from a restricted network re-locks at once (one guess per lock).
 */
export const RESTRICTED_NETWORK_MAX_FAILURES = FAILURES_AFTER_EXPIRED_LOCK;

export const ACCOUNT_LOCKED_MESSAGE = `Te veel mislukte pogingen. Probeer het over ${LOCK_MINUTES} minuten opnieuw of vraag je docent om hulp.`;

export const SIGN_IN_PATHS: ReadonlySet<string> = new Set([
  "/sign-in/username",
  "/sign-in/email",
]);

export type AccountKey = {
  key: string;
  kind: "student" | "email";
  /** The leerlingnummer or e-mail address (for the audit subjectLabel). */
  identifier: string;
};

const MAX_IDENTIFIER_LENGTH = 254;

/** The throttle key of a sign-in request body, or null without identifier. */
export function accountKeyFor(path: string, body: unknown): AccountKey | null {
  const b = (body ?? {}) as { username?: unknown; email?: unknown };
  const raw = path === "/sign-in/username" ? b.username : b.email;
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase().slice(0, MAX_IDENTIFIER_LENGTH);
  if (!id) return null;
  if (path === "/sign-in/username") {
    return { key: `acct:student:${id}`, kind: "student", identifier: id };
  }
  if (isStudentEmail(id)) {
    const nr = id.slice(0, id.lastIndexOf("@"));
    return { key: `acct:student:${nr}`, kind: "student", identifier: nr };
  }
  return { key: `acct:email:${id}`, kind: "email", identifier: id };
}

export function ipThrottleKey(ip: string): string {
  return `ip:${ip}`;
}

/**
 * Every login_throttle key that can hold this student's lock: the current
 * account key plus the per-path keys used before (rows that may still
 * exist after an upgrade).
 */
export function studentThrottleKeys(studentNumber: string): string[] {
  const nr = studentNumber.trim().toLowerCase();
  return [
    `acct:student:${nr}`,
    `/sign-in/username:${nr}`,
    `/sign-in/email:${`${nr}@${STUDENT_EMAIL_DOMAIN}`.toLowerCase()}`,
  ];
}

/**
 * The student's current lock: highest failure count over the keys, and
 * the latest lockedUntil that is still in the future. Null without rows.
 */
export async function getStudentLoginLock(
  db: Db,
  studentNumber: string,
): Promise<{ lockedUntil: Date | null; failures: number } | null> {
  const rows = await db
    .select({
      failures: loginThrottle.failures,
      lockedUntil: loginThrottle.lockedUntil,
      active: sql<boolean>`coalesce(${loginThrottle.lockedUntil} > now(), false)`,
    })
    .from(loginThrottle)
    .where(inArray(loginThrottle.key, studentThrottleKeys(studentNumber)));
  if (rows.length === 0) return null;
  let failures = 0;
  let lockedUntil: Date | null = null;
  for (const row of rows) {
    failures = Math.max(failures, row.failures);
    if (row.active && row.lockedUntil) {
      if (!lockedUntil || row.lockedUntil > lockedUntil) {
        lockedUntil = row.lockedUntil;
      }
    }
  }
  return { lockedUntil, failures };
}

/** Removes the student's failure counters and locks. Returns rows deleted. */
export async function clearStudentLoginThrottle(
  db: Db,
  studentNumber: string,
): Promise<number> {
  const result = await db
    .delete(loginThrottle)
    .where(inArray(loginThrottle.key, studentThrottleKeys(studentNumber)));
  return result.rowCount ?? 0;
}

const isLocked = sql<boolean>`coalesce(${loginThrottle.lockedUntil} > now(), false)`;

/** One reserved attempt on an account key. */
export type AccountReservation = {
  key: string;
  /** Failures counted on the key, this attempt included. */
  failures: number;
  /** This attempt set the lock: it was the last one allowed. */
  lockedNow: boolean;
  /** The threshold the attempt was counted against. */
  maxFailures: number;
};

/** One reserved attempt in an address's window. */
export type IpReservation = {
  key: string;
  /** Failures in the current window, this attempt included. */
  failures: number;
  /** The address is restricted (this attempt included). */
  restricted: boolean;
  /** This attempt reached the network threshold. */
  reachedLimit: boolean;
};

export type SignInReservation = {
  account: AccountReservation | null;
  ip: IpReservation | null;
};

/**
 * Counts one attempt for an account before the password is checked, unless
 * the account is locked (then null and nothing changes). One upsert, so
 * parallel attempts queue on the row: at most `maxFailures` pass per lock.
 */
export async function reserveAccountAttempt(
  db: Db,
  key: string,
  maxFailures: number,
): Promise<AccountReservation | null> {
  const t = loginThrottle;
  const expired = sql`(${t.lockedUntil} is not null and ${t.lockedUntil} <= now())`;
  const next = sql`(case when ${expired} then ${FAILURES_AFTER_EXPIRED_LOCK} else ${t.failures} + 1 end)`;
  const lockUntil = sql`now() + make_interval(mins => ${LOCK_MINUTES})`;
  const [row] = await db
    .insert(t)
    .values({
      key,
      failures: 1,
      lockedUntil: maxFailures <= 1 ? lockUntil : null,
      updatedAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        failures: next,
        lockedUntil: sql`(case when ${next} >= ${maxFailures} then ${lockUntil} else null end)`,
        updatedAt: sql`now()`,
      },
      // A locked row is left alone (no row returned): refused attempts
      // neither count nor extend the lock.
      setWhere: sql`not ${isLocked}`,
    })
    .returning({ failures: t.failures, locked: isLocked });
  if (!row) return null;
  return {
    key,
    failures: row.failures,
    lockedNow: row.locked,
    maxFailures,
  };
}

/**
 * Counts one attempt in the address's 10-minute window before the password
 * is checked. Reaching `maxFailures` restricts the address for 10 minutes
 * (renewed by every attempt over the limit).
 */
export async function reserveIpAttempt(
  db: Db,
  ip: string,
  maxFailures: number,
): Promise<IpReservation> {
  const t = loginThrottle;
  const key = ipThrottleKey(ip);
  const fresh = sql`(${t.updatedAt} < now() - make_interval(mins => ${IP_WINDOW_MINUTES}))`;
  const next = sql`(case when ${fresh} then 1 else ${t.failures} + 1 end)`;
  const [row] = await db
    .insert(t)
    .values({
      key,
      failures: 1,
      lockedUntil:
        maxFailures <= 1
          ? sql`now() + make_interval(mins => ${IP_LOCK_MINUTES})`
          : null,
      updatedAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        failures: next,
        lockedUntil: sql`(case when ${next} >= ${maxFailures} then now() + make_interval(mins => ${IP_LOCK_MINUTES}) when ${t.lockedUntil} > now() then ${t.lockedUntil} else null end)`,
        // Window start: only moves when a new window begins.
        updatedAt: sql`(case when ${fresh} then now() else ${t.updatedAt} end)`,
      },
    })
    .returning({ failures: t.failures, restricted: isLocked });
  const failures = row?.failures ?? 1;
  return {
    key,
    failures,
    restricted: row?.restricted ?? false,
    reachedLimit: failures === maxFailures,
  };
}

/**
 * Gives an attempt back that turned out not to be a wrong password. A row
 * that held only this attempt is removed; otherwise the count drops by one
 * and the lock is lifted when it falls below the threshold the attempt was
 * counted against (only this attempt can have set it).
 */
export async function releaseAccountAttempt(
  db: Db,
  reservation: AccountReservation,
): Promise<void> {
  const t = loginThrottle;
  const removed = await db
    .delete(t)
    .where(and(eq(t.key, reservation.key), sql`${t.failures} <= 1`));
  if ((removed.rowCount ?? 0) > 0) return;
  await db
    .update(t)
    .set({
      failures: sql`greatest(${t.failures} - 1, 0)`,
      lockedUntil: sql`(case when ${t.failures} - 1 < ${reservation.maxFailures} then null else ${t.lockedUntil} end)`,
      updatedAt: sql`${t.updatedAt}`,
    })
    .where(eq(t.key, reservation.key));
}

/**
 * Gives a network slot back (a success, or not a wrong password), so a
 * successful sign-in leaves no row behind. The window start and an active
 * restriction stay as they are.
 */
export async function releaseIpAttempt(
  db: Db,
  reservation: IpReservation,
): Promise<void> {
  const t = loginThrottle;
  const removed = await db
    .delete(t)
    .where(
      and(
        eq(t.key, reservation.key),
        sql`${t.failures} <= 1`,
        sql`not ${isLocked}`,
      ),
    );
  if ((removed.rowCount ?? 0) > 0) return;
  await db
    .update(t)
    .set({
      failures: sql`greatest(${t.failures} - 1, 0)`,
      updatedAt: sql`${t.updatedAt}`,
    })
    .where(eq(t.key, reservation.key));
}

export type ReserveSignInResult =
  | { ok: true; reservation: SignInReservation }
  | { ok: false; reason: "account_locked" };

/**
 * Before the password check of a sign-in: counts the attempt for the
 * address and the account. Student accounts get the stricter threshold
 * while the address is restricted; teachers (e-mail accounts) never do.
 * A locked account is refused and nothing stays counted.
 */
export async function reserveSignInAttempt(
  db: Db,
  input: {
    account: AccountKey | null;
    ip: string | null;
    ipMaxFailures: number;
  },
): Promise<ReserveSignInResult> {
  const ip = input.ip
    ? await reserveIpAttempt(db, input.ip, input.ipMaxFailures)
    : null;
  if (!input.account) return { ok: true, reservation: { account: null, ip } };
  const maxFailures =
    input.account.kind === "student" && ip?.restricted
      ? RESTRICTED_NETWORK_MAX_FAILURES
      : MAX_FAILURES;
  try {
    const account = await reserveAccountAttempt(
      db,
      input.account.key,
      maxFailures,
    );
    if (account) return { ok: true, reservation: { account, ip } };
  } catch (error) {
    if (ip) await releaseIpAttempt(db, ip).catch(() => {});
    throw error;
  }
  if (ip) await releaseIpAttempt(db, ip);
  return { ok: false, reason: "account_locked" };
}

/** Gives every part of a reservation back. */
export async function releaseSignInAttempt(
  db: Db,
  reservation: SignInReservation,
): Promise<void> {
  if (reservation.account) {
    await releaseAccountAttempt(db, reservation.account);
  }
  if (reservation.ip) await releaseIpAttempt(db, reservation.ip);
}

/** Forget an account's failures after a successful sign-in. */
export async function clearAccountKey(db: Db, key: string): Promise<void> {
  await db.delete(loginThrottle).where(eq(loginThrottle.key, key));
}

/**
 * Global password-spray detector: failures over all keys in a sliding
 * 10-minute window (per-minute buckets, in memory). `record` returns true
 * when the threshold is crossed and no alert was raised in the last 10
 * minutes. Pure (injectable clock).
 */
export class SprayDetector {
  private readonly buckets = new Map<number, number>();
  private lastAlertAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly threshold = 300,
    private readonly windowMinutes = 10,
  ) {}

  record(now = Date.now()): boolean {
    const minute = Math.floor(now / 60_000);
    this.buckets.set(minute, (this.buckets.get(minute) ?? 0) + 1);
    let total = 0;
    for (const [m, count] of this.buckets) {
      if (m <= minute - this.windowMinutes) this.buckets.delete(m);
      else total += count;
    }
    if (
      total > this.threshold &&
      now - this.lastAlertAt >= this.windowMinutes * 60_000
    ) {
      this.lastAlertAt = now;
      return true;
    }
    return false;
  }
}
