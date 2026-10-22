import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  errorIdFor,
  formatErrorShape,
  isWrappedInternal,
  PUBLIC_INTERNAL_MESSAGE,
  RateLimitError,
  retryAfterSecOf,
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
