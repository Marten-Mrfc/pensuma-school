/**
 * Motion (WCAG 2.3.3 / 2.2.2): with "reduce motion" nothing loops forever;
 * without it, no endless animation keeps running after 5 seconds.
 */
import { expect, type Page, test } from "@playwright/test";
import { waitForSettled } from "../helpers/a11y";
import { type TrpcApi, teacherApi } from "../helpers/trpc";
import { type DemoWorld, loadDemoWorld } from "../helpers/world";
import { STUDENT_STATE, TEACHER_STATE } from "../support/env";

async function endlessAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter(
        (a) =>
          a.playState === "running" &&
          a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
      )
      .map((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        const name = (a as CSSAnimation).animationName ?? "animation";
        return `${name} on ${target?.tagName.toLowerCase() ?? "?"}.${[...(target?.classList ?? [])].slice(0, 3).join(".")}`;
      }),
  );
}

let api: TrpcApi;
let world: DemoWorld;

test.beforeAll(async () => {
  api = await teacherApi();
  world = await loadDemoWorld(api);
});

test.afterAll(async () => {
  await api.dispose();
});

test.describe("teacher", () => {
  test.use({ storageState: TEACHER_STATE });

  for (const [name, path] of [
    ["dashboard", () => "/docent"],
    ["monitor", () => `/docent/afnames/${world.practiceId}`],
  ] as const) {
    test(`${name}: reduced motion stops endless animations`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path());
      await waitForSettled(page);
      expect(await endlessAnimations(page)).toEqual([]);
    });

    test(`${name}: no endless animation after 5 seconds`, async ({ page }) => {
      await page.goto(path());
      await waitForSettled(page);
      await page.waitForTimeout(5_500);
      expect(await endlessAnimations(page)).toEqual([]);
    });
  }
});

test.describe("student", () => {
  test.use({ storageState: STUDENT_STATE });

  test("/leerling: reduced motion stops endless animations", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/leerling");
    await waitForSettled(page);
    expect(await endlessAnimations(page)).toEqual([]);
  });

  test("/leerling: no endless animation after 5 seconds", async ({ page }) => {
    await page.goto("/leerling");
    await waitForSettled(page);
    await page.waitForTimeout(5_500);
    expect(await endlessAnimations(page)).toEqual([]);
  });
});
