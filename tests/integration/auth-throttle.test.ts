/**
 * Sign-in throttling under load and on a shared school network, plus the
 * session lifetime and cookies a sign-in leaves behind (better-auth in
 * process, real hooks and database).
 *
 *  - parallel wrong PINs cannot overrun the account lock (check-then-record
 *    race)
 *  - many failures from one address (a school's NAT) never refuse a
 *    teacher or a pupil without failures; pupils get a stricter lock
 *  - only genuine wrong passwords count
 *  - student sessions end 12 hours after signing in; no session_data cookie
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { auditLog, loginThrottle, session } from "@/server/db/schema";
import {
  clearStudentLoginThrottle,
  FAILURES_AFTER_EXPIRED_LOCK,
  MAX_FAILURES,
  RESTRICTED_NETWORK_MAX_FAILURES,
} from "@/server/security/login-throttle";
import { testHeaders } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  createStudentLogin,
  createTeacherAccount,
  nextStudentNumber,
} from "../support/factories";

beforeEach(resetDatabase);

const LOCKED_MESSAGE =
  "Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw of vraag je docent om hulp.";
/** Production default (LOGIN_IP_MAX_FAILURES is unset in the tests too). */
const IP_MAX_FAILURES = 100;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

type Outcome = {
  status: number;
  message: string;
  code: string;
  setCookie: string[];
};

async function outcome(run: () => Promise<Response>): Promise<Outcome> {
  try {
    const res = await run();
    const text = await res.text();
    let body: { message?: string; code?: string } = {};
    try {
      body = JSON.parse(text) as typeof body;
    } catch {}
    return {
      status: res.status,
      message: body.message ?? "",
      code: body.code ?? "",
      setCookie: res.headers.getSetCookie(),
    };
  } catch (err) {
    const e = err as {
      statusCode?: number;
      message?: string;
      body?: { code?: string };
    };
    return {
      status: e.statusCode ?? 500,
      message: e.message ?? "",
      code: e.body?.code ?? "",
      setCookie: [],
    };
  }
}

const signInStudent = (
  username: string,
  password: string,
  opts: { ip?: string; rememberMe?: boolean } = {},
) =>
  outcome(() =>
    auth.api.signInUsername({
      body: {
        username,
        password,
        ...(opts.rememberMe === undefined
          ? {}
          : { rememberMe: opts.rememberMe }),
      },
      headers: testHeaders(
        opts.ip ? { "x-forwarded-for": opts.ip } : undefined,
      ),
      asResponse: true,
    }),
  );

const signInEmail = (email: string, password: string, ip?: string) =>
  outcome(() =>
    auth.api.signInEmail({
      body: { email, password },
      headers: testHeaders(ip ? { "x-forwarded-for": ip } : undefined),
      asResponse: true,
    }),
  );

async function throttleRow(key: string) {
  const [row] = await db
    .select({
      failures: loginThrottle.failures,
      locked: sql<boolean>`coalesce(${loginThrottle.lockedUntil} > now(), false)`,
    })
    .from(loginThrottle)
    .where(eq(loginThrottle.key, key));
  return row ?? null;
}

type AuditAction = typeof auditLog.$inferSelect.action;

async function auditDetails(action: AuditAction) {
  const rows = await db
    .select({ details: auditLog.details, subjectLabel: auditLog.subjectLabel })
    .from(auditLog)
    .where(eq(auditLog.action, action));
  return rows;
}

async function auditCount(action: AuditAction) {
  return (await auditDetails(action)).length;
}

function statusCounts(outcomes: Outcome[]) {
  const counts: Record<number, number> = {};
  for (const o of outcomes) counts[o.status] = (counts[o.status] ?? 0) + 1;
  return counts;
}

/** `count` wrong PINs for made-up leerlingnummers from one address. */
async function sprayFrom(ip: string, count: number) {
  const outs = await Promise.all(
    Array.from({ length: count }, () =>
      signInStudent(nextStudentNumber(), "000000", { ip }),
    ),
  );
  return statusCounts(outs);
}

