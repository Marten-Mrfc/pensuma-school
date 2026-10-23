/**
 * The production image is built from a context without e2e/, tests/ and
 * *.test.ts(x) files (.dockerignore), and `next build` type-checks every
 * file tsconfig.json includes. A type-checked file that imports from e2e/
 * or tests/ would therefore break the Docker build (and the deploy) while
 * `bun run typecheck` in a full checkout stays green.
 */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../..");
const SKIP_DIRS = new Set(["node_modules", "e2e", "tests", "docs", ".git"]);
const IMPORT = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function* buildFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".next")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* buildFiles(full);
    else if (/\.(ts|tsx|mts)$/.test(name) && !/\.test\.tsx?$/.test(name))
      yield full;
  }
}

function tsconfigExcludes(): string[] {
  const raw = readFileSync(path.join(ROOT, "tsconfig.json"), "utf8");
  return (JSON.parse(raw) as { exclude?: string[] }).exclude ?? [];
}

test("files in the Docker build context never import e2e/ or tests/", () => {
  const excluded = new Set(tsconfigExcludes());
  const offenders: string[] = [];
  for (const file of buildFiles(ROOT)) {
    const rel = path.relative(ROOT, file);
    if (excluded.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    for (const [, spec] of source.matchAll(IMPORT)) {
      if (!spec.startsWith(".")) continue;
      const target = path.relative(
        ROOT,
        path.resolve(path.dirname(file), spec),
      );
      if (/^(e2e|tests)(\/|$)/.test(target)) offenders.push(`${rel} → ${spec}`);
    }
  }
  expect(offenders).toEqual([]);
});

test("playwright.config.ts stays out of the app's type-check", () => {
  // It imports ./e2e/support/env; e2e/support/config-typecheck.ts keeps it
  // type-checked wherever e2e/ exists.
  expect(tsconfigExcludes()).toContain("playwright.config.ts");
});
