/**
 * bun test preload (bunfig.toml). Runs before every test file, including the
 * pure unit tests in src/ (which never touch the database).
 *
 * 1. `server-only` throws outside the react-server condition, so it is
 *    mocked. Don't use `--conditions=react-server`: that swaps React for its
 *    server build and breaks component tests.
 * 2. bun auto-loads .env, whose DATABASE_URL is the shared dev database.
 *    Tests truncate tables, so they only ever run against a database whose
 *    name ends in `_test` (TEST_DATABASE_URL, default `pensuma_test`).
 * 3. The Python grader is replaced by a deterministic fake
 *    (tests/support/fake-grader.ts); the real sandbox has its own suite
 *    (`bun run test:grader`).
 */
import { mock } from "bun:test";
import path from "node:path";
import * as fakeGrader from "../support/fake-grader";

mock.module("server-only", () => ({}));

const DEFAULT_TEST_DATABASE_URL =
  "postgresql://pensuma:pensuma@localhost:5432/pensuma_test";

const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
let dbName: string;
try {
  dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
} catch {
  throw new Error(
    "[tests] TEST_DATABASE_URL is not a valid postgresql:// URL.",
  );
}
if (!/_test$/.test(dbName)) {
  throw new Error(
    `[tests] Refusing to run against "${dbName}": TEST_DATABASE_URL must name a database ending in _test (default ${DEFAULT_TEST_DATABASE_URL}).`,
  );
}

process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET = "pensuma-test-secret-pensuma-test-secret";
process.env.BETTER_AUTH_URL = "http://localhost:3999";
process.env.RATE_LIMIT_DISABLED ??= "1";
process.env.MIGRATIONS_DIR ??= path.resolve(import.meta.dir, "../../drizzle");
// Validate src/env.ts for real: a missing variable must fail the tests too.
delete process.env.SKIP_ENV_VALIDATION;
// First-run setup without an installation code (deterministic setup tests).
delete process.env.SETUP_TOKEN;

mock.module("@/server/grader", () => fakeGrader);
