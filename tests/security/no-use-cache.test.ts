/**
 * "use cache" output is shared between users. A cached function that reads
 * the session or calls the API would serve one user's data to another, so
 * no file under src/ may combine the two.
 */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dir, "../../src");
const FORBIDDEN_IMPORTS = [
  /from\s+["']@\/server\/session["']/,
  /from\s+["']@\/trpc\/server["']/,
  /from\s+["']@\/server\/api(\/[^"']*)?["']/,
];
const USE_CACHE = /^\s*["']use cache(:\s*[\w-]+)?["'];?\s*$/m;

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))
      yield full;
  }
}

test("no cached function reads the session or calls the API", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, "utf8");
    if (!USE_CACHE.test(source)) continue;
    if (FORBIDDEN_IMPORTS.some((re) => re.test(source))) {
      offenders.push(path.relative(SRC, file));
    }
  }
  expect(offenders).toEqual([]);
});

test("the guard recognises the directive", () => {
  expect(USE_CACHE.test('"use cache";\nexport async function f() {}')).toBe(
    true,
  );
  expect(USE_CACHE.test("  'use cache: private'")).toBe(true);
  expect(USE_CACHE.test('const s = "use cache is fun";')).toBe(false);
});
