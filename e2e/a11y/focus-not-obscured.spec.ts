/**
 * Focus not obscured (WCAG 2.4.11): while tabbing through a page, the
 * focused element is never hidden behind a sticky header, bottom navigation
 * or toast. Runs on desktop and on a phone (fixed bottom nav).
 */
import { expect, type Page, test } from "@playwright/test";
import { waitForSettled } from "../helpers/a11y";
import { STUDENT_STATE, TEACHER_STATE } from "../support/env";

async function coveredWhileTabbing(page: Page, presses = 40) {
  const problems: string[] = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press("Tab");
    const result = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const x = Math.min(
        Math.max(rect.left + rect.width / 2, 0),
        innerWidth - 1,
      );
      const y = Math.min(
        Math.max(rect.top + rect.height / 2, 0),
        innerHeight - 1,
      );
      // Off-screen (e.g. a visually hidden skip link) is not "covered".
      if (rect.bottom < 0 || rect.top > innerHeight) return null;
      const hit = document.elementFromPoint(x, y);
      const ok = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      return ok
        ? null
        : `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" covered by ${hit?.tagName.toLowerCase()}.${[...(hit?.classList ?? [])].slice(0, 3).join(".")}`;
    });
    if (result) problems.push(result);
  }
  return problems;
}

test.describe("student", () => {
  test.use({ storageState: STUDENT_STATE });
  test("/leerling", async ({ page }) => {
    await page.goto("/leerling");
    await waitForSettled(page);
    expect(await coveredWhileTabbing(page)).toEqual([]);
  });
});

test.describe("teacher", () => {
  test.use({ storageState: TEACHER_STATE });
  test("/docent/klassen", async ({ page }) => {
    await page.goto("/docent/klassen");
    await waitForSettled(page);
    expect(await coveredWhileTabbing(page)).toEqual([]);
  });
});
