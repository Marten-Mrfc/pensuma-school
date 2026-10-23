/**
 * Shared UI primitives in a real browser: focus return of dialogs and
 * sheets (WCAG 2.4.3), the mobile menu's Escape and its tooltips, toasts
 * that stay usable while a dialog is open (2.2.1) and leaving the code
 * editor with Ctrl+M on a Mac (2.1.2).
 */
import {
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { focused } from "../helpers/keyboard";
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
import { BASE_URL, TEACHER_STATE } from "../support/env";
import { signInState } from "../support/session";

let api: TrpcApi;
let world: DemoWorld;
let attemptId: string;
const student = {
  number: throwawayNumber("4"),
  name: "Fleur Focus",
  pin: "642097",
};

test.beforeAll(async () => {
  api = await teacherApi();
  world = await loadDemoWorld(api);
  await provisionStudent(api, student);
  const studentClient = await studentApiFor(student);
  ({ attemptId } = await studentClient.mutation<{ attemptId: string }>(
    "portal.startAttempt",
    { assignmentId: world.practiceId },
  ));
  await studentClient.dispose();
});

test.afterAll(async () => {
  await removeStudent(api, student.number);
  await api.dispose();
});

async function studentPage(
  browser: Browser,
  opts: { width?: number; mac?: boolean } = {},
): Promise<Page> {
  const context = await browser.newContext({
    storageState: await signInState(BASE_URL, "/api/auth/sign-in/username", {
      username: student.number,
      password: student.pin,
    }),
    viewport: { width: opts.width ?? 1280, height: 900 },
  });
  if (opts.mac) {
    // CodeMirror picks its key bindings from navigator.platform at load.
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "platform", {
        get: () => "MacIntel",
      });
    });
  }
  const page = await context.newPage();
  await page.goto(`/leerling/poging/${attemptId}`);
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  return page;
}

async function teacherPage(
  browser: Browser,
  viewport = { width: 1280, height: 900 },
): Promise<Page> {
  const context = await browser.newContext({
    storageState: TEACHER_STATE,
    viewport,
  });
  return context.newPage();
}

/** Open with Enter from `opener`, close with Escape: focus is back on it. */
async function expectFocusReturn(page: Page, opener: Locator) {
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]').last();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
}

test.describe("dialogs and sheets return focus to the control that opened them", () => {
  test("exam: display preferences, self-test sheet and question navigator", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const page = await studentPage(browser);
    await expectFocusReturn(
      page,
      page.getByRole("button", { name: "Weergave aanpassen" }),
    );

    // "Test mijn code" is disabled while the tests run, also at the moment
    // the sheet opens; focus still comes back to it.
    await page
      .getByRole("tab", { name: /Testen/ })
      .first()
      .click();
    await expectFocusReturn(
      page,
      page.getByRole("button", { name: "Test mijn code" }),
    );
    await page.context().close();

    // Below 1280px the navigator is a sheet.
    const narrow = await studentPage(browser, { width: 1024 });
    const overview = narrow.getByRole("button", { name: /^Vragenoverzicht/ });
    await expectFocusReturn(narrow, overview);
    // Choosing a question still moves focus to its heading, not back.
    await overview.click();
    await narrow
      .getByRole("dialog")
      .getByRole("button", { name: /^Vraag 2, / })
      .click();
    await expect(
      narrow.getByRole("heading", { level: 2, name: /Vraag 2 van 12/ }),
    ).toBeFocused();
    await narrow.context().close();
  });

  test("teacher: buttons and menu items without a DialogTrigger", async ({
    browser,
  }) => {
    const page = await teacherPage(browser);
    await page.goto("/docent/klassen");
    await expectFocusReturn(
      page,
      page.getByRole("button", { name: "Nieuwe klas" }).first(),
    );

    await page.goto(`/docent/klassen/${world.classId}`);
    await expectFocusReturn(
      page,
      page.getByRole("button", { name: "Leerlingen toevoegen", exact: true }),
    );
    await expectFocusReturn(
      page,
      page.getByRole("button", { name: "Leerlingen importeren", exact: true }),
    );

    // A menu item is gone once the menu closes: focus goes to the menu button.
    const more = page.getByRole("button", { name: "Meer acties" });
    await more.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Bewerken" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(more).toBeFocused();
    await page.context().close();
  });
});

test("mobile menu: one Escape closes it, links have no hidden tooltip", async ({
  browser,
}) => {
  const page = await teacherPage(browser, { width: 640, height: 450 });
  await page.goto("/docent");
  const menuButton = page.getByRole("button", { name: "Menu openen" });
  await menuButton.focus();
  await page.keyboard.press("Enter");
  const link = page.getByRole("link", { name: "Dashboard", exact: true });
  await expect(link).toBeVisible();
  for (
    let i = 0;
    i < 6 && !(await link.evaluate((el) => el === document.activeElement));
    i++
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(link).toBeFocused();
  await expect(link).not.toHaveAttribute("aria-describedby", /.+/);
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-mobile="true"]')).toHaveCount(0);
  await expect(menuButton).toBeFocused();
  await page.context().close();
});

test("an error toast stays usable while a dialog is open", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const page = await studentPage(browser);
  await page.route(/\/api\/trpc\/[^?]*preferences\.update/, (route) =>
    route.abort(),
  );
  await page.getByRole("button", { name: "Weergave aanpassen" }).click();
  const dialog = page.getByRole("dialog", { name: "Weergave en leesbaarheid" });
  await dialog.getByRole("switch", { name: "Ruimere regelafstand" }).click();

  // Shown in the dialog as well: the toast can't get keyboard focus there.
  await expect(dialog.getByRole("alert")).toContainText("Opslaan lukte niet");
  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Opslaan lukte niet" });
  await expect(toast).toBeVisible();

  // Hoverable (pauses) and clickable under Radix's pointer-events: none.
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector("[data-sonner-toaster]") as Element,
        ).pointerEvents,
    ),
  ).toBe("auto");
  // Errors stay longer than the 4-second default.
  await page.waitForTimeout(5_000);
  await expect(toast).toBeVisible();

  // Closing the toast doesn't count as a click outside the dialog.
  await toast.getByRole("button", { name: "Melding sluiten" }).click();
  await expect(toast).toBeHidden();
  await expect(dialog).toBeVisible();

  // Put the setting back.
  await page.unroute(/\/api\/trpc\/[^?]*preferences\.update/);
  await dialog.getByRole("switch", { name: "Ruimere regelafstand" }).click();
  await expect(dialog.getByRole("alert")).toBeHidden({ timeout: 10_000 });
  await page.context().close();
});

test("Ctrl+M then Tab leaves the code editor on a Mac too", async ({
  browser,
}) => {
  const page = await studentPage(browser, { mac: true });
  expect(await page.evaluate(() => navigator.platform)).toBe("MacIntel");
  await page.locator(".cm-content").first().click();
  expect((await focused(page)).inEditor).toBe(true);
  await page.keyboard.press("Control+m");
  await page.keyboard.press("Tab");
  expect((await focused(page)).inEditor).toBe(false);
  await page.context().close();
});
