import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build for the Docker image (Dokploy).
  output: "standalone",
  // Lets several dev servers run side by side (e.g. NEXT_DIST_DIR=.next-a next dev -p 3101).
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
  // Cross-origin isolation (site-wide): enables SharedArrayBuffer + Atomics,
  // which the browser Python runner needs for interactive input(). All assets
  // (incl. /pyodide) are self-hosted; `credentialless` still allows
  // cross-origin no-cors loads (without cookies) should any be added.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
