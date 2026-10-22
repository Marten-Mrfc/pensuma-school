/** Sign-in, route guards, the failed-sign-in lockout and signing out. */
import { expect, test } from "@playwright/test";
import {
  findStudentId,
  provisionStudent,
  removeStudent,
  type TrpcApi,
  teacherApi,
} from "../helpers/trpc";
import { DEFAULT_STUDENT, E2E_STUDENTS, STUDENT_STATE } from "../support/env";
import { fillStudentLogin, loginAsStudent } from "../support/login";

const LOCKED =
  "Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw of vraag je docent om hulp.";

/** A fresh leerlingnummer per run: a lockout outlives the test. */
function lockoutStudent() {
  return {
    ...E2E_STUDENTS.lockout,
    number: `9${Date.now().toString().slice(-7)}`,
  };
}

test.describe("route guards", () => {
  test("/docent without a session goes to the login page", async ({ page }) => {
    await page.goto("/docent");
    await expect(page).toHaveURL(/\/inloggen\?next=%2Fdocent$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test.describe("as a student", () => {
    test.use({ storageState: STUDENT_STATE });

    test("a student opening /docent lands on /leerling", async ({ page }) => {
      await page.goto("/docent");
      await expect(page).toHaveURL(/\/leerling$/);
    });
  });
});

test.describe("student sign-in", () => {
  let api: TrpcApi;
  const student = lockoutStudent();

  test.beforeAll(async () => {
    api = await teacherApi();
    await provisionStudent(api, student);
  });

  test.afterAll(async () => {
    await removeStudent(api, student.number);
    await api.dispose();
  });

  test("a wrong PIN shows an alert and focuses the PIN field", async ({
    page,
  }) => {
    await page.goto("/inloggen");
    await fillStudentLogin(page, student.number, "000417");
    const alert = page.getByRole("tabpanel").getByRole("alert");
    await expect(alert).toContainText("klopt niet");
    const pin = page.getByLabel("PIN-code", { exact: true });
    await expect(pin).toBeFocused();
    await expect(pin).toHaveAttribute("aria-invalid", "true");
  });

  test("8 wrong PINs lock the account", async ({ page }) => {
    await page.goto("/inloggen");
    const alert = page.getByRole("tabpanel").getByRole("alert");
    for (let i = 0; i < 9; i++) {
      await fillStudentLogin(page, student.number, `00041${i}`);
      await expect(alert).toBeVisible();
      if ((await alert.textContent())?.includes("Te veel")) break;
    }
    await expect(alert).toHaveText(LOCKED);
    // Even the right PIN is refused now.
    await fillStudentLogin(page, student.number, student.pin);
    await expect(alert).toHaveText(LOCKED);
    expect(await findStudentId(api, student.number)).toBeTruthy();
  });
});

test.describe("signing out", () => {
  test("clears the session", async ({ page }) => {
    await loginAsStudent(page, DEFAULT_STUDENT.number, DEFAULT_STUDENT.pin);
    await page.getByRole("button", { name: /Accountmenu openen/ }).click();
    await page.getByRole("menuitem", { name: "Uitloggen" }).click();
    await expect(page).toHaveURL(/\/inloggen/);
    const keys = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("pensuma:")),
    );
    expect(keys).toEqual([]);
    await page.goto("/leerling");
    await expect(page).toHaveURL(/\/inloggen\?next=%2Fleerling$/);
  });
});
