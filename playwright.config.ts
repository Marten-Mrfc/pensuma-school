/**
 * Playwright E2E + accessibility suite (see e2e/support/env.ts for the two
 * modes).
 *
 *   bun run test:e2e                      self-contained: build, start :3210, seed
 *   bun run test:a11y                     only e2e/a11y
 *   E2E_BASE_URL=http://localhost:3100 bunx playwright test --project=desktop
 *                                         against a running dev server
 *   E2E_DEV=1 E2E_PORT=3150 bunx playwright test …
 *                                         self-contained, but with `next dev`
 *
 * CI builds the app in an earlier step and sets E2E_SKIP_BUILD=1.
 * The web server starts BEFORE globalSetup, so database creation and
 * migrations happen inside the server command.
 */
import { defineConfig, devices } from "@playwright/test";
import {
  BASE_URL,
  E2E_DEV,
  E2E_PORT,
  SELF_CONTAINED,
  serverEnv,
} from "./e2e/support/env";

const CI = !!process.env.CI;

const serverCommand = [
  "bun e2e/support/create-db.ts",
  ...(E2E_DEV
    ? [`bunx next dev -p ${E2E_PORT}`]
    : [
        ...(process.env.E2E_SKIP_BUILD ? [] : ["bunx next build"]),
        `bunx next start -p ${E2E_PORT}`,
      ]),
].join(" && ");

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  // A dev server compiles each route on first visit: be patient there.
  expect: { timeout: SELF_CONTAINED && !E2E_DEV ? 10_000 : 30_000 },
  outputDir: "test-results",
  reporter: CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // desktop runs everything; dark and mobile repeat what differs there.
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
    {
      name: "dark",
      testMatch: ["a11y/pages.spec.ts"],
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
    {
      name: "mobile",
      testMatch: [
        "a11y/pages.spec.ts",
        "a11y/focus-not-obscured.spec.ts",
        "flows/student-practice.spec.ts",
      ],
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: SELF_CONTAINED
    ? {
        command: serverCommand,
        url: `${BASE_URL}/api/auth/ok`,
        timeout: 600_000,
        reuseExistingServer: !CI,
        env: { ...serverEnv() },
        // E2E_SERVER_LOG=1 shows the server's request log.
        stdout: process.env.E2E_SERVER_LOG ? "pipe" : "ignore",
        stderr: "pipe",
      }
    : undefined,
});
