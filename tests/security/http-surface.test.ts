/**
 * The HTTP surface of a running server (SECURITY_BASE_URL, default the
 * shared dev server http://localhost:3100). Skipped when it is unreachable.
 *
 * Student credentials for the sign-in checks: SECURITY_STUDENT_NUMBER /
 * SECURITY_STUDENT_PIN (default the seeded demo student 17053). Every run
 * ends with a successful sign-in, which clears that student's throttle.
 */
import { describe, expect, test } from "bun:test";
import { STUDENT_EMAIL_DOMAIN } from "@/lib/auth-shared";

const BASE = (process.env.SECURITY_BASE_URL ?? "http://localhost:3100").replace(
  /\/$/,
  "",
);
const STUDENT_NUMBER = process.env.SECURITY_STUDENT_NUMBER ?? "17053";
const STUDENT_PIN = process.env.SECURITY_STUDENT_PIN ?? "739838";

async function isReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/inloggen`, {
      signal: AbortSignal.timeout(5_000),
      redirect: "manual",
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

const reachable = await isReachable();

/** better-auth paths the app never uses: all must be blocked (404). */
const DISABLED_AUTH_PATHS = [
  "/is-username-available",
  "/update-user",
  "/change-password",
  "/change-email",
  "/delete-user",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
  "/verify-email",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/update-session",
  "/list-accounts",
  "/account-info",
  "/link-social",
  "/unlink-account",
  "/get-access-token",
  "/refresh-token",
  "/sign-in/social",
  "/sign-up/email",
  "/admin/set-role",
  "/admin/get-user",
  "/admin/create-user",
  "/admin/update-user",
  "/admin/list-users",
  "/admin/list-user-sessions",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
  "/admin/revoke-user-sessions",
  "/admin/remove-user",
  "/admin/set-user-password",
  "/admin/has-permission",
];

const sameOrigin = { origin: BASE, "content-type": "application/json" };

async function signInStudent() {
  return fetch(`${BASE}/api/auth/sign-in/username`, {
    method: "POST",
    headers: sameOrigin,
    body: JSON.stringify({ username: STUDENT_NUMBER, password: STUDENT_PIN }),
    redirect: "manual",
  });
}

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe.skipIf(!reachable)(`HTTP surface of ${BASE}`, () => {
  test("/api/auth/ok answers (Docker health check)", async () => {
    const res = await fetch(`${BASE}/api/auth/ok`);
    expect(res.status).toBe(200);
  });

  test("every unused better-auth path is blocked", async () => {
    const open: string[] = [];
    for (const path of DISABLED_AUTH_PATHS) {
      for (const method of ["GET", "POST"] as const) {
        const res = await fetch(`${BASE}/api/auth${path}`, {
          method,
          headers: sameOrigin,
          body: method === "POST" ? "{}" : undefined,
          redirect: "manual",
        });
        if (res.status !== 404) open.push(`${method} ${path} → ${res.status}`);
      }
    }
    expect(open).toEqual([]);
  });

  test("students cannot sign in through the e-mail flow", async () => {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: sameOrigin,
      body: JSON.stringify({
        email: `${STUDENT_NUMBER}@${STUDENT_EMAIL_DOMAIN}`,
        password: STUDENT_PIN,
      }),
      redirect: "manual",
    });
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual([]);
    // The username flow still works (and clears the throttle).
    expect((await signInStudent()).status).toBe(200);
  });

  test("sign-in and get-session expose no token", async () => {
    const signIn = await signInStudent();
    expect(signIn.status).toBe(200);
    expect(JSON.stringify(await signIn.json())).not.toContain('"token"');
    const res = await fetch(`${BASE}/api/auth/get-session`, {
      headers: { cookie: cookieHeader(signIn) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session?: Record<string, unknown>;
      user?: Record<string, unknown>;
    };
    expect(body.user?.id).toBeTruthy();
    expect(body.session).toBeDefined();
    expect(body.session?.token).toBeUndefined();
    expect(body.session?.ipAddress).toBeUndefined();
    expect(body.session?.userAgent).toBeUndefined();
  });

  test("security headers are set on pages", async () => {
    for (const path of ["/inloggen", "/"]) {
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      const h = res.headers;
      const csp = h.get("content-security-policy") ?? "";
      expect(csp).toContain("'wasm-unsafe-eval'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(h.get("cross-origin-opener-policy")).toBe("same-origin");
      expect(h.get("cross-origin-embedder-policy")).toBe("require-corp");
      expect(h.get("x-content-type-options")).toBe("nosniff");
      expect(h.get("referrer-policy")).toBe("same-origin");
      expect(h.get("x-powered-by")).toBeNull();
    }
  });

  test("a tRPC batch of 21 calls is refused", async () => {
    const paths = Array.from({ length: 21 }, () => "setup.status").join(",");
    const input = encodeURIComponent(
      JSON.stringify(
        Object.fromEntries(Array.from({ length: 21 }, (_, i) => [i, {}])),
      ),
    );
    const res = await fetch(`${BASE}/api/trpc/${paths}?batch=1&input=${input}`);
    expect(res.status).toBe(400);
  });

  test("a 7 MB tRPC body is refused with 413", async () => {
    const big = JSON.stringify({ json: { blob: "x".repeat(7 * 1024 * 1024) } });
    const res = await fetch(`${BASE}/api/trpc/setup.createFirstAdmin`, {
      method: "POST",
      headers: sameOrigin,
      body: big,
    });
    expect(res.status).toBe(413);
  });

  test("a cross-site mutation is refused with 403", async () => {
    const res = await fetch(`${BASE}/api/trpc/setup.createFirstAdmin`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ json: {} }),
    });
    expect(res.status).toBe(403);
  });
});
