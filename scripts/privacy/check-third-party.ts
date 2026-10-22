/**
 * Third-party request check (AVG: no data to other companies).
 *
 *   bun run privacy:check-requests
 *
 * Opens Pensuma in Chromium, records every request the browser makes and
 * fails when one goes anywhere other than Pensuma itself (or data:/blob:):
 *  1. /privacy and /inloggen (anonymous)
 *  2. as student: /leerling, the start screen of an afname, /leerling/oefenen
 *     and runs Python there (loads Pyodide)
 *  3. as teacher: /docent, /docent/privacy and the audit log
 *
 * Environment: BASE_URL (default http://localhost:3100), CHECK_STUDENT
 * (17053), CHECK_PIN (739838), CHECK_TEACHER_EMAIL (docent@pensuma.local),
 * CHECK_TEACHER_PASSWORD (welkom-docent), PLAYWRIGHT_CHROMIUM_PATH.
 * Nothing is changed in the database (no attempt is started).
 */
import { existsSync } from "node:fs";
import { type BrowserContext, chromium, type Page } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3100").replace(
  /\/$/,
  "",
);
const ORIGIN = new URL(BASE_URL).origin;
const STUDENT = process.env.CHECK_STUDENT ?? "17053";
const PIN = process.env.CHECK_PIN ?? "739838";
const TEACHER_EMAIL = process.env.CHECK_TEACHER_EMAIL ?? "docent@pensuma.local";
const TEACHER_PASSWORD = process.env.CHECK_TEACHER_PASSWORD ?? "welkom-docent";

const ALLOWED_SCHEMES = new Set(["data:", "blob:", "about:"]);

type Offender = { page: string; url: string; type: string };

function isAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (ALLOWED_SCHEMES.has(parsed.protocol)) return true;
    return parsed.origin === ORIGIN;
  } catch {
    return false;
  }
}

function executablePath(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (fromEnv) return fromEnv;
  return existsSync("/opt/pw-browsers/chromium")
    ? "/opt/pw-browsers/chromium"
    : undefined;
}

async function signIn(
  context: BrowserContext,
  path: "/api/auth/sign-in/username" | "/api/auth/sign-in/email",
  body: Record<string, string>,
) {
  const res = await context.request.post(`${BASE_URL}${path}`, {
    data: body,
    headers: { origin: ORIGIN },
  });
  if (!res.ok()) {
    throw new Error(`Inloggen mislukt (${path}): HTTP ${res.status()}`);
  }
}

async function visit(page: Page, path: string, label: string) {
  console.log(`→ ${label}: ${path}`);
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch({ executablePath: executablePath() });
  const offenders: Offender[] = [];
  let total = 0;
  let pyodide = 0;
  let current = "start";

  const track = (context: BrowserContext) => {
    context.on("request", (request) => {
      total += 1;
      const url = request.url();
      if (url.includes("/pyodide/")) pyodide += 1;
      if (!isAllowed(url)) {
        offenders.push({ page: current, url, type: request.resourceType() });
      }
    });
  };

  try {
    // 1. Anonymous pages.
    const anon = await browser.newContext();
    track(anon);
    const anonPage = await anon.newPage();
    current = "/privacy";
    await visit(anonPage, "/privacy", "Privacyverklaring");
    current = "/inloggen";
    await visit(anonPage, "/inloggen", "Inloggen");
    await anon.close();

    // 2. Student.
    const student = await browser.newContext();
    track(student);
    await signIn(student, "/api/auth/sign-in/username", {
      username: STUDENT,
      password: PIN,
    });
    const studentPage = await student.newPage();
    current = "/leerling";
    await visit(studentPage, "/leerling", "Leerling: dashboard");
    const afname = await studentPage
      .locator('a[href^="/leerling/afname/"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (afname) {
      current = afname;
      await visit(studentPage, afname, "Leerling: startscherm afname");
    } else {
      console.log("  (geen afname gevonden; startscherm overgeslagen)");
    }
    current = "/leerling/oefenen";
    await visit(studentPage, "/leerling/oefenen", "Leerling: oefenen");
    const run = studentPage.getByRole("button", { name: /^Uitvoeren$/ });
    if (await run.count()) {
      console.log("  Python uitvoeren (Pyodide laden)…");
      await run.first().click();
      // Running shows "Stoppen" until Python (Pyodide) has finished.
      const stop = studentPage.getByRole("button", { name: /^Stoppen$/ });
      await stop
        .first()
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => undefined);
      await stop
        .first()
        .waitFor({ state: "hidden", timeout: 90_000 })
        .catch(() => undefined);
      await studentPage.waitForLoadState("networkidle");
      await studentPage.waitForTimeout(1000);
    } else {
      console.log("  (geen knop Uitvoeren gevonden)");
    }
    current = "/leerling/mijn-gegevens";
    await visit(
      studentPage,
      "/leerling/mijn-gegevens",
      "Leerling: mijn gegevens",
    );
    await student.close();

    // 3. Teacher.
    const teacher = await browser.newContext();
    track(teacher);
    await signIn(teacher, "/api/auth/sign-in/email", {
      email: TEACHER_EMAIL,
      password: TEACHER_PASSWORD,
    });
    const teacherPage = await teacher.newPage();
    for (const [path, label] of [
      ["/docent", "Docent: dashboard"],
      ["/docent/privacy", "Docent: privacy"],
      ["/docent/privacy/logboek", "Docent: logboek"],
    ] as const) {
      current = path;
      await visit(teacherPage, path, label);
    }
    await teacher.close();
  } finally {
    await browser.close();
  }

  console.log(
    `\n${total} verzoeken gecontroleerd (${pyodide} voor Python/Pyodide).`,
  );
  if (offenders.length > 0) {
    console.error(
      `✗ ${offenders.length} verzoek(en) naar een andere partij dan ${ORIGIN}:`,
    );
    for (const o of offenders) {
      console.error(`  [${o.type}] ${o.url}  (op ${o.page})`);
    }
    process.exit(1);
  }
  console.log(`✓ Alle verzoeken gaan naar ${ORIGIN} (of data:/blob:).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
