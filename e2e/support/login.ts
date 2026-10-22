/**
 * Sign in through the real login page. Role- and label-based locators only
 * (the app has no test ids), which doubles as an accessible-name check.
 */
import { expect, type Page } from "@playwright/test";
import { TEACHER } from "./env";

export async function openLoginTab(page: Page, tab: "Leerling" | "Docent") {
  if (!/\/inloggen/.test(page.url())) await page.goto("/inloggen");
  const trigger = page.getByRole("tab", { name: tab });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-selected", "true");
}

/** Fill leerlingnummer + PIN; the PIN field submits on the 6th digit. */
export async function fillStudentLogin(
  page: Page,
  number: string,
  pin: string,
) {
  await openLoginTab(page, "Leerling");
  await page.getByLabel("Leerlingnummer").fill(number);
  const pinField = page.getByLabel("PIN-code", { exact: true });
  await pinField.click();
  await pinField.pressSequentially(pin);
}

export async function loginAsStudent(page: Page, number: string, pin: string) {
  await page.goto("/inloggen");
  await fillStudentLogin(page, number, pin);
  await page.waitForURL(/\/leerling(\/|$|\?)/);
}

export async function loginAsTeacher(
  page: Page,
  email = TEACHER.email,
  password = TEACHER.password,
) {
  await page.goto("/inloggen");
  await openLoginTab(page, "Docent");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Wachtwoord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL(/\/docent(\/|$|\?)/);
}
