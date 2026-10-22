import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

const BASE = "http://localhost:3000";

function request(path: string, cookie?: string) {
  return new NextRequest(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

/** Path-to-regexp-lite for the simple matcher patterns used here. */
function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith("/:path*")) {
    const base = pattern.slice(0, -"/:path*".length);
    return path === base || path.startsWith(`${base}/`);
  }
  return path === pattern;
}
const covered = (path: string) =>
  config.matcher.some((pattern) => matches(pattern, path));

describe("proxy", () => {
  test("without a session cookie → /inloggen?next=<path>", () => {
    const res = proxy(request("/docent/klassen?tab=2"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/inloggen");
    expect(location.searchParams.get("next")).toBe("/docent/klassen?tab=2");
  });

  test("a session cookie passes through", () => {
    for (const cookie of [
      "better-auth.session_token=abc.def",
      "__Secure-better-auth.session_token=abc.def",
    ]) {
      const res = proxy(request("/leerling", cookie));
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });

  test("other cookies do not count", () => {
    const res = proxy(request("/print/leerlingen/inlogkaarten", "theme=dark"));
    expect(res.status).toBe(307);
  });
});

describe("matcher", () => {
  test("covers /docent, /leerling and /print", () => {
    for (const path of [
      "/docent",
      "/docent/toetsen/abc",
      "/leerling",
      "/leerling/afnames/1",
      "/print",
      "/print/klassen/1/inlogkaarten",
    ]) {
      expect(covered(path)).toBe(true);
    }
  });

  test("never api, static files, login or setup", () => {
    for (const path of [
      "/",
      "/inloggen",
      "/setup",
      "/api/auth/ok",
      "/api/trpc/class.list",
      "/_next/static/chunk.js",
      "/pyodide/pyodide.asm.wasm",
      "/docenten",
    ]) {
      expect(covered(path)).toBe(false);
    }
  });
});
