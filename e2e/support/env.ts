/**
 * E2E configuration shared by playwright.config.ts, the global setup and
 * the bun helper scripts (create-db.ts, seed.ts).
 *
 * Two modes:
 * - Self-contained (default; CI): Playwright builds and starts the app on
 *   port 3210 against its own database `pensuma_e2e_test`, seeded with fixed
 *   PINs.
 * - Against a running server: set E2E_BASE_URL (e.g. http://localhost:3100).
 *   No server is started and nothing is seeded; the dev seed is used and
 *   tests create (and delete) throwaway students where they need them.
 */
export const E2E_PORT = 3210;

export const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL?.replace(/\/$/, "");
export const SELF_CONTAINED = !EXTERNAL_BASE_URL;
export const BASE_URL = EXTERNAL_BASE_URL ?? `http://localhost:${E2E_PORT}`;

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://pensuma:pensuma@localhost:5432/pensuma_e2e_test";

/**
 * Must be the same for the server and the seed: student PINs are stored
 * encrypted with a key derived from it (login cards decrypt them).
 */
export const E2E_AUTH_SECRET =
  process.env.E2E_AUTH_SECRET ?? "pensuma-e2e-secret-Kq7vT2xLm9Rb4WnZ8cYd";

export const TEACHER = {
  email: process.env.E2E_TEACHER_EMAIL ?? "docent@pensuma.local",
  password: process.env.E2E_TEACHER_PASSWORD ?? "welkom-docent",
  name: "Docent",
};

export const DEMO_CLASS = "4H2 (demo)";
export const DEMO_TEST = "Python basis – oefentoets";
export const PRACTICE_AFNAME = "Oefenen: Python basis";

/** Fixed PINs of the seeded demo students (same as the dev seed). */
export const DEMO_PINS: Readonly<Record<string, string>> = {
  "17053": "739838",
  "17023": "659699",
  "17054": "498460",
  "17061": "688758",
  "17072": "933665",
  "17088": "940553",
};

/** Students that only exist for E2E (seeded in self-contained mode). */
export const E2E_STUDENTS = {
  practice: { number: "17101", name: "Pim Praktijk", pin: "246810" },
  exam: { number: "17102", name: "Eva Examen", pin: "135792" },
  lockout: { number: "17104", name: "Lars Lockout", pin: "975310" },
  keyboard: { number: "17105", name: "Kim Toetsenbord", pin: "864208" },
} as const;

export type StudentLogin = { number: string; name: string; pin: string };

/** The default signed-in student (e2e/.auth/leerling.json). */
export const DEFAULT_STUDENT: StudentLogin = {
  number: process.env.E2E_STUDENT_NUMBER ?? "17053",
  name: "Jan Jansen",
  pin: process.env.E2E_STUDENT_PIN ?? DEMO_PINS["17053"],
};

export const AUTH_DIR = "e2e/.auth";
export const TEACHER_STATE = `${AUTH_DIR}/docent.json`;
export const STUDENT_STATE = `${AUTH_DIR}/leerling.json`;

/** Environment of the self-contained server and of the seed script. */
export function serverEnv(): Record<string, string> {
  const env: Record<string, string> = {
    DATABASE_URL: E2E_DATABASE_URL,
    BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
    BETTER_AUTH_URL: BASE_URL,
    // `next start` runs with NODE_ENV=production: plain http on localhost.
    ALLOW_INSECURE_HTTP: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    GRADER_POOL_SIZE: "1",
    GRADER_MAX_CONCURRENCY: "2",
    RETENTION_SCHEDULER: "false",
    PORT: String(E2E_PORT),
  };
  if (!process.env.CI) env.NEXT_DIST_DIR = ".next-e2e";
  return env;
}

/** Refuse anything but a *_test database (the seed truncates tables). */
export function assertTestDatabase(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/_test$/.test(name)) {
    throw new Error(
      `[e2e] Refusing to use database "${name}": E2E_DATABASE_URL must name a *_test database.`,
    );
  }
  return name;
}
