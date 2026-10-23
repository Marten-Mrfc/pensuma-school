/**
 * axe (WCAG 2.2 AA) + structure checks on every page, in the desktop, dark
 * and mobile projects. A route that answers 404 is marked fixme.
 */
import { expect, type Page, type Response, test } from "@playwright/test";
import {
  assertPageBasics,
  expectAccessible,
  waitForSettled,
} from "../helpers/a11y";
import {
  provisionStudent,
  removeStudent,
  studentApiFor,
  type TrpcApi,
  teacherApi,
} from "../helpers/trpc";
import {
  type DemoWorld,
  loadDemoWorld,
  throwawayNumber,
} from "../helpers/world";
import { STUDENT_STATE, TEACHER_STATE } from "../support/env";
import { currentProject } from "../support/fixtures";
import { loginAsStudent } from "../support/login";

let api: TrpcApi;
let world: DemoWorld;
let attemptId: string;
const examStudent = {
  number: throwawayNumber("7"),
  name: "Anouk Axe",
  pin: "531864",
};

test.beforeAll(async () => {
  api = await teacherApi();
  world = await loadDemoWorld(api);
  // An attempt of a throwaway student for the exam page.
  await provisionStudent(api, examStudent);
  const student = await studentApiFor(examStudent);
  ({ attemptId } = await student.mutation<{ attemptId: string }>(
    "portal.startAttempt",
    { assignmentId: world.practiceId },
  ));
  await student.dispose();
});

test.afterAll(async () => {
  await removeStudent(api, examStudent.number);
  await api.dispose();
});

async function open(page: Page, path: string) {
  const response: Response | null = await page.goto(path);
  test.fixme(response?.status() === 404, `${path} does not exist yet`);
  expect(response?.status(), `status of ${path}`).toBeLessThan(400);
}

async function check(page: Page, path: string) {
  await open(page, path);
  await assertPageBasics(page);
  await expectAccessible(page);
}

test.describe("public pages", () => {
  test("/inloggen (both tabs)", async ({ page }) => {
    await check(page, "/inloggen");
    await page.getByRole("tab", { name: "Docent" }).click();
    await expect(page.getByLabel("E-mailadres")).toBeVisible();
    await expectAccessible(page);
  });

  for (const path of ["/toegankelijkheid", "/privacy"]) {
    test(path, async ({ page }) => {
      await check(page, path);
    });
  }
});

test.describe("teacher pages", () => {
  test.use({ storageState: TEACHER_STATE });

  const pages: [string, (w: DemoWorld) => string][] = [
    ["dashboard", () => "/docent"],
    ["klassen", () => "/docent/klassen"],
    ["klas", (w) => `/docent/klassen/${w.classId}`],
    ["leerlingen", () => "/docent/leerlingen"],
    ["leerling", (w) => `/docent/leerlingen/${w.studentId}`],
    ["toetsen", () => "/docent/toetsen"],
    ["toets", (w) => `/docent/toetsen/${w.testId}`],
    ["afnames", () => "/docent/afnames"],
    ["nieuwe afname", () => "/docent/afnames/nieuw"],
    ["afname (monitor)", (w) => `/docent/afnames/${w.practiceId}`],
    ["resultaten", (w) => `/docent/afnames/${w.practiceId}/resultaten`],
    ["nakijken", (w) => `/docent/afnames/${w.practiceId}/nakijken`],
    ["analyse", (w) => `/docent/afnames/${w.practiceId}/analyse`],
    ["vergelijken", (w) => `/docent/afnames/${w.practiceId}/vergelijken`],
    ["poging", (w) => `/docent/afnames/${w.practiceId}/pogingen/${attemptId}`],
    ["docenten", () => "/docent/docenten"],
    ["account", () => "/docent/account"],
    ["privacy", () => "/docent/privacy"],
    ["privacylogboek", () => "/docent/privacy/logboek"],
  ];
  for (const [name, path] of pages) {
    test(`docent: ${name}`, async ({ page }) => {
      await check(page, path(world));
    });
  }

  test("dialog “Nieuwe klas”", async ({ page }) => {
    await open(page, "/docent/klassen");
    await page.getByRole("button", { name: "Nieuwe klas" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page);
  });

  test("user menu", async ({ page }) => {
    await open(page, "/docent");
    await waitForSettled(page);
    const trigger = page
      .getByRole("button", { name: /Accountmenu openen/ })
      .first();
    // Phones: the account menu lives in the menu sheet.
    if (!(await trigger.isVisible())) {
      await page.getByRole("button", { name: "Menu openen" }).click();
    }
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectAccessible(page);
  });

  test("menu sheet on a phone", async ({ page }) => {
    test.skip(currentProject() !== "mobile", "phones only");
    await open(page, "/docent");
    await page.getByRole("button", { name: "Menu openen" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("student pages", () => {
  test.use({ storageState: STUDENT_STATE });

  const pages: [string, (w: DemoWorld) => string][] = [
    ["mijn toetsen", () => "/leerling"],
    ["resultaten", () => "/leerling/resultaten"],
    ["oefenen", () => "/leerling/oefenen"],
    ["afname", (w) => `/leerling/afname/${w.practiceId}`],
    ["mijn gegevens", () => "/leerling/mijn-gegevens"],
  ];
  for (const [name, path] of pages) {
    test(`leerling: ${name}`, async ({ page }) => {
      await check(page, path(world));
    });
  }
});

test.describe("exam page", () => {
  test("leerling: poging", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsStudent(page, examStudent.number, examStudent.pin);
    await check(page, `/leerling/poging/${attemptId}`);
    await context.close();
  });
});
