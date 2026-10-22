/**
 * HTTP security headers, applied site-wide from next.config.ts.
 *
 * Pure module: next.config.ts imports it with a relative path (no "@/"
 * alias, no server-only), and `headers()` is evaluated at build time. So
 * branch only on NODE_ENV, never on runtime env such as BETTER_AUTH_URL.
 *
 * Why a static CSP without nonces: with cacheComponents/PPR the static
 * shells are prerendered and cannot carry a per-request nonce (see
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 * Next's inline flight scripts and the next-themes script therefore need
 * 'unsafe-inline'. Never add 'strict-dynamic' without a nonce: CSP3
 * browsers would then ignore 'self' and block every script.
 */

export type SecurityHeaderOptions = {
  /** `next dev`: React needs 'unsafe-eval' and HMR needs websockets. */
  dev: boolean;
};

export type HeaderEntry = { key: string; value: string };

export function buildCsp({ dev }: SecurityHeaderOptions): string {
  const directives: [name: string, sources: string[]][] = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        "'unsafe-inline'",
        // Pyodide: WebAssembly.instantiateStreaming (browser Python runner).
        "'wasm-unsafe-eval'",
        ...(dev ? ["'unsafe-eval'"] : []),
      ],
    ],
    // Inline style attributes (SSR), CodeMirror, echarts, shiki colours.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // QR codes are data: URLs; no third-party images (trackers, IP leaks).
    ["img-src", ["'self'", "data:", "blob:"]],
    // next/font self-hosts the fonts at build time.
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...(dev ? ["ws:", "wss:"] : [])]],
    // The Python Web Worker; child-src is the fallback for older Safari.
    ["worker-src", ["'self'", "blob:"]],
    ["child-src", ["'self'", "blob:"]],
    ["frame-src", ["'none'"]],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    // No upgrade-insecure-requests: HSTS covers HTTPS installs, and the
    // header is baked in at build time, so an http LAN pilot would break.
  ];
  return directives
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

export function securityHeaders({ dev }: SecurityHeaderOptions): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: "Content-Security-Policy", value: buildCsp({ dev }) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Never "no-referrer": browsers then send `Origin: null` on same-origin
    // POST requests, and better-auth's origin check rejects every sign-in.
    { key: "Referrer-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=(), browsing-topics=(), fullscreen=(self)",
    },
    // Cross-origin isolation on every route (SharedArrayBuffer for
    // interactive input() in the Python runner). It is decided when the
    // document loads and client-side navigation keeps the document, so it
    // cannot be limited to the exam pages. require-corp (not credentialless)
    // because Safari/iPad only becomes crossOriginIsolated with it; every
    // asset is same-origin.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Origin-Agent-Cluster", value: "?1" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];
  if (!dev) {
    // Browsers ignore HSTS over plain http, so a LAN pilot is unaffected.
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }
  return headers;
}

/** Extra headers for routes that must never be cached or indexed. */
export const NO_STORE_HEADERS: HeaderEntry[] = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

export const NO_INDEX_HEADERS: HeaderEntry[] = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];
