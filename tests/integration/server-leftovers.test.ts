/**
 * Server follow-ups (group U3b): attempt numbers without gaps after a reset,
 * a teacher-specific lock message, interactive and background regrading
 * with clear errors, expected grading failures logged as such, results that
 * hand in expired attempts first, the targeting backfill at start-up, log
 * lines without query parameters, and student creation that only ever
 * cleans up its own half-created account.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  answers,
  assignmentStudents,
  assignments,
  attempts,
  studentPins,
  user,
} from "@/server/db/schema";
import { QueueTimeoutError } from "@/server/grader/errors";
import {
  ACCOUNT_LOCKED_MESSAGE,
  accountKeyFor,
  accountLockedMessage,
  MAX_FAILURES,
  reserveSignInAttempt,
  TEACHER_ACCOUNT_LOCKED_MESSAGE,
} from "@/server/security/login-throttle";
import { createStudentAccount } from "@/server/services/accounts";
import { ensureTargetingBackfill } from "@/server/services/assignment-targets";
import {
  attemptDisplayNumberSql,
  attemptDisplayNumbers,
} from "@/server/services/attempt-number";
import { regradeStalePendingAttempts } from "@/server/services/attempts";
import {
  isGradingInFlight,
  logGradingFailure,
  setGradingRetryDelaysForTests,
} from "@/server/services/grading";
import { callerFor, testHeaders } from "../support/caller";
import { drainGrading, resetDatabase } from "../support/db";
import {
  addToClass,
  createBasicWorld,
  createTeacherAccount,
  insertStudent,
  nextStudentNumber,
} from "../support/factories";
import * as fakeGrader from "../support/fake-grader";
import { waitFor } from "../support/wait";

beforeEach(resetDatabase);
afterEach(() => setGradingRetryDelaysForTests(null));

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

type World = Awaited<ReturnType<typeof createBasicWorld>>;

/** Submitted attempts with the given internal numbers (no answers). */
async function insertAttempts(
  w: World,
  userId: string,
  numbers: number[],
  status: "submitted" | "in_progress" = "submitted",
) {
  return db
    .insert(attempts)
    .values(
      numbers.map((n, i) => ({
        assignmentId: w.assignment.id,
        userId,
        attemptNumber: n,
        status,
        startedAt: minutesAgo(60 - i),
        submittedAt: status === "submitted" ? minutesAgo(59 - i) : null,
        gradingStatus: "graded" as const,
        score: 1,
        maxScore: 2,
      })),
    )
    .returning();
}

/** Capture console output while `fn` runs. */
async function captureConsole<T>(fn: () => Promise<T>) {
  const lines = { error: [] as string[], warn: [] as string[] };
  const error = spyOn(console, "error").mockImplementation(
    (...a: unknown[]) => {
      lines.error.push(a.map(String).join(" "));
    },
  );
  const warn = spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
    lines.warn.push(a.map(String).join(" "));
  });
  try {
    const result = await fn();
    return { result, lines };
  } finally {
    error.mockRestore();
    warn.mockRestore();
  }
}

/* -------------------------------------------------------------------------- */
/*                 A27: "poging 6 van 5" after a reset attempt                */
/* -------------------------------------------------------------------------- */

