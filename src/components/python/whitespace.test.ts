import { describe, expect, test } from "bun:test";
import { markWhitespace, needsWhitespaceLegend } from "./whitespace";

describe("markWhitespace", () => {
  test("spaces become middle dots", () => {
    expect(markWhitespace("Hallo  Mark")).toBe("Hallo··Mark");
  });
  test("an empty line becomes a return marker", () => {
    expect(markWhitespace("")).toBe("↵");
  });
  test("text without spaces is unchanged", () => {
    expect(markWhitespace("42")).toBe("42");
  });
});

describe("needsWhitespaceLegend", () => {
  test("only for changed lines with spaces or empty changed lines", () => {
    expect(
      needsWhitespaceLegend([{ text: "a b", status: "same" }]),
    ).toBeFalse();
    expect(
      needsWhitespaceLegend([{ text: "ab", status: "changed" }]),
    ).toBeFalse();
    expect(
      needsWhitespaceLegend([{ text: "a b", status: "changed" }]),
    ).toBeTrue();
    expect(needsWhitespaceLegend([{ text: "", status: "changed" }])).toBeTrue();
  });
});
