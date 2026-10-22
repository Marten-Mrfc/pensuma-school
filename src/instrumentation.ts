/**
 * Runs once when a Next.js server instance starts.
 * In production, applies pending database migrations before serving requests
 * (disable with RUN_MIGRATIONS=false).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.RUN_MIGRATIONS === "false") return;
  const { runMigrations } = await import("./server/db/migrate");
  await runMigrations();
}