describe("attempt numbers never show gaps", () => {
  test("only the latest attempt can be reset (the dialog may be stale)", async () => {
    const w = await createBasicWorld({
      settings: { showResults: "immediately", maxAttempts: 5 },
    });
    const [first, second] = await insertAttempts(w, w.s1.id, [1, 2]);
    const t = callerFor(w.teacher);
    await expect(
      t.assignment.resetAttempt({ attemptId: first.id }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "De leerling heeft al een nieuwere poging. Vernieuw de pagina: alleen de laatste poging kan worden gereset.",
    });
    expect(
      await db.select().from(attempts).where(eq(attempts.id, first.id)),
    ).toHaveLength(1);
    await t.assignment.resetAttempt({ attemptId: second.id });

    // The next attempt gets number 2 again: no gap.
    const { attemptId } = await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    expect(row.attemptNumber).toBe(2);
  });

  test("existing gaps (old resets, retention) are numbered 1..N everywhere", async () => {
    const w = await createBasicWorld({
      settings: { showResults: "immediately", maxAttempts: 5 },
    });
    // As in the dev database: attempt 4 was reset before the fix.
    const rows = await insertAttempts(w, w.s1.id, [1, 2, 3, 5, 6]);
    const latest = rows[4];
    const t = callerFor(w.teacher);

    const results = await t.review.results({ assignmentId: w.assignment.id });
    const row = results.rows.find((r) => r.student.id === w.s1.id);
    expect(row?.attemptCount).toBe(5);
    expect(row?.attempt?.attemptNumber).toBe(5);

    const monitor = await t.assignment.monitor({ id: w.assignment.id });
    const m = monitor.students.find((s) => s.student.id === w.s1.id);
    expect(m?.attemptCount).toBe(5);
    expect(m?.attempt?.attemptNumber).toBe(5);

    const review = await t.review.attempt({ attemptId: latest.id });
    expect(review.attempt.attemptNumber).toBe(5);
    expect(review.studentAttempts.map((a) => a.attemptNumber)).toEqual([
      1, 2, 3, 4, 5,
    ]);

    const student = await t.student.get({ id: w.s1.id });
    expect(student.attempts.map((a) => a.attemptNumber).sort()).toEqual([
      1, 2, 3, 4, 5,
    ]);

    const s = callerFor(w.s1);
    const result = await s.portal.getResult({ attemptId: latest.id });
    expect(result.attemptNumber).toBe(5);
    expect(result.maxAttempts).toBe(5);
    const mine = await s.portal.myResults();
    expect(mine.map((r) => r.attemptNumber).sort()).toEqual([1, 2, 3, 4, 5]);
    const dash = await s.portal.dashboard();
    const item = [...dash.open, ...dash.upcoming, ...dash.finished].find(
      (i) => i.id === w.assignment.id,
    );
    expect(item?.lastAttempt?.attemptNumber).toBe(5);
    const exam = await s.portal.getAttempt({ attemptId: rows[3].id });
    expect(exam.attempt.attemptNumber).toBe(4);

    // The stored number stays the stable key.
    const [stored] = await db
      .select({ n: attempts.attemptNumber })
      .from(attempts)
      .where(eq(attempts.id, latest.id));
    expect(stored.n).toBe(6);
  });

  test("the grading queue numbers attempts the same way", async () => {
    const w = await createBasicWorld({
      settings: { showResults: "immediately", maxAttempts: 5 },
    });
    const rows = await insertAttempts(w, w.s1.id, [2, 7]);
    await db.insert(answers).values(
      rows.map((r) => ({
        attemptId: r.id,
        questionId: w.questions.open.id,
        status: "needs_review" as const,
        response: { text: "Mijn uitleg" },
        maxScore: 2,
        savedAt: new Date(),
      })),
    );
    const queue = await callerFor(w.teacher).review.gradingQueue({
      assignmentId: w.assignment.id,
    });
    expect(queue.items.map((i) => i.attemptNumber).sort()).toEqual([1, 2]);
  });

  test("helpers: SQL and in-memory numbering agree", async () => {
    const w = await createBasicWorld();
    const a = await insertAttempts(w, w.s1.id, [3, 9, 4]);
    const b = await insertAttempts(w, w.s2.id, [1]);
    const sqlRows = await db
      .select({ id: attempts.id, shown: attemptDisplayNumberSql })
      .from(attempts);
    const memory = attemptDisplayNumbers([...a, ...b]);
    for (const r of sqlRows) expect(memory.get(r.id)).toBe(r.shown);
    expect(memory.get(a[1].id)).toBe(3);
    expect(memory.get(a[2].id)).toBe(2);
    expect(memory.get(b[0].id)).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/*                A37: a locked teacher is not told to ask "je docent"         */
/* -------------------------------------------------------------------------- */

describe("lock messages per kind of account", () => {
  test("teachers and students each get their own refusal", async () => {
    const teacher = accountKeyFor("/sign-in/email", {
      email: "Docent-Lock@school.nl",
    });
    const student = accountKeyFor("/sign-in/username", { username: "17999" });
    for (const [account, message] of [
      [teacher, TEACHER_ACCOUNT_LOCKED_MESSAGE],
      [student, ACCOUNT_LOCKED_MESSAGE],
    ] as const) {
      for (let i = 0; i < MAX_FAILURES; i++) {
        const r = await reserveSignInAttempt(db, {
          account,
          ip: null,
          ipMaxFailures: 100,
        });
        expect(r.ok).toBe(true);
      }
      const locked = await reserveSignInAttempt(db, {
        account,
        ip: null,
        ipMaxFailures: 100,
      });
      expect(locked).toEqual({ ok: false, reason: "account_locked", message });
    }
    expect(TEACHER_ACCOUNT_LOCKED_MESSAGE).not.toContain("je docent");
    expect(TEACHER_ACCOUNT_LOCKED_MESSAGE).toContain("15 minuten");
    expect(accountLockedMessage(teacher)).toBe(TEACHER_ACCOUNT_LOCKED_MESSAGE);
    expect(accountLockedMessage(student)).toBe(ACCOUNT_LOCKED_MESSAGE);
    expect(accountLockedMessage(null)).toBe(ACCOUNT_LOCKED_MESSAGE);
  });

  test("a locked teacher gets the teacher message from /sign-in/email", async () => {
    const t = await createTeacherAccount();
    const signIn = async (password: string) => {
      try {
        const res = await auth.api.signInEmail({
          body: { email: t.email, password },
          headers: testHeaders(),
          asResponse: true,
        });
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        return { status: res.status, message: body.message ?? "" };
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        return { status: e.statusCode ?? 500, message: e.message ?? "" };
      }
    };
    for (let i = 0; i < MAX_FAILURES; i++)
      expect((await signIn("verkeerd-wachtwoord-1")).status).toBe(401);
    expect(await signIn(t.password)).toEqual({
      status: 429,
      message: TEACHER_ACCOUNT_LOCKED_MESSAGE,
    });
  });
});

/* -------------------------------------------------------------------------- */
/*                         X10: teacher regrade behaviour                      */
/* -------------------------------------------------------------------------- */

async function submittedCodeAttempt(w: World) {
  const s = callerFor(w.s1);
  const { attemptId } = await s.portal.startAttempt({
    assignmentId: w.assignment.id,
  });
  await s.portal.saveAnswer({
    attemptId,
    questionId: w.questions.code.id,
    response: { code: "print(int(input()) * 2)" },
  });
  await s.portal.submitAttempt({ attemptId });
  await drainGrading();
  return attemptId;
}

describe("regrading", () => {
  test("one attempt: the teacher waits (interactive queue)", async () => {
    const w = await createBasicWorld();
    const attemptId = await submittedCodeAttempt(w);
    // The hand-in itself was graded in the background.
    expect(fakeGrader.gradeBatchOptions.at(-1)).toMatchObject({
      priority: "background",
      queueTimeoutMs: null,
    });
    fakeGrader.gradeBatchOptions.length = 0;
    await callerFor(w.teacher).review.regradeAttempt({ attemptId });
    // Interactive: the normal queue timeout, no background priority.
    expect(fakeGrader.gradeBatchOptions).toEqual([
      { throwWhenUnavailable: true },
    ]);
  });

  test("one attempt, grader too busy: a clear Dutch error, scores kept", async () => {
    const w = await createBasicWorld();
    const attemptId = await submittedCodeAttempt(w);
    setGradingRetryDelaysForTests([60_000]);
    fakeGrader.setFakeGrader(() => {
      throw new QueueTimeoutError();
    });
    await expect(
      callerFor(w.teacher).review.regradeAttempt({ attemptId }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: expect.stringContaining(
        "De nakijker is even overbelast. Probeer het over een minuut opnieuw",
      ),
    });
  });

  test("one attempt, internal error: says how many answers wait for the teacher", async () => {
    const w = await createBasicWorld();
    const attemptId = await submittedCodeAttempt(w);
    fakeGrader.setFakeGrader((input) => ({
      ...fakeGrader.defaultGrade(input),
      status: "internal_error",
      fraction: 0,
      passedWeight: 0,
    }));
    await expect(
      callerFor(w.teacher).review.regradeAttempt({ attemptId }),
    ).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message:
        "Opnieuw nagekeken, maar één antwoord kon niet automatisch worden nagekeken. Het staat klaar om zelf na te kijken.",
    });
    const [code] = await db
      .select()
      .from(answers)
      .where(eq(answers.attemptId, attemptId));
    expect(code).toBeDefined();
  });

  test("a whole afname: returns at once, grading continues in the background", async () => {
    const w = await createBasicWorld();
    const attemptId = await submittedCodeAttempt(w);
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let graded = 0;
    fakeGrader.setFakeGrader(async (input) => {
      await gate;
      graded++;
      return fakeGrader.defaultGrade(input);
    });
    const out = await callerFor(w.teacher).review.regradeAssignment({
      assignmentId: w.assignment.id,
    });
    expect(out).toMatchObject({
      total: 1,
      scheduled: 1,
      skippedRestricted: 0,
    });
    // Not graded yet, but marked so the attempt sweeper leaves it alone.
    expect(graded).toBe(0);
    expect(isGradingInFlight(attemptId)).toBe(true);
    release();
    await waitFor(() => graded === 1 && !isGradingInFlight(attemptId));
    await drainGrading();
  });
});

/* -------------------------------------------------------------------------- */
/*            X11 + X18: expected grading failures, no raw errors in logs      */
/* -------------------------------------------------------------------------- */

describe("grading logs", () => {
  test("closing an afname grades in the background, marked as scheduled", async () => {
    const w = await createBasicWorld();
    const s = callerFor(w.s1);
    const { attemptId } = await s.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    fakeGrader.setFakeGrader(async (input) => {
      await gate;
      return fakeGrader.defaultGrade(input);
    });
    await s.portal.saveAnswer({
      attemptId,
      questionId: w.questions.code.id,
      response: { code: "print(1)" },
    });
    await callerFor(w.teacher).assignment.close({ id: w.assignment.id });
    expect(isGradingInFlight(attemptId)).toBe(true);
    // A sweep right now would not grade it a second time.
    await db
      .update(attempts)
      .set({ submittedAt: minutesAgo(10) })
      .where(eq(attempts.id, attemptId));
    expect(await regradeStalePendingAttempts()).not.toContain(attemptId);
    release();
    await waitFor(() => !isGradingInFlight(attemptId));
    await drainGrading();
  });

  test("an incomplete run is one warning line, not a crash", async () => {
    const w = await createBasicWorld();
    fakeGrader.setFakeGrader((input) => ({
      ...fakeGrader.defaultGrade(input),
      status: "internal_error",
      fraction: 0,
      passedWeight: 0,
    }));
    const { lines } = await captureConsole(async () => {
      const s = callerFor(w.s1);
      const { attemptId } = await s.portal.startAttempt({
        assignmentId: w.assignment.id,
      });
      await s.portal.saveAnswer({
        attemptId,
        questionId: w.questions.code.id,
        response: { code: "print(1)" },
      });
      await callerFor(w.teacher).assignment.close({ id: w.assignment.id });
      await waitFor(() => !isGradingInFlight(attemptId));
      await drainGrading();
    });
    expect(lines.error.filter((l) => l.includes("grading"))).toEqual([]);
    const warning = lines.warn.find((l) => l.includes("grading.incomplete"));
    expect(warning).toBeDefined();
    expect(JSON.parse(warning ?? "{}")).toMatchObject({
      level: "warn",
      event: "grading.incomplete",
      reason: "internal_error",
      answers: 1,
    });
  });

  test("unexpected failures: one JSON line without the query parameters", async () => {
    const dbError = Object.assign(
      new Error(
        'Failed query: update "answer" set "result" = $1\nparams: {"stdout":"Fatima 17053"}',
      ),
      { code: "22P02" },
    );
    // Run the backfill again (it runs once per process).
    (globalThis as { targetingBackfill?: Promise<void> }).targetingBackfill =
      undefined;
    const { lines } = await captureConsole(async () => {
      logGradingFailure("attempt-1", dbError);
      await ensureTargetingBackfill({
        execute: async () => {
          throw dbError;
        },
      } as never);
    });
    expect(lines.error).toHaveLength(2);
    for (const line of lines.error) {
      expect(line).not.toContain("17053");
      expect(line).not.toContain("Fatima");
      expect(line.split("\n")).toHaveLength(1);
      expect(JSON.parse(line)).toMatchObject({
        level: "error",
        db: { code: "22P02" },
      });
    }
    expect(JSON.parse(lines.error[0])).toMatchObject({
      event: "grading.attempt_failed",
      attemptId: "attempt-1",
    });
    expect(JSON.parse(lines.error[1])).toMatchObject({
      event: "assignment_targets.backfill_failed",
    });
  });
});

/* -------------------------------------------------------------------------- */
/*                  X12: results right after a deadline has passed             */
/* -------------------------------------------------------------------------- */

describe("results hand in expired attempts first", () => {
  test("results, export and analysis no longer show 'bezig' after the deadline", async () => {
    const w = await createBasicWorld({ timeLimitMinutes: 10 });
    const [running] = await insertAttempts(w, w.s1.id, [1], "in_progress");
    await db
      .update(attempts)
      .set({ deadlineAt: minutesAgo(5), gradingStatus: "pending" })
      .where(eq(attempts.id, running.id));
    const t = callerFor(w.teacher);

    const results = await t.review.results({ assignmentId: w.assignment.id });
    const row = results.rows.find((r) => r.student.id === w.s1.id);
    expect(row?.attempt?.status).toBe("submitted");
    expect(row?.attempt?.autoSubmitted).toBe(true);
    expect(results.stats.inProgress).toBe(0);

    const [stored] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, running.id));
    expect(stored.status).toBe("submitted");
    // Handed in at the deadline, not "now".
    expect(stored.submittedAt?.getTime()).toBeLessThanOrEqual(
      minutesAgo(4).getTime(),
    );

    const { csv } = await t.review.exportCsv({ assignmentId: w.assignment.id });
    expect(csv).not.toContain("Bezig");
    await drainGrading();
  });

  test("the analysis also sees the handed-in attempt", async () => {
    const w = await createBasicWorld({ timeLimitMinutes: 10 });
    const [running] = await insertAttempts(w, w.s2.id, [1], "in_progress");
    await db
      .update(attempts)
      .set({ deadlineAt: minutesAgo(5) })
      .where(eq(attempts.id, running.id));
    await callerFor(w.teacher).analysis.assignment({
      assignmentId: w.assignment.id,
    });
    const [stored] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, running.id));
    expect(stored.status).toBe("submitted");
    await drainGrading();
  });
});

