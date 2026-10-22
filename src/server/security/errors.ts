/**
 * tRPC error masking. Unexpected server errors (a failed SQL query, a bug)
 * reach the browser only as a friendly Dutch message with a short error
 * code; the same code appears in the server log line, so a teacher can
 * report it. Pure module (no server-only imports).
 */
import { TRPCError } from "@trpc/server";
import { ZodError, z } from "zod";

export const PUBLIC_INTERNAL_MESSAGE =
  "Er ging iets mis aan onze kant. Probeer het opnieuw.";

const errorIds = new WeakMap<object, string>();

/** A stable 8-character id per error object (formatter and log agree). */
export function errorIdFor(error: object): string {
  let id = errorIds.get(error);
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    errorIds.set(error, id);
  }
  return id;
}

/**
 * True for an INTERNAL_SERVER_ERROR that tRPC created around a foreign
 * error (its message is the foreign message, e.g. "Failed query: …"), or
 * one without a message of its own, or a failed output validation (a
 * ZodError about our own response). Errors we throw ourselves with a
 * Dutch message are shown as they are.
 */
export function isWrappedInternal(error: TRPCError): boolean {
  if (error.code !== "INTERNAL_SERVER_ERROR") return false;
  if (error.message === error.code || !error.message) return true;
  const cause = error.cause;
  if (cause instanceof ZodError) return true;
  return (
    cause instanceof Error &&
    !(cause instanceof TRPCError) &&
    cause.message === error.message
  );
}

/** TOO_MANY_REQUESTS with the wait time for the client. */
export class RateLimitError extends TRPCError {
  readonly retryAfterSec: number;

  constructor(message: string, retryAfterSec: number) {
    super({ code: "TOO_MANY_REQUESTS", message });
    this.retryAfterSec = retryAfterSec;
  }
}

export function retryAfterSecOf(error: unknown): number | null {
  if (
    error instanceof TRPCError &&
    error.code === "TOO_MANY_REQUESTS" &&
    "retryAfterSec" in error &&
    typeof error.retryAfterSec === "number"
  ) {
    return error.retryAfterSec;
  }
  return null;
}

/** Fallback when a validation error has no message of its own. */
export const PUBLIC_INVALID_INPUT_MESSAGE = "Controleer je invoer.";

/**
 * The first issue's message of an input validation error (our schemas
 * carry Dutch messages), instead of tRPC's JSON dump of every issue.
 */
function zodMessage(error: ZodError): string {
  const first = error.issues.find((issue) => issue.message?.trim());
  return first ? first.message : PUBLIC_INVALID_INPUT_MESSAGE;
}

type ShapeLike = {
  message: string;
  code: number;
  data: { stack?: string } & Record<string, unknown>;
};

/**
 * The error shape sent to the client: masked message for wrapped internal
 * errors, `errorId`, `retryAfterSec`, flattened zod errors, and never a
 * stack outside development.
 */
export function formatErrorShape<TShape extends ShapeLike>(
  shape: TShape,
  error: TRPCError,
  opts: { isDev: boolean },
) {
  const internal = error.code === "INTERNAL_SERVER_ERROR";
  const errorId = internal ? errorIdFor(error) : null;
  const masked = internal && isWrappedInternal(error);
  // Only input errors explain themselves; an internal ZodError (output
  // validation) would describe our response shape.
  const zodError =
    !internal && error.cause instanceof ZodError ? error.cause : null;
  const { stack, ...data } = shape.data;
  return {
    ...shape,
    message: masked
      ? `${PUBLIC_INTERNAL_MESSAGE} (Foutcode: ${errorId})`
      : zodError && error.code === "BAD_REQUEST"
        ? zodMessage(zodError)
        : shape.message,
    data: {
      ...data,
      ...(opts.isDev && stack ? { stack } : {}),
      zodError: zodError ? z.flattenError(zodError) : null,
      errorId,
      retryAfterSec: retryAfterSecOf(error),
    },
  };
}
