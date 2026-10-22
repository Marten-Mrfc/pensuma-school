import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";
import {
  AUTH_MAX_BODY_BYTES,
  isAllowedAuthPath,
  needsAuthJsonSanitizing,
  normalizeAuthPath,
  sanitizeAuthJson,
} from "@/server/security/auth-routes";
import { enforceBodyLimit } from "@/server/security/request-guards";

/**
 * better-auth behind an allowlist: only sign-in, sign-out, get-session,
 * ok (Docker HEALTHCHECK) and error are reachable; everything else is a
 * plain 404. Session tokens are stripped from JSON responses (the
 * HttpOnly cookie is all the browser needs).
 */
const handlers = toNextJsHandler(auth.handler);

const notFound = () =>
  new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

async function sanitizeResponse(path: string, res: Response) {
  if (!needsAuthJsonSanitizing(path)) return res;
  if (!res.headers.get("content-type")?.includes("application/json")) {
    return res;
  }
  let body: unknown;
  try {
    body = await res.clone().json();
  } catch {
    return res;
  }
  const headers = new Headers(res.headers);
  // Keep every header (Set-Cookie included); the length changes.
  headers.delete("content-length");
  return new Response(JSON.stringify(sanitizeAuthJson(path, body)), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

async function handle(req: Request, method: keyof typeof handlers) {
  const path = normalizeAuthPath(new URL(req.url).pathname);
  if (!isAllowedAuthPath(path)) return notFound();
  const limited = await enforceBodyLimit(req, AUTH_MAX_BODY_BYTES);
  if (!limited.ok) return new Response("Payload Too Large", { status: 413 });
  const res = await handlers[method](limited.request);
  return sanitizeResponse(path, res);
}

export const GET = (req: Request) => handle(req, "GET");
export const POST = (req: Request) => handle(req, "POST");
