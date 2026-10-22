/**
 * Runs once before the E2E tests (after the web server is up):
 * 1. self-contained mode: seed the E2E database with fixed PINs;
 * 2. sign in through the API and store the sessions in e2e/.auth/.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import type { FullConfig } from "@playwright/test";
import {
  AUTH_DIR,
  BASE_URL,
  DEFAULT_STUDENT,
  SELF_CONTAINED,
  STUDENT_STATE,
  serverEnv,
  TEACHER,
  TEACHER_STATE,
} from "./support/env";
import { signInState } from "./support/session";

export default async function globalSetup(_config: FullConfig) {
  if (SELF_CONTAINED) {
    execFileSync("bun", ["--conditions=react-server", "e2e/support/seed.ts"], {
      env: { ...process.env, ...serverEnv(), NODE_ENV: "development" },
      stdio: "inherit",
    });
  }
  mkdirSync(AUTH_DIR, { recursive: true });
  const teacher = await signInState(BASE_URL, "/api/auth/sign-in/email", {
    email: TEACHER.email,
    password: TEACHER.password,
  });
  writeFileSync(TEACHER_STATE, JSON.stringify(teacher, null, 2));
  const student = await signInState(BASE_URL, "/api/auth/sign-in/username", {
    username: DEFAULT_STUDENT.number,
    password: DEFAULT_STUDENT.pin,
  });
  writeFileSync(STUDENT_STATE, JSON.stringify(student, null, 2));
}
