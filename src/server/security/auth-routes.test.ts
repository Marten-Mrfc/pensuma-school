import { describe, expect, test } from "bun:test";
import {
  ALLOWED_AUTH_PATHS,
  DISABLED_AUTH_PATHS,
  isAllowedAuthPath,
  needsAuthJsonSanitizing,
  normalizeAuthPath,
  sanitizeAuthJson,
} from "./auth-routes";

describe("normalizeAuthPath", () => {
  test("strips the base path, duplicate and trailing slashes", () => {
    expect(normalizeAuthPath("/api/auth/sign-in/username")).toBe(
      "/sign-in/username",
    );
    expect(normalizeAuthPath("/api/auth//sign-in//email/")).toBe(
      "/sign-in/email",
    );
    expect(normalizeAuthPath("/api/auth/ok")).toBe("/ok");
    expect(normalizeAuthPath("/api/auth")).toBe("/");
  });

  test("decodes percent-escapes", () => {
    expect(normalizeAuthPath("/api/auth/is-username%2Davailable")).toBe(
      "/is-username-available",
    );
    expect(normalizeAuthPath("/api/auth/admin%2Flist-users")).toBe(
      "/admin/list-users",
    );
  });

  test("malformed escapes never match the allowlist", () => {
    expect(isAllowedAuthPath(normalizeAuthPath("/api/auth/ok%E0%A4%A"))).toBe(
      false,
    );
  });
});

describe("allowlist", () => {
  test("only the six paths the app uses", () => {
    expect([...ALLOWED_AUTH_PATHS].sort() as string[]).toEqual(
      [
        "/error",
        "/get-session",
        "/ok",
        "/sign-in/email",
        "/sign-in/username",
        "/sign-out",
      ].sort(),
    );
    for (const p of ALLOWED_AUTH_PATHS) expect(isAllowedAuthPath(p)).toBe(true);
  });

  test("dangerous paths are disabled and not allowed", () => {
    for (const p of [
      "/is-username-available",
      "/update-user",
      "/change-password",
      "/admin/list-users",
      "/admin/impersonate-user",
      "/sign-up/email",
    ]) {
      expect(DISABLED_AUTH_PATHS).toContain(p as never);
      expect(isAllowedAuthPath(p)).toBe(false);
    }
    for (const p of DISABLED_AUTH_PATHS)
      expect(isAllowedAuthPath(p)).toBe(false);
  });

  test("parametrised core paths are not allowed either", () => {
    expect(isAllowedAuthPath("/reset-password/abc")).toBe(false);
    expect(isAllowedAuthPath("/callback/google")).toBe(false);
  });
});

describe("sanitizeAuthJson", () => {
  test("get-session loses token, ip, user agent and impersonatedBy", () => {
    const body = {
      session: {
        id: "s1",
        token: "secret",
        ipAddress: "1.2.3.4",
        userAgent: "UA",
        impersonatedBy: null,
        expiresAt: "2026-01-01",
      },
      user: { id: "u1", name: "Docent" },
    };
    expect(sanitizeAuthJson("/get-session", body)).toEqual({
      session: { id: "s1", expiresAt: "2026-01-01" },
      user: { id: "u1", name: "Docent" },
    });
  });

  test("sign-in responses lose the token", () => {
    const body = { redirect: false, token: "secret", user: { id: "u1" } };
    expect(sanitizeAuthJson("/sign-in/username", body)).toEqual({
      redirect: false,
      user: { id: "u1" },
    });
  });

  test("null and other paths are untouched", () => {
    expect(sanitizeAuthJson("/get-session", null)).toBeNull();
    expect(sanitizeAuthJson("/ok", { ok: true, token: "x" })).toEqual({
      ok: true,
      token: "x",
    });
    expect(needsAuthJsonSanitizing("/get-session")).toBe(true);
    expect(needsAuthJsonSanitizing("/sign-in/email")).toBe(true);
    expect(needsAuthJsonSanitizing("/sign-out")).toBe(false);
  });
});
