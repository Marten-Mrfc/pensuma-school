/**
 * Runs once when a Next.js server instance starts (production only):
 *  1. starts the Python grader's warm sandbox pool;
 *  2. applies pending database migrations before serving requests (disable
 *     with RUN_MIGRATIONS=false). `runMigrations` waits for a database that
 *     is still starting (MIGRATIONS_WAIT_MS); if it still fails, the process
 *     exits so Docker/Swarm restarts the container. Without that, Next keeps
 *     a server running that answers 500 on every route, also after the
 *     database is back;
 *  3. starts the retention scheduler (disable with RETENTION_SCHEDULER=false);
 *  4. starts the attempt sweeper (disable with ATTEMPT_SWEEPER=false): it
 *     auto-submits expired attempts and re-grades attempts whose grading was
 *     lost in a restart.
 */
function logJson(entry: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  if (entry.level === "error" || entry.level === "fatal") console.error(line);
  else console.log(line);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  const building = process.env.NEXT_PHASE === "phase-production-build";
  // Start the Python grader's warm sandbox pool (and its start-up snapshot)
  // now instead of on the first submission. Not during `next build`.
  if (!building) {
    const { warmUpGrader } = await import("./server/grader/grader");
    warmUpGrader();
  }
  if (process.env.RUN_MIGRATIONS !== "false") {
    const { runMigrations } = await import("./server/db/migrate");
    try {
      await runMigrations();
    } catch (error) {
      logJson({
        level: "fatal",
        msg: "migrations_failed",
        error: errorMessage(error),
      });
      if (building) throw error;
      // tini forwards the exit and reaps the grader sandboxes; the
      // container's restart policy starts a fresh server.
      process.exit(1);
    }
  }
  if (building) return;
  if (process.env.RETENTION_SCHEDULER !== "false") {
    try {
      const { startRetentionScheduler } = await import(
        "./server/privacy/retention-scheduler"
      );
      startRetentionScheduler();
    } catch (error) {
      // Never block start-up on the scheduler: log and serve requests.
      logJson({
        level: "error",
        msg: "retention_scheduler_failed",
        error: errorMessage(error),
      });
    }
  }
  if (process.env.ATTEMPT_SWEEPER !== "false") {
    try {
      const { startAttemptSweeper } = await import(
        "./server/services/attempts"
      );
      startAttemptSweeper();
    } catch (error) {
      logJson({
        level: "error",
        msg: "attempt_sweeper_failed",
        error: errorMessage(error),
      });
    }
  }
}
