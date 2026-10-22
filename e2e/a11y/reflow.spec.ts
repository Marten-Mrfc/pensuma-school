/**
 * Reflow (WCAG 1.4.10) at 320 × 256 CSS px and text spacing (1.4.12):
 * no horizontal page scroll, no clipped buttons, links or labels.
 */
import { expect, type Page, test } from "@playwright/test";
import { waitForSettled } from "../helpers/a11y";
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
import { loginAsStudent } from "../support/login";

test.use({ viewport: { width: 320, height: 256 } });

const TEXT_SPACING = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
p { margin-bottom: 2em !important; }`;

/** Elements wider than the viewport outside an allowed scroll container. */
async function overflowing(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth + 1;
    const offenders: string[] = [];
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.right <= limit) continue;
      if (el.closest('[role="region"][tabindex="0"], .cm-editor')) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      offenders.push(
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].slice(0, 3).join(".")}`,
      );
      if (offenders.length >= 5) break;
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });
}

/** Buttons, links and labels whose text is cut off. */
async function clipped(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, a, label")]
      .filter((el) => {
        if (!el.offsetParent) return false;
        // Visually hidden on purpose (e.g. the skip link until focused).
        if (el.clientHeight <= 1 || el.clientWidth <= 1) return false;
        const style = getComputedStyle(el);
        if (style.overflow === "visible" && style.overflowY === "visible")
          return false;
        if (el.classList.contains("truncate")) return false;
        return el.scrollHeight > el.clientHeight + 1;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()} "${el.textContent?.trim()}"`),
  );
}

async function checkReflow(page: Page, path: string) {
  await page.goto(path);
  await waitForSettled(page);
  const { scrollWidth, offenders } = await overflowing(page);
  expect(offenders, `too wide on ${path}`).toEqual([]);
  expect(scrollWidth, `horizontal scroll on ${path}`).toBeLessThanOrEqual(321);
  await page.addStyleTag({ content: TEXT_SPACING });
  await page.waitForTimeout(100);
  expect(await clipped(page), `clipped text on ${path}`).toEqual([]);
}

test.describe("public", () => {
  for (const path of ["/inloggen", "/toegankelijkheid"]) {
    test(path, async ({ page }) => {
      await checkReflow(page, path);
    });
  }
});

test.describe("student", () => {
  test.use({ storageState: STUDENT_STATE });
  test("/leerling", async ({ page }) => {
    await checkReflow(page, "/leerling");
  });
});

test.describe("teacher", () => {
  test.use({ storageState: TEACHER_STATE });
  for (const path of ["/docent", "/docent/klassen"]) {
    test(path, async ({ page }) => {
      await checkReflow(page, path);
    });
  }
});

test.describe("exam page", () => {
  let api: TrpcApi;
  let world: DemoWorld;
  let attemptId: string;
  const student = {
    number: throwawayNumber("4"),
    name: "Rik Reflow",
    pin: "640281",
  };

  test.beforeAll(async () => {
    api = await teacherApi();
    world = await loadDemoWorld(api);
    await provisionStudent(api, student);
    const client = await studentApiFor(student);
    ({ attemptId } = await client.mutation<{ attemptId: string }>(
      "portal.startAttempt",
      { assignmentId: world.practiceId },
    ));
    await client.dispose();
  });

  test.afterAll(async () => {
    await removeStudent(api, student.number);
    await api.dispose();
  });

  test("/leerling/poging", async ({ page }) => {
    await loginAsStudent(page, student.number, student.pin);
    await checkReflow(page, `/leerling/poging/${attemptId}`);
  });
});
