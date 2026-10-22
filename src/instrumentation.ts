/**
 * Runs once when a Next.js server instance starts.
 * In production, applies pending database migrations before serving requests
 * (disable with RUN_MIGRATIONS=false), then starts the retention scheduler
 * (disable with RETENTION_SCHEDULER=false).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  // Start the Python grader's warm sandbox pool (and its start-up snapshot)
  // now instead of on the first submission. Not during `next build`.
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    const { warmUpGrader } = await import("./server/grader/grader");
    warmUpGrader();
  }
  if (process.env.RUN_MIGRATIONS !== "false") {
    const { runMigrations } = await import("./server/db/migrate");
    await runMigrations();
  }
  if (
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.RETENTION_SCHEDULER !== "false"
  ) {
    try {
      const { startRetentionScheduler } = await import(
        "./server/privacy/retention-scheduler"
      );
      startRetentionScheduler();
    } catch (error) {
      // Never block start-up on the scheduler: log and serve requests.
      console.error(
        JSON.stringify({
          level: "error",
          msg: "retention_scheduler_failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
