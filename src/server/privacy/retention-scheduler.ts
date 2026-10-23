/**
 * Runs the retention engine periodically inside the production server.
 * Started from src/instrumentation.ts (disable with RETENTION_SCHEDULER=false).
 *
 *  - own small pg pool, like src/server/db/migrate.ts (no "server-only");
 *    each run uses one connection, which also holds the lock
 *  - first run 5 minutes after boot plus 0–60 s jitter, then every
 *    RETENTION_INTERVAL_HOURS (default 6)
 *  - a Postgres advisory lock makes sure only one replica runs at a time
 *  - timers are unref()'d so they never keep the process alive
 *  - one JSON log line per run or error
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "@/server/db/schema";
import { reportCounts, runRetention } from "./retention-core";

const FIRST_RUN_DELAY_MS = 5 * 60_000;
const FIRST_RUN_JITTER_MS = 60_000;
const DEFAULT_INTERVAL_HOURS = 6;

type SchedulerState = { timer: NodeJS.Timeout | null; pool: Pool | null };

const globalForRetention = globalThis as unknown as {
  pensumaRetentionScheduler?: SchedulerState;
};

function intervalMs(): number {
  const hours = Number(process.env.RETENTION_INTERVAL_HOURS);
  const valid = Number.isFinite(hours) && hours >= 0.25 && hours <= 24 * 7;
  return (valid ? hours : DEFAULT_INTERVAL_HOURS) * 3_600_000;
}

/**
 * An error message for the log without Drizzle's query parameters (they
 * can hold personal data; register category "Technische foutmeldingen").
 */
function loggableMessage(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  return error.message
    .replace(/\nparams:[\s\S]*$/, "\nparams: [weggelaten]")
    .slice(0, 300);
}

function log(entry: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  if (entry.level === "error") console.error(line);
  else console.log(line);
}

/**
 * One run guarded by a Postgres advisory lock, so only one server (replica)
 * runs at a time. Never throws; logs one JSON line.
 */
export async function runLockedRetention(
  pool: Pool,
): Promise<"ran" | "skipped" | "failed"> {
  const started = Date.now();
  let client: PoolClient | null = null;
  let locked = false;
  try {
    client = await pool.connect();
    const result = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(hashtext('pensuma:retention')) as locked",
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) {
      log({ level: "info", msg: "retention_skipped", reason: "locked" });
      return "skipped";
    }
    // The same connection that holds the (session-level) lock.
    const db = drizzle(client, { schema });
    const report = await runRetention(db, { trigger: "schedule" });
    log({
      level: "info",
      msg: "retention_run",
      durationMs: Date.now() - started,
      ...reportCounts(report),
    });
    return "ran";
  } catch (error) {
    log({
      level: "error",
      msg: "retention_failed",
      durationMs: Date.now() - started,
      error: loggableMessage(error),
    });
    return "failed";
  } finally {
    if (client) {
      if (locked) {
        await client
          .query("select pg_advisory_unlock(hashtext('pensuma:retention'))")
          .catch(() => undefined);
      }
      client.release();
    }
  }
}

async function tick(state: SchedulerState) {
  if (state.pool) await runLockedRetention(state.pool);
}

function schedule(state: SchedulerState, delayMs: number) {
  state.timer = setTimeout(() => {
    void tick(state).finally(() => schedule(state, intervalMs()));
  }, delayMs);
  state.timer.unref();
}

/** Start the periodic retention runs (once per process). */
export function startRetentionScheduler(): void {
  if (globalForRetention.pensumaRetentionScheduler) return;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log({ level: "error", msg: "retention_not_started", reason: "no_db_url" });
    return;
  }
  const pool = new Pool({ connectionString, max: 2 });
  pool.on("error", (error) => {
    log({ level: "error", msg: "retention_pool_error", error: error.message });
  });
  const state: SchedulerState = { timer: null, pool };
  globalForRetention.pensumaRetentionScheduler = state;
  const firstDelay =
    FIRST_RUN_DELAY_MS + Math.floor(Math.random() * FIRST_RUN_JITTER_MS);
  schedule(state, firstDelay);
  log({
    level: "info",
    msg: "retention_scheduler_started",
    firstRunInMs: firstDelay,
    intervalMs: intervalMs(),
  });
}

/** Stop the scheduler (tests). */
export async function stopRetentionScheduler(): Promise<void> {
  const state = globalForRetention.pensumaRetentionScheduler;
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  const pool = state.pool;
  state.pool = null;
  globalForRetention.pensumaRetentionScheduler = undefined;
  await pool?.end();
}