/* -------------------------------------------------------------------------- */
/*                     X16: targeting flag backfilled at start-up              */
/* -------------------------------------------------------------------------- */

describe("start-up backfill of the targeting flag", () => {
  const KEYS = [
    "NODE_ENV",
    "NEXT_RUNTIME",
    "NEXT_PHASE",
    "RUN_MIGRATIONS",
    "RETENTION_SCHEDULER",
    "ATTEMPT_SWEEPER",
  ] as const;

  test("register() sets settings.targeted on old targeted afnames", async () => {
    const w = await createBasicWorld();
    await db
      .insert(assignmentStudents)
      .values({ assignmentId: w.assignment.id, userId: w.s1.id });
    const [before] = await db
      .select({ settings: assignments.settings })
      .from(assignments)
      .where(eq(assignments.id, w.assignment.id));
    expect((before.settings as Record<string, unknown>).targeted).toBe(
      undefined,
    );

    const env = process.env as Record<string, string | undefined>;
    const saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]));
    const g = globalThis as {
      targetingBackfill?: Promise<void>;
      __pensumaGraderPool?: { close(): void };
    };
    const savedPool = g.__pensumaGraderPool;
    const { SandboxPool } = await import("@/server/grader/pool");
    const { graderConfig } = await import("@/server/grader/config");
    // warmUpGrader() must not start real sandboxes here.
    g.__pensumaGraderPool = new SandboxPool({ ...graderConfig(), poolSize: 0 });
    g.targetingBackfill = undefined;
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_RUNTIME: "nodejs",
      RUN_MIGRATIONS: "false",
      RETENTION_SCHEDULER: "false",
      ATTEMPT_SWEEPER: "false",
    });
    delete env.NEXT_PHASE;
    try {
      const { register } = await import("@/instrumentation");
      await register();
      await waitFor(async () => {
        const [row] = await db
          .select({ settings: assignments.settings })
          .from(assignments)
          .where(eq(assignments.id, w.assignment.id));
        return (row.settings as Record<string, unknown>).targeted === true;
      });
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete env[k];
        else env[k] = saved[k];
      }
      g.__pensumaGraderPool?.close();
      g.__pensumaGraderPool = savedPool;
    }
  });
});

