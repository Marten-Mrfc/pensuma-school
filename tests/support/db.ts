/**
 * Test database helpers (Postgres, DB name must end in `_test`; see
 * tests/setup/preload.ts).
 *
 *   import { beforeEach } from "bun:test";
 *   import { resetDatabase } from "../support/db";
 *   beforeEach(resetDatabase);
 *
 * - ensureTestDatabase(): creates the database when missing and applies the
 *   migrations from ./drizzle with the production code path
 *   (src/server/db/migrate.ts), so migration drift fails the tests. Once per
 *   process.
 * - resetDatabase(): waits for background grading, then empties every table.
 * - Never end the shared pool in a test file: all files share one process.
 */
import { sql } from "drizzle-orm";
import pg from "pg";
import { db } from "@/server/db";
import { runMigrations } from "@/server/db/migrate";
import { resetFakeGrader } from "./fake-grader";

export { db };

let ready: Promise<void> | undefined;
let tables: string[] | undefined;

function databaseUrl(): URL {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("[tests] DATABASE_URL is not set (preload?)");
  const url = new URL(raw);
  if (!/_test$/.test(url.pathname)) {
    throw new Error(
      `[tests] Refusing to touch "${url.pathname.slice(1)}": not a *_test database.`,
    );
  }
  return url;
}

async function createDatabaseIfMissing(url: URL): Promise<void> {
  const name = decodeURIComponent(url.pathname.slice(1));
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const client = new pg.Client({ connectionString: maintenance.toString() });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `[tests] Postgres is not reachable at ${url.host}. Start it with \`docker compose up -d db\` or set TEST_DATABASE_URL to a postgresql://…/<name>_test URL. (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  try {
    const found = await client.query(
      "select 1 from pg_database where datname = $1",
      [name],
    );
    if (found.rowCount === 0) {
      try {
        await client.query(`create database "${name.replace(/"/g, '""')}"`);
      } catch (err) {
        // 42P04 duplicate_database: another process created it meanwhile.
        if ((err as { code?: string }).code !== "42P04") throw err;
      }
    }
  } finally {
    await client.end();
  }
}

/** Create (if needed) and migrate the test database. Memoised per process. */
export function ensureTestDatabase(): Promise<void> {
  ready ??= (async () => {
    const url = databaseUrl();
    await createDatabaseIfMissing(url);
    const log = console.log;
    console.log = () => {};
    try {
      await runMigrations();
    } finally {
      console.log = log;
    }
  })().catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
}

/** Wait for every attempt that is being graded in the background. */
export async function drainGrading(): Promise<void> {
  const inFlight = (
    globalThis as { gradingInFlight?: Map<string, Promise<void>> }
  ).gradingInFlight;
  // Grading can schedule more grading; loop until nothing is left.
  for (let round = 0; inFlight?.size && round < 20; round++) {
    await Promise.allSettled([...inFlight.values()]);
  }
}

/** Empty every table in the public schema (migration state lives elsewhere). */
export async function resetDatabase(): Promise<void> {
  await ensureTestDatabase();
  await drainGrading();
  tables ??= (
    await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    )
  ).rows.map((r) => `"${r.tablename}"`);
  if (tables.length > 0) {
    await db.execute(
      sql.raw(`truncate table ${tables.join(", ")} restart identity cascade`),
    );
  }
  resetFakeGrader();
}

/** Row count of a table (handy for "nothing left behind" assertions). */
export async function countRows(table: string): Promise<number> {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`bad table name ${table}`);
  const result = await db.execute<{ n: number }>(
    sql.raw(`select count(*)::int as n from "${table}"`),
  );
  return Number(result.rows[0]?.n ?? 0);
}
