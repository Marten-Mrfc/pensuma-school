import { describe, expect, test } from "bun:test";
import { buildCsp, securityHeaders } from "./headers";

const header = (dev: boolean, key: string) =>
  securityHeaders({ dev }).find((h) => h.key === key)?.value;

describe("buildCsp", () => {
  test("production policy is exactly the documented one", () => {
    expect(buildCsp({ dev: false })).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "frame-src 'none'",
        "manifest-src 'self'",
        "media-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  });

  test("development adds unsafe-eval and websockets only", () => {
    const dev = buildCsp({ dev: true });
    expect(dev).toContain(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'",
    );
    expect(dev).toContain("connect-src 'self' ws: wss:");
    expect(buildCsp({ dev: false })).not.toContain("'unsafe-eval'");
    expect(buildCsp({ dev: false })).not.toContain("ws:");
  });

  test("never strict-dynamic, nonces or upgrade-insecure-requests", () => {
    for (const dev of [true, false]) {
      const csp = buildCsp({ dev });
      expect(csp).not.toContain("strict-dynamic");
      expect(csp).not.toContain("nonce-");
      expect(csp).not.toContain("upgrade-insecure-requests");
    }
  });
});

describe("securityHeaders", () => {
  test("HSTS only in production", () => {
    expect(header(false, "Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(header(true, "Strict-Transport-Security")).toBeUndefined();
  });

  test("Referrer-Policy is never no-referrer", () => {
    for (const dev of [true, false]) {
      expect(header(dev, "Referrer-Policy")).toBe("same-origin");
      expect(header(dev, "Referrer-Policy")).not.toBe("no-referrer");
    }
  });

  test("cross-origin isolation uses require-corp", () => {
    expect(header(false, "Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(header(false, "Cross-Origin-Embedder-Policy")).toBe("require-corp");
    expect(header(false, "Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  test("framing, sniffing and powerful features are locked down", () => {
    expect(header(false, "X-Frame-Options")).toBe("DENY");
    expect(header(false, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(false, "Permissions-Policy")).toContain("camera=()");
    expect(header(false, "Permissions-Policy")).toContain("fullscreen=(self)");
    expect(header(false, "Origin-Agent-Cluster")).toBe("?1");
    expect(header(false, "X-DNS-Prefetch-Control")).toBe("off");
    expect(header(false, "X-Permitted-Cross-Domain-Policies")).toBe("none");
  });

  test("header names are unique", () => {
    const keys = securityHeaders({ dev: false }).map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