describe("parallel wrong PINs (check-then-record race)", () => {
  test("20 at once check exactly 8 PINs, then the account is locked", async () => {
    const s = await createStudentLogin({ pin: "246810" });
    const outs = await Promise.all(
      Array.from({ length: 20 }, () => signInStudent(s.number, "135792")),
    );
    expect(statusCounts(outs)).toEqual({
      401: MAX_FAILURES,
      429: 20 - MAX_FAILURES,
    });
    for (const o of outs.filter((o) => o.status === 429)) {
      expect(o.message).toBe(LOCKED_MESSAGE);
      expect(o.code).toBe("ACCOUNT_LOCKED");
    }
    expect(await throttleRow(`acct:student:${s.number}`)).toEqual({
      failures: MAX_FAILURES,
      locked: true,
    });
    // Refused attempts are not counted against the network.
    expect((await throttleRow("ip:127.0.0.1"))?.failures).toBe(MAX_FAILURES);
    expect(await auditDetails("auth.account_locked")).toEqual([
      {
        subjectLabel: s.number,
        details: { failuresCount: MAX_FAILURES, threshold: MAX_FAILURES },
      },
    ]);
    // The right PIN waits for the lock too.
    expect((await signInStudent(s.number, s.pin)).status).toBe(429);
  });

  test("after an expired lock, parallel attempts get the short restart only", async () => {
    const s = await createStudentLogin({ pin: "246810" });
    for (let i = 0; i < MAX_FAILURES; i++) {
      await signInStudent(s.number, "135792");
    }
    await db
      .update(loginThrottle)
      .set({ lockedUntil: sql`now() - interval '1 minute'` })
      .where(eq(loginThrottle.key, `acct:student:${s.number}`));
    const outs = await Promise.all(
      Array.from({ length: 10 }, () => signInStudent(s.number, "135792")),
    );
    const allowed = MAX_FAILURES - FAILURES_AFTER_EXPIRED_LOCK + 1;
    expect(statusCounts(outs)).toEqual({ 401: allowed, 429: 10 - allowed });
    expect(await throttleRow(`acct:student:${s.number}`)).toEqual({
      failures: MAX_FAILURES,
      locked: true,
    });
  });
});

describe("only wrong passwords count", () => {
  test("malformed sign-ins neither count nor lock", async () => {
    const s = await createStudentLogin({ pin: "246810" });
    const tooLong = "1".repeat(200);
    for (let i = 0; i < MAX_FAILURES + 2; i++) {
      const out = await signInStudent(s.number, tooLong);
      expect(out.status).toBe(400);
    }
    // Too short to be a leerlingnummer: refused before any password work.
    expect((await signInStudent("ab", "246810")).status).toBe(422);
    expect(await throttleRow("acct:student:ab")).toBeNull();
    expect((await throttleRow(`acct:student:${s.number}`))?.failures ?? 0).toBe(
      0,
    );
    expect((await throttleRow("acct:student:ab"))?.failures ?? 0).toBe(0);
    expect((await throttleRow("ip:127.0.0.1"))?.failures ?? 0).toBe(0);
    expect((await signInStudent(s.number, s.pin)).status).toBe(200);
  });

  test("successful sign-ins give the network slot back", async () => {
    const students = await Promise.all(
      Array.from({ length: 5 }, () => createStudentLogin()),
    );
    for (const s of students) {
      expect((await signInStudent(s.number, s.pin)).status).toBe(200);
    }
    // Nothing about them stays behind in the throttle table.
    expect(await throttleRow("ip:127.0.0.1")).toBeNull();
    for (const s of students) {
      expect(await throttleRow(`acct:student:${s.number}`)).toBeNull();
    }
    await signInStudent(students[0].number, "000000");
    expect((await throttleRow("ip:127.0.0.1"))?.failures).toBe(1);
  });
});

