/** Helpers for the student's exam page (/leerling/poging/…). */
import { expect, type Page } from "@playwright/test";

/** Open a question by its title through the question navigator. */
export async function goToQuestion(page: Page, title: string) {
  const name = new RegExp(`^Vraag \\d+, [^:]+: ${escapeRegExp(title)}\\.`);
  let button = page.getByRole("button", { name }).first();
  const overview = page.getByRole("button", { name: /^Vragenoverzicht/ });
  // Wait until the exam has rendered one of the two navigators.
  await expect(button.or(overview).first()).toBeVisible();
  if (!(await button.isVisible())) {
    // Phones: the navigator lives in a sheet.
    await overview.click();
    button = page.getByRole("dialog").getByRole("button", { name });
  }
  await button.click();
  // Close the phone sheet if it is still open (it makes the page inert).
  const sheet = page.getByRole("dialog", { name: "Vragen" });
  if (await sheet.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  }
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: new RegExp(escapeRegExp(title)),
    }),
  ).toBeVisible();
}

/**
 * Replace the code in the CodeMirror editor. insertText is not a paste
 * (blockPaste doesn't interfere) and avoids auto-indent/auto-close.
 */
export async function replaceCode(page: Page, code: string) {
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(code);
}

/** Wait until autosave reports that everything is stored. */
export async function expectAllSaved(page: Page) {
  await expect(page.getByTitle("Alles opgeslagen").first()).toBeVisible({
    timeout: 20_000,
  });
}

/** "Inleveren" → confirm in the dialog → result page. */
export async function submitAttempt(page: Page) {
  await page.getByRole("button", { name: "Inleveren" }).first().click();
  const dialog = page.getByRole("alertdialog", { name: "Toets inleveren?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Inleveren" }).click();
  await page.waitForURL(/\/leerling\/resultaten\//, { timeout: 30_000 });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
