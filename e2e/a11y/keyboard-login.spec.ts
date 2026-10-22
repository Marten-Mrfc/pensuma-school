/** The login page with the keyboard only (WCAG 2.1.1, 2.4.1, 2.4.3, 2.4.7). */
import { expect, test } from "@playwright/test";
import { focused, tabTo } from "../helpers/keyboard";
import {
  provisionStudent,
  removeStudent,
  type TrpcApi,
  teacherApi,
} from "../helpers/trpc";
import { throwawayNumber } from "../helpers/world";
import { DEFAULT_STUDENT } from "../support/env";

test("the skip link is the first Tab stop and moves focus to the content", async ({
  page,
}) => {
  await page.goto("/toegankelijkheid");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Naar de inhoud" });
  await expect(skip).toBeFocused();
  const box = await skip.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y >= 0 && box.y < viewport.height).toBe(true);
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() => !!document.activeElement?.closest("#inhoud, main")),
    )
    .toBe(true);
});

test("on /inloggen the number field has focus; the skip link stays reachable", async ({
  page,
}) => {
  await page.goto("/inloggen");
  await expect(page.getByLabel("Leerlingnummer")).toBeFocused();
  await tabTo(page, (f) => f.name === "Naar de inhoud", {
    shift: true,
    max: 6,
  });
});

test("arrow keys switch tabs and focus stays on the tab", async ({ page }) => {
  await page.goto("/inloggen");
  await expect(page.getByLabel("Leerlingnummer")).toBeFocused();
  await tabTo(page, (f) => f.role === "tab" && f.name.includes("Leerling"), {
    shift: true,
    max: 4,
  });
  await page.keyboard.press("ArrowRight");
  const docent = page.getByRole("tab", { name: "Docent" });
  await expect(docent).toBeFocused();
  await expect(docent).toHaveAttribute("aria-selected", "true");
  // Nothing steals focus afterwards (no auto-focus on tab switch).
  await page.waitForTimeout(400);
  await expect(docent).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Leerling" })).toBeFocused();
});

test("a keyboard-only login lands on /leerling", async ({ page }) => {
  await page.goto("/inloggen");
  await expect(page.getByLabel("Leerlingnummer")).toBeFocused();
  await page.keyboard.type(DEFAULT_STUDENT.number);
  await tabTo(page, (f) => f.tag === "input" && f.name.includes("PIN"), {
    max: 4,
  });
  await expect(page.getByLabel("PIN-code", { exact: true })).toBeFocused();
  await page.keyboard.type(DEFAULT_STUDENT.pin);
  await expect(page).toHaveURL(/\/leerling$/, { timeout: 30_000 });
});

test.describe("failed sign-in", () => {
  let api: TrpcApi;
  const student = {
    number: throwawayNumber("6"),
    name: "Fenna Fout",
    pin: "802461",
  };

  test.beforeAll(async () => {
    api = await teacherApi();
    await provisionStudent(api, student);
  });

  test.afterAll(async () => {
    await removeStudent(api, student.number);
    await api.dispose();
  });

  test("a wrong PIN focuses the PIN field with aria-invalid", async ({
    page,
  }) => {
    await page.goto("/inloggen");
    await expect(page.getByLabel("Leerlingnummer")).toBeFocused();
    await page.keyboard.type(student.number);
    await tabTo(page, (f) => f.tag === "input" && f.name.includes("PIN"), {
      max: 4,
    });
    await page.keyboard.type("000417");
    const alert = page.getByRole("tabpanel").getByRole("alert");
    await expect(alert).toContainText("klopt niet");
    const pin = page.getByLabel("PIN-code", { exact: true });
    await expect(pin).toBeFocused();
    await expect(pin).toHaveAttribute("aria-invalid", "true");
    // The right PIN still works (and clears the failure counter).
    await page.keyboard.type(student.pin);
    await expect(page).toHaveURL(/\/leerling$/, { timeout: 30_000 });
  });
});

test("forced colours: the focus indicator stays visible", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/inloggen");
  await expect(page.getByLabel("Leerlingnummer")).toBeFocused();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    const f = await focused(page);
    if (f.tag === "body") continue;
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return getComputedStyle(el).outlineStyle;
    });
    expect(outline, `outline of ${f.tag} "${f.name}"`).not.toBe("none");
  }
});
