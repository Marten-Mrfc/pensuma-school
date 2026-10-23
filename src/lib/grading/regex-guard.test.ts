import { describe, expect, test } from "bun:test";
import { guardedRegexTest, hasNestedQuantifier } from "./regex-guard";

describe("guardedRegexTest", () => {
  test("normal patterns give the same answer as RegExp.test", () => {
    expect(guardedRegexTest("^hallo \\w+$", "imu", "x\nHallo Mark")).toBe(true);
    expect(guardedRegexTest("^hallo", "mu", "Hallo")).toBe(false);
    expect(guardedRegexTest("\\d{3}", "mu", "ab 123")).toBe(true);
  });

  // Regression (F08): catastrophic backtracking is stopped, not waited for.
  test("stops a pattern that backtracks too long", () => {
    const started = Date.now();
    expect(
      guardedRegexTest("^(\\w+\\s?)+$", "mu", `${"a".repeat(40)}!`, 100),
    ).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(10_000);
    // The guard keeps working afterwards.
    expect(guardedRegexTest("^a+$", "mu", "aaa")).toBe(true);
  });

  test("an invalid pattern throws (callers validate first)", () => {
    expect(() => guardedRegexTest("(", "mu", "x")).toThrow();
  });
});

describe("hasNestedQuantifier", () => {
  test.each([
    "^(\\w+\\s?)+$",
    "^(\\d+\\s*)+$",
    "(a+)+",
    "(.*)*",
    "^(?:[a-z]+)*$",
    "((ab)+)+",
    "(\\w+){2,}",
  ])("%p is reported", (pattern) => {
    expect(hasNestedQuantifier(pattern)).toBe(true);
  });

  test.each([
    "^Hallo \\w+$",
    "^\\w+( \\w+)*$",
    "^(\\d+,)*\\d+$",
    "(\\w+\\.)*",
    "(ab)+",
    "[(+)]+",
    "\\(\\d+\\)+",
    "(\\w+)?",
  ])("%p is not reported", (pattern) => {
    expect(hasNestedQuantifier(pattern)).toBe(false);
  });
});
