import type { NextConfig } from "next";
import {
  NO_INDEX_HEADERS,
  NO_STORE_HEADERS,
  securityHeaders,
} from "./src/lib/security/headers";

// headers() is evaluated at build time: branch on NODE_ENV only
// (production under `next build`, development under `next dev`).
const dev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Self-contained server build for the Docker image (Dokploy).
  output: "standalone",
  // Lets several dev servers run side by side (e.g. NEXT_DIST_DIR=.next-a next dev -p 3101).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Pyodide loads its .wasm/.zip files from disk at runtime: keep it external.
  serverExternalPackages: ["pyodide"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Security headers on every route (src/lib/security/headers.ts), incl.
  // site-wide cross-origin isolation (COOP same-origin + COEP require-corp):
  // SharedArrayBuffer + Atomics for interactive input() in the browser
  // Python runner. All assets (incl. /pyodide) are self-hosted.
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders({ dev }) },
      // tRPC/auth JSON can hold PINs and personal data: never cache it.
      { source: "/api/:path*", headers: NO_STORE_HEADERS },
      { source: "/docent", headers: NO_INDEX_HEADERS },
      { source: "/docent/:path*", headers: NO_INDEX_HEADERS },
      { source: "/leerling", headers: NO_INDEX_HEADERS },
      { source: "/leerling/:path*", headers: NO_INDEX_HEADERS },
      { source: "/print/:path*", headers: NO_INDEX_HEADERS },
      { source: "/setup", headers: NO_INDEX_HEADERS },
    ];
  },
};

export default nextConfig;
