/**
 * Seed the self-contained E2E database: empty every table, then the first
 * teacher and the demo world with FIXED PINs, plus the E2E-only students.
 * Run by e2e/global-setup.ts with the server's environment:
 *
 *   bun --conditions=react-server e2e/support/seed.ts
 */
import { sql } from "drizzle-orm";
import { seedAdmin } from "../../scripts/seed/seed-admin";
import { db } from "../../src/server/db";
import { loadDemoData } from "../../src/server/demo";
import { assertTestDatabase, DEMO_PINS, E2E_STUDENTS, TEACHER } from "./env";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("[e2e] DATABASE_URL is not set");
assertTestDatabase(url);

const tables = (
  await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  )
).rows.map((r) => `"${r.tablename}"`);
if (tables.length > 0) {
  await db.execute(
    sql.raw(`truncate table ${tables.join(", ")} restart identity cascade`),
  );
}

const adminId = await seedAdmin({
  email: TEACHER.email,
  password: TEACHER.password,
  name: TEACHER.name,
  production: false,
  log: () => {},
});
const extras = Object.values(E2E_STUDENTS);
const demo = await loadDemoData(adminId, {
  pins: {
    ...DEMO_PINS,
    ...Object.fromEntries(extras.map((s) => [s.number, s.pin])),
  },
  extraStudents: extras.map((s) => [s.number, s.name] as const),
});
console.log(
  `[e2e] Seeded ${demo.students.length} students, test ${demo.testId}, practice afname ${demo.assignmentId}`,
);
process.exit(0);
