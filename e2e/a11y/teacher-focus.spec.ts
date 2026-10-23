/**
 * Teacher pages with the keyboard (review group U3c): focus never drops to
 * <body> after adding or deleting in the test builder (WCAG 2.4.3), undo of
 * a deleted test case does not depend on a timed toast (2.2.1), validation
 * errors move focus (3.3.1), result counts are announced (4.1.3), radio
 * groups follow the radio keyboard model (4.1.2), the access-code
 * presenter is a real modal (2.4.3, 2.4.11), and the minutes dialog says
 * why a value is refused (3.3.1).
 *
 * Runs against a running server too:
 *   E2E_BASE_URL=http://localhost:3100 bunx playwright test \
 *     e2e/a11y/teacher-focus.spec.ts --project=desktop
 */
import { expect, type Page, test } from "@playwright/test";
import { focused, liveLog, recordLiveRegions } from "../helpers/keyboard";
import {
  findDemoClass,
  findTest,
  provisionStudent,
  removeStudent,
  studentApiFor,
  type TrpcApi,
  teacherApi,
} from "../helpers/trpc";
import { throwawayNumber } from "../helpers/world";
import { DEMO_TEST, TEACHER_STATE } from "../support/env";

test.use({ storageState: TEACHER_STATE });

let api: TrpcApi;

test.beforeAll(async () => {
  api = await teacherApi();
});

test.afterAll(async () => {
  await api.dispose();
});

/** Tag and accessible-ish name of the focused element ("body" when lost). */
async function focusName(page: Page) {
  const f = await focused(page);
  return f.tag === "body" ? "body" : f.name;
}

async function addQuestionWithKeyboard(page: Page, template: string) {
  const trigger = page
    .getByRole("complementary", { name: "Vragenlijst" })
    .getByRole("button", { name: "Vraag toevoegen" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: template }).focus();
  await page.keyboard.press("Enter");
}

