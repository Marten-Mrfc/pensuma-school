/**
 * The core promise, end to end: a student answers "Begroeting" with
 * input("…") and a prompt, and it is graded as correct (prompts are not
 * part of the graded output). Runs on desktop and on a phone.
 */
import { expect, test } from "@playwright/test";
import {
  provisionStudent,
  removeStudent,
  type TrpcApi,
  teacherApi,
} from "../helpers/trpc";
import { E2E_STUDENTS, PRACTICE_AFNAME } from "../support/env";
import {
  expectAllSaved,
  goToQuestion,
  replaceCode,
  submitAttempt,
} from "../support/exam";
import { currentProject } from "../support/fixtures";
import { loginAsStudent } from "../support/login";

const CODE = 'naam = input("Wat is je naam? ")\nprint("Hallo " + naam)\n';
const OPEN_ANSWER =
  "Een for-lus herhaalt voor elk element; een while-lus zolang iets waar is.";

let api: TrpcApi;
let student: { number: string; name: string; pin: string };

test.beforeAll(async () => {
  api = await teacherApi();
  // Its own student per project, so desktop and mobile don't share attempts.
  student =
    currentProject() === "mobile"
      ? { ...E2E_STUDENTS.practice, number: "17103" }
      : { ...E2E_STUDENTS.practice };
  await provisionStudent(api, student);
});

test.afterAll(async () => {
  await removeStudent(api, student.number);
  await api.dispose();
});

test("practice: answer, autosave, reload, submit and see Begroeting graded correct", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loginAsStudent(page, student.number, student.pin);

  // Dashboard → start screen.
  await expect(
    page.getByRole("heading", { name: /Open toetsen/ }),
  ).toBeVisible();
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: PRACTICE_AFNAME }) });
  await card.getByRole("link", { name: /Starten/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: PRACTICE_AFNAME }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start toets" }).click();
  await page.waitForURL(/\/leerling\/poging\//);

  // Interactive input() needs cross-origin isolation (COOP + COEP).
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  await goToQuestion(page, "Begroeting");
  await replaceCode(page, CODE);

  await goToQuestion(page, "Gehele deling");
  await page.getByRole("radio", { name: "3", exact: true }).check({
    force: true,
  });

  await goToQuestion(page, "for of while?");
  await page.getByLabel("Jouw antwoord").fill(OPEN_ANSWER);
  await expectAllSaved(page);

  // A reload keeps every answer.
  await page.reload();
  await goToQuestion(page, "for of while?");
  await expect(page.getByLabel("Jouw antwoord")).toHaveValue(OPEN_ANSWER);
  await goToQuestion(page, "Gehele deling");
  await expect(
    page.getByRole("radio", { name: "3", exact: true }),
  ).toBeChecked();
  await goToQuestion(page, "Begroeting");
  await expect(page.locator(".cm-content").first()).toContainText(
    'print("Hallo " + naam)',
  );

  await submitAttempt(page);

  // Server-side grading (real Pyodide sandbox) finishes in the background.
  await expect(
    page.getByRole("button", { name: /^Goed\b.*Begroeting/ }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(
    page.getByRole("button", { name: /^Goed\b.*Gehele deling/ }),
  ).toBeVisible();

  // No answer backups stay behind on a shared school computer.
  const backups = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("pensuma:poging:")),
  );
  expect(backups).toEqual([]);
});
