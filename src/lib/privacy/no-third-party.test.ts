/**
 * Guard against third-party services that would leak minors' data (IP
 * addresses, page views) outside the school: CDNs, hosted fonts, analytics,
 * error trackers, map tiles and QR APIs. next/font/google is fine: it
 * self-hosts the fonts at build time.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../../..");

const FORBIDDEN_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "api.mapbox.com",
  "events.mapbox.com",
  "google-analytics.com",
  "googletagmanager.com",
  "sentry.io",
  "posthog",
  "plausible.io",
  "api.qrserver.com",
  "chart.googleapis.com",
];

const FORBIDDEN_PACKAGES = [
  /^mapbox-gl$/,
  /^@vercel\/analytics$/,
  /^@sentry\//,
  /^posthog-js$/,
];

const SOURCE_EXT = /\.(ts|tsx|css)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("no third-party services", () => {
  test("source files contain no third-party hosts", () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const host of FORBIDDEN_HOSTS) {
        if (text.includes(host)) {
          offenders.push(`${path.relative(ROOT, file)}: ${host}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("package.json has no tracking or third-party SDKs", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(ROOT, "package.json"), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ];
    const offenders = names.filter((name) =>
      FORBIDDEN_PACKAGES.some((re) => re.test(name)),
    );
    const text = JSON.stringify(pkg);
    const hosts = FORBIDDEN_HOSTS.filter((host) => text.includes(host));
    expect({ packages: offenders, hosts }).toEqual({ packages: [], hosts: [] });
  });
});
