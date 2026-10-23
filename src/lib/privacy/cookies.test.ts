import { describe, expect, test } from "bun:test";
import { STORAGE_ITEMS } from "./cookies";

describe("STORAGE_ITEMS (cookie disclosure)", () => {
  test("names are unique", () => {
    const names = STORAGE_ITEMS.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("the session_data cookie is not listed (the cookie cache is off)", () => {
    expect(
      STORAGE_ITEMS.some((item) => item.name.includes("session_data")),
    ).toBe(false);
  });

  test("the session cookie states the student lifetime", () => {
    const token = STORAGE_ITEMS.find((item) =>
      item.name.endsWith("better-auth.session_token"),
    );
    expect(token?.retention).toContain("voor leerlingen");
    expect(token?.retention).toContain("12 uur");
    expect(token?.retention).not.toMatch(/24 uur|1 minuut/);
  });
});
