/**
 * Start-up migrations wait for a database that is still starting, but fail
 * fast on real errors (src/server/db/migrate.ts).
 */
import { describe, expect, test } from "bun:test";
import net from "node:net";
import {
  isTransientDbError,
  retryWhileDbUnavailable,
  runMigrations,
} from "./migrate";

const connRefused = Object.assign(new Error("connect ECONNREFUSED"), {
  code: "ECONNREFUSED",
});

describe("isTransientDbError", () => {
  test("network errors and 'starting up' count as transient, also when wrapped", () => {
    expect(isTransientDbError(connRefused)).toBe(true);
    expect(
      isTransientDbError(
        new Error("Failed query: CREATE SCHEMA ...", { cause: connRefused }),
      ),
    ).toBe(true);
    expect(
      isTransientDbError(
        Object.assign(new Error("the database system is starting up"), {
          code: "57P03",
        }),
      ),
    ).toBe(true);
    expect(isTransientDbError({ code: "08006" })).toBe(true);
    expect(
      isTransientDbError(new Error("Connection terminated unexpectedly")),
    ).toBe(true);
  });

  test("SQL errors in a migration are not transient", () => {
    expect(
      isTransientDbError(
        Object.assign(new Error('relation "x" does not exist'), {
          code: "42P01",
        }),
      ),
    ).toBe(false);
    expect(isTransientDbError(new Error("syntax error"))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });
});

describe("retryWhileDbUnavailable", () => {
  function fakeTime() {
    let clock = 0;
    const waits: number[] = [];
    return {
      waits,
      now: () => clock,
      sleep: async (ms: number) => {
        waits.push(ms);
        clock += ms;
      },
    };
  }

  test("retries with backoff until the database answers", async () => {
    const time = fakeTime();
    let calls = 0;
    const result = await retryWhileDbUnavailable(
      async () => {
        calls++;
        if (calls < 5) throw connRefused;
        return "migrated";
      },
      { budgetMs: 60_000, ...time },
    );
    expect(result).toBe("migrated");
    expect(time.waits).toEqual([1_000, 2_000, 4_000, 5_000]);
  });

  test("gives up after the budget with the last error", async () => {
    const time = fakeTime();
    const err = await retryWhileDbUnavailable(
      async () => {
        throw connRefused;
      },
      { budgetMs: 10_000, ...time },
    ).catch((e: unknown) => e);
    expect(err).toBe(connRefused);
    expect(time.waits.reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  test("throws other errors at once", async () => {
    const time = fakeTime();
    const sqlError = Object.assign(new Error("syntax error"), {
      code: "42601",
    });
    const err = await retryWhileDbUnavailable(
      async () => {
        throw sqlError;
      },
      { budgetMs: 60_000, ...time },
    ).catch((e: unknown) => e);
    expect(err).toBe(sqlError);
    expect(time.waits).toEqual([]);
  });
});

describe("runMigrations", () => {
  test("keeps trying while nothing listens, then fails with the connection error", async () => {
    // A free port with nothing listening on it.
    const port = await new Promise<number>((resolve) => {
      const srv = net.createServer().listen(0, "127.0.0.1", () => {
        const { port } = srv.address() as net.AddressInfo;
        srv.close(() => resolve(port));
      });
    });
    const saved = {
      url: process.env.DATABASE_URL,
      wait: process.env.MIGRATIONS_WAIT_MS,
    };
    process.env.DATABASE_URL = `postgresql://x:y@127.0.0.1:${port}/none_test`;
    process.env.MIGRATIONS_WAIT_MS = "1500";
    const log = console.log;
    const warn = console.warn;
    const retries: string[] = [];
    console.log = () => {};
    console.warn = (msg: string) => retries.push(msg);
    const started = Date.now();
    try {
      const err = await runMigrations().catch((e: unknown) => e);
      expect(isTransientDbError(err)).toBe(true);
      expect(Date.now() - started).toBeGreaterThanOrEqual(1_400);
      expect(retries.length).toBeGreaterThanOrEqual(1);
    } finally {
      console.log = log;
      console.warn = warn;
      process.env.DATABASE_URL = saved.url;
      if (saved.wait === undefined) delete process.env.MIGRATIONS_WAIT_MS;
      else process.env.MIGRATIONS_WAIT_MS = saved.wait;
    }
  });
});
