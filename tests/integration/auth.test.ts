/**
 * Sign-in (better-auth, in process), the failed-sign-in lockout and the
 * first-run setup.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { STUDENT_EMAIL_DOMAIN } from "@/lib/auth-shared";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { user, userActivity } from "@/server/db/schema";
import { getStudentLoginLock } from "@/server/security/login-throttle";
import { callerFor, testHeaders } from "../support/caller";
import { resetDatabase } from "../support/db";
import {
  createStudentLogin,
  createTeacherAccount,
  nextStudentNumber,
} from "../support/factories";
import { pendingTest } from "../support/pending";

beforeEach(resetDatabase);

const LOCKED_MESSAGE =
  "Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw of vraag je docent om hulp.";

type Outcome = { status: number; message: string; setCookie: string[] };

/** Status and message of a sign-in, whether it returns or throws. */
async function outcome(run: () => Promise<Response>): Promise<Outcome> {
  try {
    const res = await run();
    const text = await res.text();
    let message = "";
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? "";
    } catch {}
    return {
      status: res.status,
      message,
      setCookie: res.headers.getSetCookie(),
    };
  } catch (err) {
    const e = err as { statusCode?: number; status?: number; message?: string };
    return {
      status: e.statusCode ?? (typeof e.status === "number" ? e.status : 500),
      message: e.message ?? "",
      setCookie: [],
    };
  }
}

const signInStudent = (username: string, password: string) =>
  outcome(() =>
    auth.api.signInUsername({
      body: { username, password },
      headers: testHeaders(),
      asResponse: true,
    }),
  );

const signInEmail = (email: string, password: string) =>
  outcome(() =>
    auth.api.signInEmail({
      body: { email, password },
      headers: testHeaders(),
      asResponse: true,
    }),
  );

describe("sign-in", () => {
  test("a student signs in with leerlingnummer + PIN", async () => {
    const s = await createStudentLogin();
    const out = await signInStudent(s.number, s.pin);
    expect(out.status).toBe(200);
    expect(out.setCookie.join(";")).toContain("better-auth.session_token");
  });

  test("a teacher signs in with e-mail + password", async () => {
    const t = await createTeacherAccount();
    const out = await signInEmail(t.email, t.password);
    expect(out.status).toBe(200);
    expect(out.setCookie.join(";")).toContain("better-auth.session_token");
  });

  test("a wrong PIN is refused", async () => {
    const s = await createStudentLogin({ pin: "246810" });
    expect((await signInStudent(s.number, "135792")).status).toBe(401);
  });

  test("an unknown leerlingnummer is refused like a wrong PIN", async () => {
    expect((await signInStudent(nextStudentNumber(), "246810")).status).toBe(
      401,
    );
  });

  test("sign-up is disabled", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Indringer",
          email: "indringer@test.pensuma.local",
          password: "een-lang-wachtwoord-123",
        },
        headers: testHeaders(),
      }),
    ).rejects.toThrow();
    const rows = await db
      .select()
      .from(user)
      .where(eq(user.email, "indringer@test.pensuma.local"));
    expect(rows).toHaveLength(0);
  });

  pendingTest(
    "P1",
    "a student cannot use the e-mail flow with the placeholder address",
    async () => {
      const s = await createStudentLogin();
      const out = await signInEmail(
        `${s.number}@${STUDENT_EMAIL_DOMAIN}`,
        s.pin,
      );
      expect(out.status).toBe(401);
      expect(out.setCookie).toEqual([]);
    },
  );

  pendingTest("P1", "a sign-in records the last sign-in time", async () => {
    const s = await createStudentLogin();
    expect((await signInStudent(s.number, s.pin)).status).toBe(200);
    const [row] = await db
      .select()
      .from(userActivity)
      .where(eq(userActivity.userId, s.id));
    expect(row?.lastSignInAt).toBeInstanceOf(Date);
  });
});

describe("failed sign-in lockout", () => {
  test("8 wrong PINs lock the account, also for the right PIN", async () => {
    const s = await createStudentLogin({ pin: "246810" });
    for (let i = 0; i < 8; i++) {
      expect((await signInStudent(s.number, "135792")).status).toBe(401);
    }
    const locked = await signInStudent(s.number, "135792");
    expect(locked.status).toBe(429);
    expect(locked.message).toBe(LOCKED_MESSAGE);
    const right = await signInStudent(s.number, s.pin);
    expect(right.status).toBe(429);
    expect(right.message).toBe(LOCKED_MESSAGE);
    const lock = await getStudentLoginLock(db, s.number);
    expect(lock?.lockedUntil).toBeInstanceOf(Date);
  });

  test("the lock is per account: classmates can still sign in", async () => {
    const victim = await createStudentLogin({ pin: "246810" });
    const classmate = await createStudentLogin();
    for (let i = 0; i < 9; i++) await signInStudent(victim.number, "135792");
    expect((await signInStudent(classmate.number, classmate.pin)).status).toBe(
      200,
    );
  });

  test("a successful sign-in clears earlier failures", async () => {
    const s = await createStudentLogin({ pin: "246810" });
    for (let i = 0; i < 3; i++) await signInStudent(s.number, "135792");
    expect((await getStudentLoginLock(db, s.number))?.failures).toBe(3);
    expect((await signInStudent(s.number, s.pin)).status).toBe(200);
    expect(await getStudentLoginLock(db, s.number)).toBeNull();
  });
});

describe("first-run setup", () => {
  const admin = {
    name: "Eerste Docent",
    email: "eerste@test.pensuma.local",
    password: "een-lange-zin-als-wachtwoord",
  };

  test("an empty installation needs setup; it can be done once", async () => {
    const anon = callerFor(null);
    expect(await anon.setup.status()).toMatchObject({ needsSetup: true });
    await expect(anon.setup.createFirstAdmin(admin)).resolves.toMatchObject({
      email: admin.email,
    });
    expect(await anon.setup.status()).toMatchObject({ needsSetup: false });
    await expect(
      anon.setup.createFirstAdmin({
        ...admin,
        email: "tweede@test.pensuma.local",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admins = await db.select().from(user).where(eq(user.role, "admin"));
    expect(admins).toHaveLength(1);
    // The new teacher can sign in.
    expect((await signInEmail(admin.email, admin.password)).status).toBe(200);
  });

  test("a short password is refused", async () => {
    await expect(
      callerFor(null).setup.createFirstAdmin({ ...admin, password: "kort" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  pendingTest(
    "P1",
    "the password needs at least 12 characters (teacher policy)",
    async () => {
      await expect(
        callerFor(null).setup.createFirstAdmin({
          ...admin,
          password: "elf-tekens1",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    },
  );

  pendingTest(
    "P1",
    "two parallel setups create exactly one teacher",
    async () => {
      const anon = callerFor(null);
      const results = await Promise.allSettled([
        anon.setup.createFirstAdmin(admin),
        anon.setup.createFirstAdmin({
          ...admin,
          email: "parallel@test.pensuma.local",
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const admins = await db.select().from(user).where(eq(user.role, "admin"));
      expect(admins).toHaveLength(1);
    },
  );
});
