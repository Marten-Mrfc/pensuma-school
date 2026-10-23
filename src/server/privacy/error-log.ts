/**
 * Server log lines for errors that application code catches itself
 * (outside the tRPC error formatter, which logs through trpcErrorLog):
 * one JSON line per error with an error code a teacher can quote.
 *
 * Data minimisation (register category "Technische foutmeldingen
 * (serverlogboek)"): never the input, and never the message of a database
 * error, because Drizzle quotes the query with its parameters (a name, a
 * leerlingnummer, an answer). A database error only logs its SQLSTATE and
 * constraint. `context` is for ids and counts only.
 *
 * Pure module: no "server-only" or Next.js imports.
 */
import { errorIdFor, loggableErrorMessage } from "@/server/security/errors";

export type DatabaseErrorInfo = { code: string; constraint?: string };

/**
 * SQLSTATE and constraint of a database error, also when it is wrapped
 * (DrizzleQueryError, TRPCError) a few levels deep.
 */
export function databaseErrorOf(error: unknown): DatabaseErrorInfo | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const e = current as Error & { code?: unknown; constraint?: unknown };
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
      return {
        code: e.code,
        ...(typeof e.constraint === "string"
          ? { constraint: e.constraint.slice(0, 100) }
          : {}),
      };
    }
    current = e.cause;
  }
  return undefined;
}

export type ErrorLogContext = Record<string, string | number | boolean | null>;

/**
 * The log line for a caught error. `errorId` is stable per error object
 * (the same id the tRPC formatter would show for it).
 */
export function serverErrorLine(
  event: string,
  error: unknown,
  context: ErrorLogContext = {},
  now: Date = new Date(),
): { errorId: string; line: string } {
  const errorId =
    typeof error === "object" && error !== null
      ? errorIdFor(error)
      : crypto.randomUUID().slice(0, 8);
  const db = databaseErrorOf(error);
  // Context first: it can never overwrite the fixed fields.
  const line = {
    ...context,
    level: "error",
    ts: now.toISOString(),
    event,
    errorId,
    error: error instanceof Error ? error.name.slice(0, 60) : typeof error,
    ...(db
      ? { db }
      : { message: loggableErrorMessage(error, 300).replace(/\s+/g, " ") }),
  };
  return { errorId, line: JSON.stringify(line) };
}

/** Write the line for a caught error to stderr; returns its error code. */
export function logServerError(
  event: string,
  error: unknown,
  context?: ErrorLogContext,
): string {
  const { errorId, line } = serverErrorLine(event, error, context);
  console.error(line);
  return errorId;
}
