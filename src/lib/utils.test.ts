import { describe, expect, test } from "bun:test";
import { cn, safeRedirectPath } from "./utils";

describe("safeRedirectPath", () => {
  test("keeps internal paths with query and hash", () => {
    expect(safeRedirectPath("/docent")).toBe("/docent");
    expect(safeRedirectPath("/leerling/afname/x?y=1#z")).toBe(
      "/leerling/afname/x?y=1#z",
    );
    expect(safeRedirectPath("  /docent/klassen  ")).toBe("/docent/klassen");
  });

  test.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/docent"],
    ["backslash", "/\\evil.com"],
    ["backslashes only", "\\\\evil.com"],
    ["tab trick", "/\t/evil.com"],
    ["newline trick", "/\n/evil.com"],
    ["absolute https", "https://evil.com"],
    ["absolute http", "http://evil.com/docent"],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:text/html,<script>alert(1)</script>"],
    ["relative", "docent"],
    ["empty", ""],
    ["whitespace", "   "],
  ])("rejects %s", (_name, value) => {
    expect(safeRedirectPath(value, "/fallback")).toBe("/fallback");
  });

  test("null and undefined fall back", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined, "/inloggen")).toBe("/inloggen");
  });

  test("encoded slashes stay on this site", () => {
    const out = safeRedirectPath("/%2F%2Fevil.com", "/fallback");
    expect(out.startsWith("/")).toBe(true);
    expect(out.startsWith("//")).toBe(false);
    expect(new URL(out, "https://pensuma.local").origin).toBe(
      "https://pensuma.local",
    );
  });

  test("dot segments are normalised and cannot escape", () => {
    expect(safeRedirectPath("/docent/../leerling")).toBe("/leerling");
    expect(safeRedirectPath("/../../etc")).toBe("/etc");
  });
});

describe("cn", () => {
  test("merges and de-duplicates Tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", false && "hidden", undefined, "font-bold")).toBe(
      "text-sm font-bold",
    );
  });
});
