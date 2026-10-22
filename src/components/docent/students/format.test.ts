import { describe, expect, test } from "bun:test";
import { formatPin, formatScore, initials, plural } from "./format";

describe("formatPin", () => {
  test("splits a 6-digit PIN into two groups", () => {
    expect(formatPin("739838")).toBe("739 838");
  });

  test("leaves anything else untouched", () => {
    expect(formatPin("12345")).toBe("12345");
    expect(formatPin("abcdef")).toBe("abcdef");
    expect(formatPin("")).toBe("");
  });
});

describe("initials", () => {
  test("first and last capitalised part", () => {
    expect(initials("Sem de Vries")).toBe("SV");
    expect(initials("Fatima")).toBe("F");
    expect(initials("  noor van den berg ")).toBe("NB");
  });

  test("falls back to a question mark", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("plural and formatScore", () => {
  test("Dutch singular/plural", () => {
    expect(plural(1, "leerling", "leerlingen")).toBe("1 leerling");
    expect(plural(3, "leerling", "leerlingen")).toBe("3 leerlingen");
  });

  test("score with Dutch decimals", () => {
    expect(formatScore(18.5, 25)).toBe("18,5 / 25");
    expect(formatScore(null, 25)).toBe("—");
  });
});
