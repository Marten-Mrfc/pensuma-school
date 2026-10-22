/**
 * Create the E2E database when missing and apply the migrations (the same
 * code path as production). Runs inside Playwright's webServer command,
 * because the web server starts before the global setup.
 *
 *   DATABASE_URL=postgresql://…/pensuma_e2e_test bun e2e/support/create-db.ts
 */
import pg from "pg";
import { runMigrations } from "../../src/server/db/migrate";
import { assertTestDatabase } from "./env";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("[e2e] DATABASE_URL is not set");
const name = assertTestDatabase(url);

const maintenance = new URL(url);
maintenance.pathname = "/postgres";
const client = new pg.Client({ connectionString: maintenance.toString() });
try {
  await client.connect();
} catch (err) {
  console.error(
    `[e2e] Postgres is not reachable at ${maintenance.host}. Start it with \`docker compose up -d db\` or set E2E_DATABASE_URL.`,
  );
  throw err;
}
try {
  const found = await client.query(
    "select 1 from pg_database where datname = $1",
    [name],
  );
  if (found.rowCount === 0) {
    await client.query(`create database "${name.replace(/"/g, '""')}"`);
    console.log(`[e2e] Created database ${name}`);
  }
} finally {
  await client.end();
}
await runMigrations();
