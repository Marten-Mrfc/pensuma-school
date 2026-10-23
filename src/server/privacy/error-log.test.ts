import { describe, expect, spyOn, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { errorIdFor } from "@/server/security/errors";
import { databaseErrorOf, logServerError, serverErrorLine } from "./error-log";

const NUMBER = "90012345";
const NAME = "Sem de Vries";

/** What Drizzle throws: the query with its parameters, the pg error as cause. */
function drizzleError() {
  const pgError = Object.assign(
    new Error(
      `duplicate key value violates unique constraint "user_username_unique" Key (username)=(${NUMBER}) already exists.`,
    ),
    { code: "23505", constraint: "user_username_unique" },
  );
  const error = new Error(
    `Failed query: insert into "user" ("id", "name", "username") values ($1, $2, $3)\nparams: abc,${NAME},${NUMBER}`,
    { cause: pgError },
  );
  error.name = "DrizzleQueryError";
  return error;
}

describe("serverErrorLine", () => {
  test("a database error: code and constraint only, never the query or its parameters", () => {
    const error = drizzleError();
    const { errorId, line } = serverErrorLine(
      "student.import_create_failed",
      error,
      {},
      new Date("2026-10-23T10:00:00Z"),
    );
    expect(JSON.parse(line)).toEqual({
      level: "error",
      ts: "2026-10-23T10:00:00.000Z",
      event: "student.import_create_failed",
      errorId,
      error: "DrizzleQueryError",
      db: { code: "23505", constraint: "user_username_unique" },
    });
    expect(line).not.toContain(NUMBER);
    expect(line).not.toContain(NAME);
    expect(line).not.toContain("Failed query");
    // The same code the tRPC formatter shows for this error object.
    expect(errorId).toBe(errorIdFor(error));
  });

  test("also through a TRPCError that wraps it", () => {
    const wrapped = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Het account kon niet worden aangemaakt. Probeer het opnieuw.",
      cause: drizzleError(),
    });
    expect(databaseErrorOf(wrapped)).toEqual({
      code: "23505",
      constraint: "user_username_unique",
    });
    const { line } = serverErrorLine("x", wrapped);
    expect(line).not.toContain(NUMBER);
    expect(JSON.parse(line).message).toBeUndefined();
  });

  test("another error keeps a short message (without query parameters) and the context ids", () => {
    const { line } = serverErrorLine(
      "grading.attempt_failed",
      new Error("Grader timeout"),
      { attemptId: "a1" },
    );
    expect(JSON.parse(line)).toMatchObject({
      event: "grading.attempt_failed",
      error: "Error",
      message: "Grader timeout",
      attemptId: "a1",
    });
  });

  test("context can never overwrite the fixed fields", () => {
    const { line } = serverErrorLine("echt", new Error("x"), {
      event: "nep",
      level: "info",
    });
    expect(JSON.parse(line)).toMatchObject({ event: "echt", level: "error" });
  });

  test("a thrown non-error still gets an error code", () => {
    const { errorId, line } = serverErrorLine("x", "kapot");
    expect(errorId).toMatch(/^[0-9a-f-]{8}$/);
    expect(JSON.parse(line)).toMatchObject({ error: "string" });
  });
});

describe("logServerError", () => {
  test("writes one JSON line to stderr and returns the error code", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const error = drizzleError();
      const errorId = logServerError("student.import_create_failed", error);
      expect(spy).toHaveBeenCalledTimes(1);
      const [line] = spy.mock.calls[0] as [string];
      expect(JSON.parse(line).errorId).toBe(errorId);
      expect(line).not.toContain(NUMBER);
    } finally {
      spy.mockRestore();
    }
  });
});