test.describe("test builder", () => {
  let testId: string;

  test.beforeEach(async () => {
    const created = await api.mutation<{ id: string }>("test.create", {
      title: `E2E-focus ${Date.now().toString(36)}`,
    });
    testId = created.id;
  });

  test.afterEach(async () => {
    await api.mutation("test.delete", { id: testId }).catch(() => {});
  });

  test("adding a question focuses its title; deleting keeps focus nearby", async ({
    page,
  }) => {
    await page.goto(`/docent/toetsen/${testId}`);
    // A new test can't be published: the tile must not say "0" in green.
    await expect(
      page.locator("dt", { hasText: "Problemen" }).locator("+ dd"),
    ).toHaveText("1");

    // A03: add a question with the keyboard → its Titel field has focus.
    // A slow menu close: the server answers before the menu has closed, so
    // the menu must not pull focus back to "Vraag toevoegen" afterwards.
    const slowClose = await page.addStyleTag({
      content:
        '[data-slot="dropdown-menu-content"][data-state="closed"]{animation-duration:2s !important}',
    });
    await addQuestionWithKeyboard(page, "Invoer & uitvoer");
    const title = page.getByRole("textbox", { name: "Titel", exact: true });
    await expect(title).toHaveValue("Begroeting");
    await expect(title).toBeFocused();
    // Still there once the menu has finished closing.
    await page.waitForTimeout(2_500);
    await expect(title).toBeFocused();
    await slowClose.evaluate((el) => (el as HTMLStyleElement).remove());

    // A03 + A06: delete test 2 → focus on test 1's header, inline undo.
    await page.getByRole("button", { name: "Test 2 verwijderen" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => focusName(page)).toContain("Invoer: Mark");
    const undo = page.getByRole("button", { name: "Ongedaan maken" });
    await expect(undo).toBeVisible();
    // Still there long after a toast would have closed.
    await page.waitForTimeout(5_000);
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(
      page.getByRole("button", { name: "Test 2 verwijderen" }),
    ).toBeVisible();
    await expect.poll(() => focusName(page)).toContain("Invoer: Fatima");

    // Deleting the last test → focus on "Uitvoertest".
    for (const n of [2, 1]) {
      await page.getByRole("button", { name: `Test ${n} verwijderen` }).click();
    }
    await expect(
      page.getByRole("button", { name: "Uitvoertest" }),
    ).toBeFocused();

    // A03: an answer option → the option now in its place.
    await addQuestionWithKeyboard(page, "Meerkeuze (één antwoord)");
    await expect(title).toBeFocused();
    await page.getByRole("button", { name: "Optie B verwijderen" }).focus();
    await page.keyboard.press("Enter");
    const optionB = page.getByRole("textbox", { name: "Tekst van optie B" });
    await expect(optionB).toBeFocused();
    await expect(optionB).toHaveValue("`4`");

    // A03: delete the question → the heading of the question in its place.
    await page
      .getByRole("button", { name: "Meer acties voor deze vraag" })
      .click();
    await page.getByRole("menuitem", { name: "Vraag verwijderen" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Verwijderen" })
      .click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect.poll(() => focusName(page)).toContain("Vraag 1 van 1");
  });
});

test("tests page: radio keys on the status filter, announced results", async ({
  page,
}) => {
  await page.goto("/docent/toetsen");
  // Only changes after the first result are announced: wait for it.
  await expect(page.getByText(DEMO_TEST).first()).toBeVisible();
  await recordLiveRegions(page);
  const group = page.getByRole("radiogroup", { name: "Filter op status" });
  const active = group.getByRole("radio", { name: "Actief" });
  await expect(active).toHaveAttribute("aria-checked", "true");
  await active.focus();
  await page.keyboard.press("ArrowRight");
  const draft = group.getByRole("radio", { name: "Concept" });
  await expect(draft).toBeFocused();
  await expect(draft).toHaveAttribute("aria-checked", "true");
  await expect(active).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("Home");
  await expect(active).toBeFocused();
  await expect(active).toHaveAttribute("aria-checked", "true");

  await page.getByLabel("Zoek toetsen").fill("zzz-geen-toets");
  await expect
    .poll(async () => (await liveLog(page)).polite)
    .toContain("Geen toetsen gevonden.");
});

test("class form: an empty name moves focus to the field", async ({ page }) => {
  await page.goto("/docent/klassen");
  await page.getByRole("button", { name: "Nieuwe klas" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nieuwe klas" });
  await dialog.getByRole("button", { name: "Klas aanmaken" }).focus();
  await page.keyboard.press("Enter");
  const name = dialog.getByRole("textbox", { name: /Naam/ });
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(/Geef de klas een naam/);

  // Enter inside the (already focused) field: the error is announced.
  await recordLiveRegions(page);
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await liveLog(page)).assertive)
    .toContain("Geef de klas een naam.");
});

test.describe("live overview", () => {
  const student = {
    number: throwawayNumber("7"),
    name: "Fien Focus",
    pin: "481216",
  };
  let afnameId: string;

  test.beforeAll(async () => {
    await provisionStudent(api, student);
    const [klas, demo] = await Promise.all([
      findDemoClass(api),
      findTest(api, DEMO_TEST),
    ]);
    const created = await api.mutation<{ id: string; accessCode: string }>(
      "assignment.create",
      {
        testId: demo.id,
        classId: klas.id,
        title: `E2E-presenter ${student.number}`,
        mode: "exam",
        openNow: true,
        // A deadline, so "Tijd verlengen" is offered.
        timeLimitMinutes: 50,
        generateAccessCode: true,
      },
    );
    afnameId = created.id;
    const client = await studentApiFor(student);
    await client.mutation("portal.startAttempt", {
      assignmentId: afnameId,
      accessCode: created.accessCode,
    });
    await client.dispose();
  });

  test.afterAll(async () => {
    if (afnameId) {
      await api.mutation("assignment.delete", { id: afnameId }).catch(() => {});
    }
    await removeStudent(api, student.number);
  });

  test("access-code presenter traps focus and returns it on Esc", async ({
    page,
  }) => {
    await page.goto(`/docent/afnames/${afnameId}`);
    // As if the browser refuses fullscreen.
    await page.evaluate(() => {
      Element.prototype.requestFullscreen = () =>
        Promise.reject(new Error("geweigerd"));
    });
    const open = page.getByRole("button", { name: "Toon toegangscode" });
    await open.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      expect((await focused(page)).inDialog).toBe(true);
    }
    // The page behind the overlay is hidden from assistive technology.
    expect(
      await page.evaluate(
        () => !!document.querySelector("main")?.closest('[aria-hidden="true"]'),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
  });

  test("monitor search is announced; invalid minutes are explained", async ({
    page,
  }) => {
    await page.goto(`/docent/afnames/${afnameId}`);
    await recordLiveRegions(page);
    await page.getByLabel("Zoek leerling").fill("zzz-niemand");
    await expect
      .poll(async () => (await liveLog(page)).polite)
      .toContain("Geen leerlingen in deze selectie.");
    await page.getByLabel("Zoek leerling").fill(student.name);

    await page
      .getByRole("button", { name: `Acties voor ${student.name}` })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /Tijd verlengen/ }).click();
    await page.getByRole("menuitem", { name: "Anders…" }).click();
    const minutes = page.getByRole("spinbutton", { name: "Minuten" });
    await expect(minutes).toHaveAccessibleDescription(
      "1 tot en met 600 minuten.",
    );
    await minutes.fill("900");
    await page.keyboard.press("Enter");
    await expect(minutes).toHaveAttribute("aria-invalid", "true");
    await expect(minutes).toHaveAccessibleDescription(
      /Kies 1 tot en met 600 minuten/,
    );
    await minutes.fill("10");
    await expect(minutes).not.toHaveAttribute("aria-invalid", "true");
  });
});
