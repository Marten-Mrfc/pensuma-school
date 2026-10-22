/**
 * Apply the retention periods once (the server also does this every few
 * hours, see src/server/privacy/retention-scheduler.ts).
 *
 *   bun run privacy:retention              delete what has expired
 *   bun run privacy:retention -- --dry-run show what would be deleted
 *
 * Prints the counts as a table. Uses DATABASE_URL from .env.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  RETENTION_COUNT_KEYS,
  RETENTION_COUNT_LABELS,
  retentionDeletedTotal,
} from "@/lib/privacy/retention";
import * as schema from "@/server/db/schema";
import { runRetention } from "@/server/privacy/retention-core";

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    console.log("Gebruik: privacy:retention [--dry-run]");
    return;
  }
  const dryRun = args.has("--dry-run");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is niet ingesteld.");

  const pool = new Pool({ connectionString, max: 2 });
  try {
    const db = drizzle(pool, { schema });
    const report = await runRetention(db, { trigger: "cli", dryRun });
    console.log(
      dryRun
        ? "Proefrun: er is niets verwijderd. Dit zou worden verwijderd:"
        : "Opschoning uitgevoerd:",
    );
    console.table(
      RETENTION_COUNT_KEYS.map((key) => ({
        Gegevens: RETENTION_COUNT_LABELS[key],
        Aantal: report[key],
      })),
    );
    const total = retentionDeletedTotal(report);
    console.log(
      `${dryRun ? "Te verwijderen" : "Verwijderd"}: ${total} ${total === 1 ? "regel" : "regels"}.`,
    );
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
