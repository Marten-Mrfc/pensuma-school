/**
 * The better-auth HTTP surface (better-auth 1.7.12) that Pensuma exposes.
 * Pure module.
 *
 * The app only uses sign-in (username for students, e-mail for teachers),
 * sign-out and get-session; the Docker HEALTHCHECK uses /ok. Everything
 * else is closed: account changes go through our own tRPC procedures, and
 * /is-username-available would let anyone enumerate leerlingnummers.
 * Server code keeps calling auth.api.* directly (not affected).
 */

export const AUTH_BASE_PATH = "/api/auth";

/** Request bodies of better-auth endpoints are tiny JSON objects. */
export const AUTH_MAX_BODY_BYTES = 32 * 1024;

export const ALLOWED_AUTH_PATHS = [
  "/sign-in/username",
  "/sign-in/email",
  "/sign-out",
  "/get-session",
  "/ok",
  "/error",
] as const;

/**
 * Every other core and plugin (username, admin) path. Also passed to
 * better-auth's `disabledPaths` as defence in depth.
 */
export const DISABLED_AUTH_PATHS = [
  "/is-username-available",
  "/update-user",
  "/change-password",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
  "/verify-email",
  "/verify-password",
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
  "/admin/unban-user",
  "/admin/ban-user",
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/remove-user",
  "/admin/set-user-password",
  "/admin/has-permission",
] as const;

const ALLOWED = new Set<string>(ALLOWED_AUTH_PATHS);

/**
 * "/api/auth//sign-in/username/" → "/sign-in/username". Percent-escapes
 * are decoded first, so an encoded path cannot slip past the allowlist.
 */
export function normalizeAuthPath(pathname: string): string {
  let path = pathname;
  if (path === AUTH_BASE_PATH || path.startsWith(`${AUTH_BASE_PATH}/`)) {
    path = path.slice(AUTH_BASE_PATH.length);
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed escapes: keep the raw path, which is never allowlisted.
  }
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (!path.startsWith("/")) path = `/${path}`;
  return path;
}

export function isAllowedAuthPath(path: string): boolean {
  return ALLOWED.has(path);
}

/** Responses whose JSON is sanitised before it reaches the browser. */
export function needsAuthJsonSanitizing(path: string): boolean {
  return path === "/get-session" || path.startsWith("/sign-in/");
}

const SESSION_SECRET_FIELDS = [
  "token",
  "ipAddress",
  "userAgent",
  "impersonatedBy",
] as const;

/**
 * Removes the session token (and IP/user agent) from JSON responses: the
 * browser only needs the HttpOnly cookie, so XSS cannot read the token.
 * Mutates and returns `body`.
 */
export function sanitizeAuthJson(path: string, body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  if (path === "/get-session") {
    const session = record.session;
    if (session && typeof session === "object" && !Array.isArray(session)) {
      for (const field of SESSION_SECRET_FIELDS) {
        delete (session as Record<string, unknown>)[field];
      }
    }
  } else if (path.startsWith("/sign-in/")) {
    delete record.token;
  }
  return body;
}
