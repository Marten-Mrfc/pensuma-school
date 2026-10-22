/** Polling helpers for asynchronous effects (background grading, audits). */
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { attempts } from "@/server/db/schema";
import { drainGrading } from "./db";

export async function waitFor<T>(
  probe: () => T | Promise<T>,
  opts: { timeoutMs?: number; intervalMs?: number; message?: string } = {},
): Promise<NonNullable<T>> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const intervalMs = opts.intervalMs ?? 25;
  const started = Date.now();
  for (;;) {
    const value = await probe();
    if (value) return value as NonNullable<T>;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        opts.message ?? `waitFor: condition not met within ${timeoutMs} ms`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Wait until background grading of an attempt is finished (the attempt is no
 * longer "pending"). Returns the fresh attempt row.
 */
export async function waitForGrading(
  attemptId: string,
  timeoutMs = 5_000,
): Promise<typeof attempts.$inferSelect> {
  await drainGrading();
  return waitFor(
    async () => {
      await drainGrading();
      const [row] = await db
        .select()
        .from(attempts)
        .where(eq(attempts.id, attemptId));
      return row && row.gradingStatus !== "pending" ? row : null;
    },
    {
      timeoutMs,
      message: `waitForGrading: attempt ${attemptId} still pending after ${timeoutMs} ms`,
    },
  );
}
