/**
 * Shared test helpers: the current project, signed-in pages.
 * Which specs run in which project is set in playwright.config.ts.
 */
import { type Browser, type Page, test } from "@playwright/test";
import { STUDENT_STATE, TEACHER_STATE } from "./env";

export type ProjectName = "desktop" | "dark" | "mobile";

/** The Playwright project of the running test. */
export function currentProject(): ProjectName {
  return test.info().project.name as ProjectName;
}

/** A new page in its own context, signed in as the seeded teacher. */
export async function teacherPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: TEACHER_STATE });
  return context.newPage();
}

/** A new page in its own context, signed in as the default student. */
export async function studentPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: STUDENT_STATE });
  return context.newPage();
}
