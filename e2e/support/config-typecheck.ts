/**
 * tsconfig.json excludes playwright.config.ts: the Docker build context has
 * no e2e/ folder (.dockerignore) and `next build` type-checks every file the
 * tsconfig includes, so the config's import of ./e2e/support/env would break
 * the production build. This type-only import pulls the config back into
 * `bun run typecheck` wherever e2e/ exists (a full checkout, CI).
 */
import type playwrightConfig from "../../playwright.config";

export type PlaywrightConfig = typeof playwrightConfig;
