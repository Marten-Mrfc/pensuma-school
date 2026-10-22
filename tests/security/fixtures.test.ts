/** The security fixture cleans up after itself. */
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { resetDatabase } from "../support/db";
import { createSecurityFixtures } from "./fixtures";

async function nonEmptyTables(): Promise<string[]> {
  const tables = (
    await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    )
  ).rows.map((r) => r.tablename);
  const found: string[] = [];
  for (const table of tables) {
    const result = await db.execute<{ n: number }>(
      sql.raw(`select count(*)::int as n from "${table}"`),
    );
    const n = Number(result.rows[0]?.n ?? 0);
    if (n > 0) found.push(`${table} (${n})`);
  }
  return found;
}

test("fixtures leave no rows behind", async () => {
  await resetDatabase();
  const f = await createSecurityFixtures();
  expect((await nonEmptyTables()).length).toBeGreaterThan(0);
  await f.cleanup();
  expect(await nonEmptyTables()).toEqual([]);
});
