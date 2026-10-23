import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";

/**
 * One pool per process: reused across dev hot reloads and shared by every
 * bundle that imports this module (instrumentation and routes each load
 * their own copy).
 */
const globalForDb = globalThis as unknown as { pgPool?: Pool };

/**
 * An idle pooled client lost its connection (database restart, failover,
 * pg_terminate_backend, idle timeout). pg-pool has already dropped it and
 * later queries reconnect; without a listener Node would turn this into an
 * uncaughtException with a full client dump in the logs.
 */
function onIdleClientError(err: Error & { code?: string }): void {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "warn",
      msg: "pg_idle_client_error",
      code: err.code,
      error: err.message,
    }),
  );
}

const pool =
  globalForDb.pgPool ??
  new Pool({ connectionString: env.DATABASE_URL, max: 10 });
// A pool kept from before a hot reload may already have its listener.
if (pool.listenerCount("error") === 0) pool.on("error", onIdleClientError);
globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
