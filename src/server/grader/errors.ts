/**
 * Failures of the grader infrastructure itself (never caused by student
 * code): no free slot in time, or sandboxes that fail to start.
 *
 * Background grading must not store these as results ("internal_error" /
 * needs_review): it leaves the answers ungraded and tries again later.
 *
 * Use `isGraderUnavailable` instead of `instanceof`: the instrumentation
 * bundle and the route bundles can each load their own copy of this module
 * while they share one sandbox pool (on globalThis), so an error created by
 * one copy is not an instance of the other copy's class.
 */

export class GraderUnavailableError extends Error {
  /** Brand checked by `isGraderUnavailable` (works across module copies). */
  readonly graderUnavailable = true as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GraderUnavailableError";
  }
}

/** A job waited longer than its queue timeout for a free grader slot. */
export class QueueTimeoutError extends GraderUnavailableError {
  constructor() {
    super("Het nakijken is op dit moment erg druk. Probeer het zo opnieuw.");
    this.name = "QueueTimeoutError";
  }
}

/** No sandbox process could be started for a job. */
export class SandboxStartError extends GraderUnavailableError {
  constructor(cause: unknown) {
    super(
      `De nakijkomgeving kon niet starten: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "SandboxStartError";
  }
}

/** True for every GraderUnavailableError, whichever module copy made it. */
export function isGraderUnavailable(
  err: unknown,
): err is GraderUnavailableError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { graderUnavailable?: unknown }).graderUnavailable === true
  );
}
