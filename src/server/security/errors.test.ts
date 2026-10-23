import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  errorIdFor,
  formatErrorShape,
  isWrappedInternal,
  loggableErrorMessage,
  PUBLIC_INTERNAL_MESSAGE,
  RateLimitError,
  retryAfterSecOf,
  trpcErrorLog,
} from "./errors";

const shapeFor = (error: TRPCError) => ({
  message: error.message,
  code: -32603,
  data: {
    code: error.code,
    httpStatus: 500,
    path: "class.list",
    stack: "Error: boom\n    at secret.ts:1:1",
  },
});

describe("isWrappedInternal", () => {
  test("a foreign error wrapped by tRPC", () => {
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      cause: new Error("Failed query: select * from user"),
    });
    expect(isWrappedInternal(error)).toBe(true);
  });

  test("our own internal error with a Dutch message is not masked", () => {
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Nakijken lukte niet.",
      cause: new Error("sandbox crashed"),
    });
    expect(isWrappedInternal(error)).toBe(false);
  });

  test("an internal error without message is masked", () => {
    expect(
      isWrappedInternal(new TRPCError({ code: "INTERNAL_SERVER_ERROR" })),
    ).toBe(true);
  });

  test("other codes are never masked", () => {
    const error = new TRPCError({
      code: "BAD_REQUEST",
      cause: new Error("x"),
    });
    expect(isWrappedInternal(error)).toBe(false);
  });
});

describe("formatErrorShape", () => {
  test("hides 'Failed query' and shows a Foutcode", () => {
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      cause: new Error('Failed query: select "id" from "user"'),
    });
    const out = formatErrorShape(shapeFor(error), error, { isDev: false });
    expect(out.message).not.toContain("Failed query");
    expect(out.message).toContain("Foutcode");
    expect(out.message).toBe(
      `${PUBLIC_INTERNAL_MESSAGE} (Foutcode: ${errorIdFor(error)})`,
    );
    expect(out.data.errorId).toBe(errorIdFor(error));
    expect("stack" in out.data).toBe(false);
  });

  test("keeps the stack in development only", () => {
    const error = new TRPCError({ code: "NOT_FOUND", message: "Weg." });
    const dev = formatErrorShape(shapeFor(error), error, { isDev: true });
    expect(dev.data.stack).toContain("secret.ts");
    expect(dev.message).toBe("Weg.");
    expect(dev.data.errorId).toBeNull();
  });

  test("adds retryAfterSec for rate limits", () => {
    const error = new RateLimitError("Te snel.", 7);
    const out = formatErrorShape(shapeFor(error), error, { isDev: false });
    expect(out.data.retryAfterSec).toBe(7);
    expect(out.message).toBe("Te snel.");
    expect(retryAfterSecOf(error)).toBe(7);
    expect(retryAfterSecOf(new Error("x"))).toBeNull();
  });

  test("flattens zod errors", () => {
    const parsed = z.object({ name: z.string() }).safeParse({ name: 1 });
    const error = new TRPCError({ code: "BAD_REQUEST", cause: parsed.error });
    const out = formatErrorShape(shapeFor(error), error, { isDev: false });
    expect(out.data.zodError?.fieldErrors).toHaveProperty("name");
  });

  test("a failed output validation is masked and not explained", () => {
    const parsed = z.object({ pin: z.string() }).safeParse({ pin: 1 });
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Output validation failed",
      cause: parsed.error,
    });
    const out = formatErrorShape(shapeFor(error), error, { isDev: false });
    expect(out.message).toContain("Foutcode");
    expect(out.message).not.toContain("Output validation");
    expect(out.data.zodError).toBeNull();
  });

  test("input errors show the first issue, not the JSON dump", () => {
    const parsed = z
      .object({
        id: z.uuid("Deze link klopt niet."),
        name: z.string().min(2, "Vul je naam in."),
      })
      .safeParse({ id: "nope", name: "" });
    const error = new TRPCError({ code: "BAD_REQUEST", cause: parsed.error });
    expect(error.message.startsWith("[")).toBe(true);
    const out = formatErrorShape(shapeFor(error), error, { isDev: false });
    expect(out.message).toBe("Deze link klopt niet.");
    expect(out.message).not.toContain("pattern");
    expect(out.data.zodError?.fieldErrors).toHaveProperty("name");
  });

  test("error ids are stable per error and differ between errors", () => {
    const a = new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const b = new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    expect(errorIdFor(a)).toBe(errorIdFor(a));
    expect(errorIdFor(a)).not.toBe(errorIdFor(b));
    expect(errorIdFor(a)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("trpcErrorLog", () => {
  const now = new Date("2026-10-23T08:30:00.000Z");
  const parse = (line: string) => JSON.parse(line) as Record<string, unknown>;

  test("expected errors log path and code only, never the user", () => {
    for (const code of [
      "NOT_FOUND",
      "BAD_REQUEST",
      "FORBIDDEN",
      "PRECONDITION_FAILED",
      "UNAUTHORIZED",
    ] as const) {
      const out = trpcErrorLog({
        error: new TRPCError({ code, message: "De afname is gesloten." }),
        path: "portal.saveAnswer",
        userId: "student-123",
        now,
      });
      expect(out.level).toBe("info");
      expect(parse(out.line)).toEqual({
        level: "info",
        ts: "2026-10-23T08:30:00.000Z",
        event: "trpc_error",
        path: "portal.saveAnswer",
        code,
      });
      expect(out.line).not.toContain("student-123");
    }
  });

  test("rate limits are a warning without the user", () => {
    const out = trpcErrorLog({
      error: new RateLimitError("Rustig aan.", 30),
      path: "portal.saveAnswer",
      userId: "student-123",
      now,
    });
    expect(out.level).toBe("warn");
    expect(parse(out.line)).not.toHaveProperty("userId");
    expect(out.line).not.toContain("student-123");
  });

  test("internal errors keep the error code and user, not the query parameters", () => {
    const pgError = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "user_username_unique"',
      ),
      { code: "23505", constraint: "user_username_unique" },
    );
    const queryError = new Error(
      'Failed query: insert into "user" ("username", "name") values ($1, $2)\nparams: 17053,Sem de Vries',
      { cause: pgError },
    );
    const error = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: queryError.message,
      cause: queryError,
    });
    const out = trpcErrorLog({
      error,
      path: "student.create",
      userId: "teacher-1",
      now,
    });
    expect(out.level).toBe("error");
    const line = parse(out.line);
    expect(line.errorId).toBe(errorIdFor(error));
    expect(line.userId).toBe("teacher-1");
    expect(line.db).toEqual({
      code: "23505",
      constraint: "user_username_unique",
    });
    expect(String(line.message)).toContain('insert into "user"');
    expect(String(line.message)).toContain("params: [weggelaten]");
    expect(out.line).not.toContain("17053");
    expect(out.line).not.toContain("Sem de Vries");
  });
});

describe("loggableErrorMessage", () => {
  test("drops Drizzle's query parameters and caps the length", () => {
    const error = new Error(
      'Failed query: select "failures" from "login_throttle" where "key" = $1\nparams: acct:student:17053',
    );
    const message = loggableErrorMessage(error, 300);
    expect(message).toContain('from "login_throttle"');
    expect(message).toContain("params: [weggelaten]");
    expect(message).not.toContain("17053");
    expect(loggableErrorMessage(new Error("x".repeat(400)), 300)).toHaveLength(
      300,
    );
  });

  test("anything that is not an Error is logged as unknown", () => {
    expect(loggableErrorMessage("17053 ging mis")).toBe("unknown");
    expect(loggableErrorMessage(null)).toBe("unknown");
  });
});
