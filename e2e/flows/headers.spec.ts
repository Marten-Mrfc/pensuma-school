/** Security headers as a real browser receives them. */
import { expect, test } from "@playwright/test";
import { STUDENT_STATE } from "../support/env";

function expectSecurityHeaders(headers: Record<string, string>) {
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-embedder-policy"]).toBe("require-corp");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("same-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
}

test("the login page sends the security headers", async ({ page }) => {
  const response = await page.goto("/inloggen");
  expect(response?.status()).toBe(200);
  expectSecurityHeaders(response?.headers() ?? {});
  // COOP + COEP make the page cross-origin isolated (needed for input()).
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});

test.describe("signed in", () => {
  test.use({ storageState: STUDENT_STATE });

  test("student pages send the security headers and are not cached", async ({
    page,
  }) => {
    const response = await page.goto("/leerling");
    expect(response?.status()).toBe(200);
    const headers = response?.headers() ?? {};
    expectSecurityHeaders(headers);
    expect(headers["x-robots-tag"] ?? "").toContain("noindex");
  });
});

test("API responses are never cached", async ({ request }) => {
  const res = await request.get("/api/trpc/setup.status");
  expect(res.headers()["cache-control"] ?? "").toContain("no-store");
});
