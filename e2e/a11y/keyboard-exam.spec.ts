/**
 * The exam with the keyboard only, plus the screen-reader announcements of
 * autosave and the countdown (WCAG 2.1.1, 2.1.2, 2.4.3, 2.2.1, 4.1.3).
 */
import { expect, test } from "@playwright/test";
import {
  focused,
  liveLog,
  recordLiveRegions,
  tabTo,
} from "../helpers/keyboard";
import {
  findDemoClass,
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
import { PRACTICE_AFNAME } from "../support/env";
import { expectAllSaved } from "../support/exam";
import { loginAsStudent } from "../support/login";

let api: TrpcApi;
let world: DemoWorld;
const student = {
  number: throwawayNumber("5"),
  name: "Kim Toetsenbord",
  pin: "864208",
};
let studentId: string;

test.beforeAll(async () => {
  api = await teacherApi();
  world = await loadDemoWorld(api);
  studentId = await provisionStudent(api, student);
});

test.afterAll(async () => {
  await removeStudent(api, student.number);
  await api.dispose();
});

test("a practice afname with Tab and Enter only", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsStudent(page, student.number, student.pin);

  // Dashboard → "Starten" on the practice card → "Start toets".
  await tabTo(
    page,
    (f) =>
      f.tag === "a" &&
      /Starten/.test(f.name) &&
      (f.href ?? "").includes(world.practiceId),
    { max: 80 },
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: PRACTICE_AFNAME }),
  ).toBeVisible();
  await tabTo(page, (f) => f.name === "Start toets", { max: 60 });
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/leerling\/poging\//);
  await expect(page).toHaveTitle(/Vraag 1 van 12/);

  // The code editor: Escape (or Ctrl+M) then Tab leaves it.
  await tabTo(page, (f) => f.inEditor, { max: 60 });
  await recordLiveRegions(page);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText('print("Hallo wereld!")\n');
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  expect((await focused(page)).inEditor).toBe(false);
  await tabTo(page, (f) => f.inEditor, { max: 60, shift: true });
  await page.keyboard.press("Control+m");
  await page.keyboard.press("Tab");
  expect((await focused(page)).inEditor).toBe(false);

  // Autosave stays silent for screen readers.
  await expectAllSaved(page);
  await page.waitForTimeout(1_500);
  const log = await liveLog(page);
  expect(log.polite.filter((t) => /Opgeslagen/.test(t))).toEqual([]);

  // The question navigator moves focus to the new question's heading.
  await tabTo(page, (f) => /^Vraag 2, /.test(f.name), { max: 80 });
  await page.keyboard.press("Enter");
  const heading2 = page.getByRole("heading", {
    level: 2,
    name: /Vraag 2 van 12/,
  });
  await expect(heading2).toBeFocused();
  await expect(page).toHaveTitle(/Vraag 2 van 12/);

  // The submit dialog traps focus; Escape returns it to "Inleveren".
  const submit = page.getByRole("button", { name: "Inleveren" }).first();
  await submit.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Toets inleveren?" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    expect((await focused(page)).inDialog).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Soft: report a lost focus but still finish the hand-in below.
  await expect.soft(submit).toBeFocused({ timeout: 2_000 });
  await submit.focus();

  // Hand in with the keyboard.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Inleveren" });
  if (!(await confirm.evaluate((el) => el === document.activeElement))) {
    await tabTo(page, (f) => f.inDialog && f.name === "Inleveren", {
      max: 40,
    });
  }
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/leerling\/resultaten\//, { timeout: 30_000 });
});

test("the countdown announces 10, 5 and 1 minute and the end", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const klas = await findDemoClass(api);
  const timed = await api.mutation<{ id: string }>("assignment.create", {
    testId: world.testId,
    classId: klas.id,
    studentIds: [studentId],
    title: `E2E-timer ${student.number}`,
    mode: "practice",
    timeLimitMinutes: 12,
    openNow: true,
  });
  try {
    const studentClient = await studentApiFor(student);
    const { attemptId } = await studentClient.mutation<{ attemptId: string }>(
      "portal.startAttempt",
      { assignmentId: timed.id },
    );
    await studentClient.dispose();

    // The heartbeat re-syncs with the real server clock, which would undo
    // the fake clock below: keep it offline for this test.
    await page.route(/\/api\/trpc\/[^?]*portal\.heartbeat/, (route) =>
      route.abort(),
    );
    await page.clock.install({ time: new Date() });
    await loginAsStudent(page, student.number, student.pin);
    await page.goto(`/leerling/poging/${attemptId}`);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    await recordLiveRegions(page);

    const announcedAfter = async (mmss: string) => {
      await page.clock.fastForward(mmss);
      await page.clock.runFor(2_000);
      return liveLog(page);
    };
    await announcedAfter("02:05");
    await announcedAfter("05:00");
    await announcedAfter("04:00");
    const log = await announcedAfter("01:00");

    const count = (text: string) => log.polite.filter((t) => t === text).length;
    expect(count("Let op: je hebt nog 10 minuten.")).toBe(1);
    expect(count("Let op: je hebt nog 5 minuten.")).toBe(1);
    expect(count("Let op: je hebt nog 1 minuut.")).toBe(1);
    expect(log.assertive.some((t) => t.startsWith("De tijd is om."))).toBe(
      true,
    );
  } finally {
    await api.mutation("assignment.delete", { id: timed.id });
  }
});
