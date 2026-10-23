/**
 * Database resilience of the production server:
 *  - start-up migrations wait for a database that only comes up later
 *    (container start order after a host reboot) instead of failing once;
 *  - Postgres ending idle pooled connections (restart, failover,
 *    pg_terminate_backend) is logged as one line, not an uncaughtException,
 *    and later queries simply reconnect.
 */
import { describe, expect, test } from "bun:test";
import net from "node:net";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrate";
import { ensureTestDatabase } from "../support/db";

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

/** A TCP forwarder from `port` to the real database (started later). */
function forwarder(port: number, target: URL): Promise<net.Server> {
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(target.port || 5432), target.hostname);
    client.pipe(upstream).pipe(client);
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", close);
    upstream.on("error", close);
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve(server)),
  );
}

describe("start-up migrations", () => {
  test("wait for a database that becomes reachable after a while", async () => {
    await ensureTestDatabase();
    const real = new URL(process.env.DATABASE_URL ?? "");
    const port = await freePort();
    const viaProxy = new URL(real);
    viaProxy.hostname = "127.0.0.1";
    viaProxy.port = String(port);

    const saved = {
      url: process.env.DATABASE_URL,
      wait: process.env.MIGRATIONS_WAIT_MS,
    };
    process.env.DATABASE_URL = viaProxy.toString();
    process.env.MIGRATIONS_WAIT_MS = "20000";
    const { log, warn } = console;
    const retries: string[] = [];
    console.log = () => {};
    console.warn = (msg: string) => retries.push(msg);
    let proxy: net.Server | undefined;
    try {
      const migrating = runMigrations();
      // The database "comes up" 1.5 s later.
      await new Promise((r) => setTimeout(r, 1_500));
      proxy = await forwarder(port, real);
      await migrating;
      expect(retries.length).toBeGreaterThanOrEqual(1);
    } finally {
      console.log = log;
      console.warn = warn;
      process.env.DATABASE_URL = saved.url;
      if (saved.wait === undefined) delete process.env.MIGRATIONS_WAIT_MS;
      else process.env.MIGRATIONS_WAIT_MS = saved.wait;
      await new Promise<void>((r) => (proxy ? proxy.close(() => r()) : r()));
    }
  }, 30_000);
});

describe("the app's connection pool", () => {
  test("survives Postgres terminating its idle connections", async () => {
    await ensureTestDatabase();
    const pool = db.$client as Pool;
    expect(pool.listenerCount("error")).toBeGreaterThanOrEqual(1);

    // Several parallel queries leave idle clients in the pool.
    await Promise.all(
      Array.from({ length: 4 }, () => db.execute(sql`select pg_sleep(0.05)`)),
    );
    const uncaught: unknown[] = [];
    const onUncaught = (err: unknown) => uncaught.push(err);
    process.on("uncaughtException", onUncaught);
    const { error } = console;
    const logged: string[] = [];
    let terminated = 0;
    console.error = (msg: string) => logged.push(String(msg));
    try {
      // Terminate the idle ones from a separate session.
      const { Client } = await import("pg");
      const admin = new Client({ connectionString: process.env.DATABASE_URL });
      await admin.connect();
      try {
        terminated =
          (
            await admin.query(
              `select pg_terminate_backend(pid) from pg_stat_activity
            where datname = current_database() and pid <> pg_backend_pid()
              and state = 'idle'`,
            )
          ).rowCount ?? 0;
      } finally {
        await admin.end();
      }
      await new Promise((r) => setTimeout(r, 300));
      // Later queries reconnect.
      const result = await db.execute<{ one: number }>(sql`select 1 as one`);
      expect(result.rows[0]?.one).toBe(1);
    } finally {
      process.off("uncaughtException", onUncaught);
      console.error = error;
    }
    expect(terminated).toBeGreaterThanOrEqual(1);
    expect(uncaught).toEqual([]);
    expect(logged.length).toBeGreaterThanOrEqual(1);
    for (const line of logged) {
      expect(line).toContain("pg_idle_client_error");
      expect(line.split("\n")).toHaveLength(1);
    }
  });
});
