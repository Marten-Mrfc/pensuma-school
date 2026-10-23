import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Apply SQL migrations from ./drizzle (MIGRATIONS_DIR overrides). */
export async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const migrationsFolder =
    process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    console.log(`[db] Applying migrations from ${migrationsFolder}…`);
    await migrate(drizzle(pool), { migrationsFolder });
    console.log("[db] Migrations up to date.");
  } finally {
    await pool.end();
  }
}