describe("many failures from one school network", () => {
  test("a spray never locks out teachers or pupils without failures", async () => {
    const schoolIp = "203.0.113.77";
    const teacher = await createTeacherAccount();
    const pupil = await createStudentLogin();
    const unlucky = await createStudentLogin({ pin: "246810" });

    // One pupil sprays made-up leerlingnummers from the school's address.
    expect(await sprayFrom(schoolIp, IP_MAX_FAILURES)).toEqual({
      401: IP_MAX_FAILURES,
    });
    expect(await throttleRow(`ip:${schoolIp}`)).toEqual({
      failures: IP_MAX_FAILURES,
      locked: true,
    });
    expect(await auditCount("auth.network_locked")).toBe(1);

    // A teacher signs in with the right password from the same address.
    const teacherOut = await signInEmail(
      teacher.email,
      teacher.password,
      schoolIp,
    );
    expect(teacherOut.status).toBe(200);
    // So does a pupil without failures.
    expect(
      (await signInStudent(pupil.number, pupil.pin, { ip: schoolIp })).status,
    ).toBe(200);

    // A pupil who keeps mistyping is locked a little sooner than usual
    // (and the teacher sees and can lift that lock).
    for (let i = 0; i < RESTRICTED_NETWORK_MAX_FAILURES; i++) {
      const out = await signInStudent(unlucky.number, "135792", {
        ip: schoolIp,
      });
      expect(out.status).toBe(401);
    }
    const locked = await signInStudent(unlucky.number, unlucky.pin, {
      ip: schoolIp,
    });
    expect(locked.status).toBe(429);
    expect(locked.message).toBe(LOCKED_MESSAGE);
    expect(locked.code).toBe("ACCOUNT_LOCKED");
    expect(await auditDetails("auth.account_locked")).toEqual([
      {
        subjectLabel: unlucky.number,
        details: {
          failuresCount: RESTRICTED_NETWORK_MAX_FAILURES,
          threshold: RESTRICTED_NETWORK_MAX_FAILURES,
        },
      },
    ]);
    await clearStudentLoginThrottle(db, unlucky.number);
    expect(
      (await signInStudent(unlucky.number, unlucky.pin, { ip: schoolIp }))
        .status,
    ).toBe(200);

    // The successful sign-ins did not add to the network's count.
    expect((await throttleRow(`ip:${schoolIp}`))?.failures).toBe(
      IP_MAX_FAILURES + RESTRICTED_NETWORK_MAX_FAILURES,
    );
  }, 120_000);

  test("teachers keep the normal lock on a restricted network; other networks are unaffected", async () => {
    const schoolIp = "203.0.113.78";
    const teacher = await createTeacherAccount();
    const elsewhere = await createStudentLogin({ pin: "246810" });
    expect(await sprayFrom(schoolIp, IP_MAX_FAILURES)).toEqual({
      401: IP_MAX_FAILURES,
    });

    for (let i = 0; i < MAX_FAILURES; i++) {
      const out = await signInEmail(
        teacher.email,
        "verkeerd-wachtwoord-1",
        schoolIp,
      );
      expect(out.status).toBe(401);
    }
    expect(
      (await signInEmail(teacher.email, teacher.password, schoolIp)).status,
    ).toBe(429);

    // A pupil on another network keeps all eight tries.
    for (let i = 0; i < MAX_FAILURES; i++) {
      const out = await signInStudent(elsewhere.number, "135792", {
        ip: "198.51.100.9",
      });
      expect(out.status).toBe(401);
    }
    expect(
      (
        await signInStudent(elsewhere.number, elsewhere.pin, {
          ip: "198.51.100.9",
        })
      ).status,
    ).toBe(429);
  }, 120_000);
});

describe("session lifetime and cookies", () => {
  async function sessionLifetimeMs(userId: string) {
    const rows = await db
      .select({ createdAt: session.createdAt, expiresAt: session.expiresAt })
      .from(session)
      .where(eq(session.userId, userId));
    expect(rows).toHaveLength(1);
    const [row] = rows;
    return row.expiresAt.getTime() - row.createdAt.getTime();
  }

  test("a student session (browser session) ends 12 hours after signing in", async () => {
    const s = await createStudentLogin();
    const out = await signInStudent(s.number, s.pin, { rememberMe: false });
    expect(out.status).toBe(200);
    const lifetime = await sessionLifetimeMs(s.id);
    expect(lifetime).toBeLessThanOrEqual(TWELVE_HOURS_MS);
    expect(lifetime).toBeGreaterThan(TWELVE_HOURS_MS - 60_000);
  });

  test("a teacher session keeps its 12 hours", async () => {
    const t = await createTeacherAccount();
    expect((await signInEmail(t.email, t.password)).status).toBe(200);
    const lifetime = await sessionLifetimeMs(t.id);
    expect(lifetime).toBeLessThanOrEqual(TWELVE_HOURS_MS);
    expect(lifetime).toBeGreaterThan(TWELVE_HOURS_MS - 60_000);
  });

  test("no session_data cookie with personal details is set", async () => {
    const s = await createStudentLogin();
    const student = await signInStudent(s.number, s.pin, { rememberMe: false });
    expect(student.status).toBe(200);
    const studentCookies = student.setCookie.join("\n");
    expect(studentCookies).toContain("better-auth.session_token");
    expect(studentCookies).not.toContain("session_data");

    const t = await createTeacherAccount();
    const teacher = await signInEmail(t.email, t.password);
    expect(teacher.status).toBe(200);
    expect(teacher.setCookie.join("\n")).not.toContain("session_data");
  });

  test("a leftover session_data cookie is cleared by get-session", async () => {
    const s = await createStudentLogin();
    const signIn = await signInStudent(s.number, s.pin, { rememberMe: false });
    const token = signIn.setCookie
      .map((c) => c.split(";")[0])
      .find((c) => c.startsWith("better-auth.session_token="));
    expect(token).toBeDefined();
    const res = await auth.api.getSession({
      headers: testHeaders({
        cookie: `${token}; better-auth.session_data=eyJvbGQiOnRydWV9`,
      }),
      asResponse: true,
    });
    expect(res.status).toBe(200);
    const cleared = res.headers
      .getSetCookie()
      .find((c) => c.startsWith("better-auth.session_data="));
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/Max-Age=0/i);
  });
});