/* -------------------------------------------------------------------------- */
/*            X19: creating a student only cleans up its own user row          */
/* -------------------------------------------------------------------------- */

describe("student creation cleans up only what it created", () => {
  async function withFailingPinStore(fn: () => Promise<void>) {
    await db.execute(sql`
      create or replace function u3b_fail_pin() returns trigger
      language plpgsql as $$ begin raise exception 'pin store down'; end $$`);
    await db.execute(sql`
      create trigger u3b_fail_pin before insert on student_pin
      for each row execute function u3b_fail_pin()`);
    try {
      await fn();
    } finally {
      await db.execute(sql`drop trigger if exists u3b_fail_pin on student_pin`);
      await db.execute(sql`drop function if exists u3b_fail_pin()`);
    }
  }

  test("two teachers add the same number at once: the loser never deletes the winner's account", async () => {
    const w = await createBasicWorld();
    const number = nextStudentNumber();
    // Teacher B's insert of the user row waits (after B checked that the
    // number is free) until teacher A's row is there; then B's insert hits
    // the unique index. A's row is seconds old and has no password or PIN
    // yet: exactly what the old clean-up deleted.
    await db.execute(sql`
      create or replace function u3b_slow_user() returns trigger
      language plpgsql as $$
      begin
        if new.name = 'Tweede docent' then perform pg_sleep(1); end if;
        return new;
      end $$`);
    await db.execute(sql`
      create trigger u3b_slow_user before insert on "user"
      for each row execute function u3b_slow_user()`);
    try {
      const loser = callerFor(w.teacher)
        .student.create({ studentNumber: number, name: "Tweede docent" })
        .then(
          () => null,
          (error: unknown) => error,
        );
      await waitFor(
        async () => {
          const rows = await db.execute(sql`
            select 1 from pg_stat_activity
            where datname = current_database() and wait_event = 'PgSleep'
              and query ilike 'insert into "user"%'`);
          return rows.rows.length > 0;
        },
        { message: "teacher B never reached its insert" },
      );
      const winner = await insertStudent({ number, name: "Eerste docent" });
      expect(await loser).toMatchObject({ code: "CONFLICT" });
      const rows = await db.select().from(user).where(eq(user.id, winner.id));
      expect(rows).toHaveLength(1);
      expect(
        await db.select().from(user).where(eq(user.username, number)),
      ).toHaveLength(1);
    } finally {
      await db.execute(sql`drop trigger if exists u3b_slow_user on "user"`);
      await db.execute(sql`drop function if exists u3b_slow_user()`);
    }
  });

  test("a colleague's half-created account for the same number is left alone", async () => {
    const number = nextStudentNumber();
    // Teacher A's create is still running: user row, no password, no PIN.
    const winner = await insertStudent({ number, name: "Eerste docent" });
    await expect(
      createStudentAccount({ studentNumber: number, name: "Tweede docent" }),
    ).rejects.toBeDefined();
    const rows = await db.select().from(user).where(eq(user.id, winner.id));
    expect(rows).toHaveLength(1);
  });

  test("a failure after the user row was inserted removes exactly that row", async () => {
    const number = nextStudentNumber();
    await withFailingPinStore(async () => {
      await expect(
        createStudentAccount({ studentNumber: number, name: "Sem" }),
      ).rejects.toBeDefined();
    });
    expect(
      await db.select().from(user).where(eq(user.username, number)),
    ).toHaveLength(0);
    expect(await db.select().from(studentPins)).toHaveLength(0);
  });

  test("student.create: an internal error, nothing left behind", async () => {
    const teacher = await createBasicWorld().then((w) => w.teacher);
    const number = nextStudentNumber();
    await withFailingPinStore(async () => {
      await expect(
        callerFor(teacher).student.create({
          studentNumber: number,
          name: "Noor",
        }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
    expect(
      await db.select().from(user).where(eq(user.username, number)),
    ).toHaveLength(0);
    // And it works once the PIN store is back.
    const ok = await callerFor(teacher).student.create({
      studentNumber: number,
      name: "Noor",
    });
    expect(ok.user.studentNumber).toBe(number);
  });

  test("an existing student stays intact when a duplicate create fails", async () => {
    const w = await createBasicWorld();
    const number = nextStudentNumber();
    const first = await createStudentAccount({
      studentNumber: number,
      name: "Eerste",
    });
    await addToClass(w.klas.id, first.user.id);
    await expect(
      createStudentAccount({ studentNumber: number, name: "Dubbel" }),
    ).rejects.toBeDefined();
    const rows = await db.select().from(user).where(eq(user.id, first.user.id));
    expect(rows[0]?.name).toBe("Eerste");
    expect(
      await db
        .select()
        .from(studentPins)
        .where(eq(studentPins.userId, first.user.id)),
    ).toHaveLength(1);
  });
});
