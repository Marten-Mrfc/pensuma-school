import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** How long to wait for a database that is still starting (MIGRATIONS_WAIT_MS). */
const DEFAULT_WAIT_MS = 60_000;
const FIRST_DELAY_MS = 1_000;
const MAX_DELAY_MS = 5_000;

/** Network errors and Postgres codes that mean "not reachable (yet)". */
const TRANSIENT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now ("the database system is starting up")
]);

/**
 * True when the error means the database can't be reached right now
 * (container still starting, restarting, DNS not ready), as opposed to a
 * real problem such as an SQL error in a migration. Follows `cause`
 * (drizzle wraps driver errors).
 */
export function isTransientDbError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current !== "object") return false;
    const { code, message, cause } = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (typeof code === "string") {
      if (TRANSIENT_CODES.has(code)) return true;
      if (/^08[0-9A-Z]{3}$/.test(code)) return true; // connection_exception
    }
    if (
      typeof message === "string" &&
      /Connection terminated|timeout exceeded when trying to connect/i.test(
        message,
      )
    )
      return true;
    current = cause;
  }
  return false;
}

function waitBudgetMs(): number {
  const raw = process.env.MIGRATIONS_WAIT_MS;
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_WAIT_MS;
}

/**
 * Run `fn`; while it fails with a transient database error, retry with
 * exponential backoff (1 s, 2 s, 4 s, then 5 s) until `budgetMs` is used up.
 * Other errors are thrown at once.
 */
export async function retryWhileDbUnavailable<T>(
  fn: () => Promise<T>,
  opts: {
    budgetMs: number;
    onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  },
): Promise<T> {
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const started = now();
  let delay = FIRST_DELAY_MS;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const left = opts.budgetMs - (now() - started);
      if (!isTransientDbError(err) || left <= 0) throw err;
      const wait = Math.min(delay, left);
      opts.onRetry?.(err, attempt, wait);
      await sleep(wait);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    }
  }
}

function describe(err: unknown): string {
  let current: unknown = err;
  while (
    current instanceof Error &&
    current.cause instanceof Error &&
    current.cause !== current
  )
    current = current.cause;
  return current instanceof Error ? current.message : String(current);
}

/**
 * Apply SQL migrations from ./drizzle (MIGRATIONS_DIR overrides). Waits up
 * to MIGRATIONS_WAIT_MS (default 60 s) for a database that is not reachable
 * yet; other errors are thrown at once.
 */
export async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const migrationsFolder =
    process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");
  console.log(`[db] Applying migrations from ${migrationsFolder}…`);
  await retryWhileDbUnavailable(
    async () => {
      // A fresh pool per attempt: a failed connection leaves nothing behind.
      const pool = new Pool({
        connectionString,
        max: 1,
        connectionTimeoutMillis: 10_000,
      });
      pool.on("error", () => {
        // An idle client lost its connection; the query itself reports it.
      });
      try {
        await migrate(drizzle(pool), { migrationsFolder });
      } finally {
        await pool.end().catch(() => {});
      }
    },
    {
      budgetMs: waitBudgetMs(),
      onRetry: (err, attempt, delayMs) =>
        console.warn(
          `[db] Database not reachable (${describe(err)}); retry ${attempt} in ${Math.round(delayMs / 1000)} s`,
        ),
    },
  );
  console.log("[db] Migrations up to date.");
}
