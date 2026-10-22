/**
 * Transport guards for API route handlers: a request body cap and a
 * cross-site check for state-changing requests. Pure module.
 */

export type BodyLimitResult = { ok: true; request: Request } | { ok: false };

/**
 * Rejects bodies over `maxBytes`. Trusts a valid Content-Length (the HTTP
 * server enforces framing); otherwise reads the stream up to the cap and
 * returns a new Request with the buffered body.
 */
export async function enforceBodyLimit(
  req: Request,
  maxBytes: number,
): Promise<BodyLimitResult> {
  const header = req.headers.get("content-length");
  if (header !== null) {
    const length = Number(header);
    if (!/^\d+$/.test(header.trim()) || !Number.isSafeInteger(length)) {
      return { ok: false };
    }
    return length > maxBytes ? { ok: false } : { ok: true, request: req };
  }
  if (!req.body) return { ok: true, request: req };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(req.headers);
  headers.set("content-length", String(total));
  return {
    ok: true,
    request: new Request(req.url, {
      method: req.method,
      headers,
      body,
      signal: req.signal,
    }),
  };
}

export type CrossSiteOptions = {
  /** The app's public origin, e.g. new URL(BETTER_AUTH_URL).origin. */
  appOrigin: string;
  /** Development also allows any http://localhost:* / 127.0.0.1:* origin. */
  dev: boolean;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Defence in depth against CSRF (on top of SameSite=Lax cookies and the
 * JSON content type): a state-changing request from a browser must come
 * from our own origin. Requests without Origin and Sec-Fetch-Site are
 * non-browser clients (curl, server-side calls) and pass.
 */
export function isCrossSiteMutation(
  req: Request,
  opts: CrossSiteOptions,
): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return false;
  const site = req.headers.get("sec-fetch-site")?.toLowerCase();
  if (site === "cross-site" || site === "same-site") return true;
  const origin = req.headers.get("origin");
  if (origin === null) return false;
  if (origin === opts.appOrigin) return false;
  if (opts.dev && DEV_ORIGIN.test(origin)) return false;
  return true;
}
