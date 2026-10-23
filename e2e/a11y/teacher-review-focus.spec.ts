/**
 * Keyboard focus in the teacher's review screens (real browser, group U3a):
 * - Nakijken: after "Opslaan en volgende" (and Alt+↑/↓) focus lands on the
 *   next student's name instead of <body>; after the last one on "Klaar met
 *   deze vraag!" (WCAG 2.4.3).
 * - Resultaten: a focused score link or column header is never hidden under
 *   the sticky "Leerling" column, also at 320px wide (WCAG 2.4.11).
 * Two throwaway students hand in the practice afname; they are removed
 * afterwards.
 */
import { expect, type Page, test } from "@playwright/test";
import { waitForSettled } from "../helpers/a11y";
import {
  findAssignment,
  provisionStudent,
  removeStudent,
  studentApiFor,
  type TrpcApi,
  teacherApi,
} from "../helpers/trpc";
import { PRACTICE_AFNAME, TEACHER_STATE } from "../support/env";

test.use({ storageState: TEACHER_STATE });

// "Aa…" sorts before every seeded student: they are the first two answers.
const STUDENTS = [
  { number: "17111", name: "Aafke Focustest", pin: "314159" },
  { number: "17112", name: "Aaron Focustest", pin: "271828" },
] as const;

let api: TrpcApi;
let afnameId: string;
let openQuestionId: string;

test.beforeAll(async () => {
  api = await teacherApi();
  afnameId = (await findAssignment(api, PRACTICE_AFNAME)).id;
  const queue = await api.query<{ questions: { id: string; type: string }[] }>(
    "review.gradingQueue",
    { assignmentId: afnameId, includeGraded: true },
  );
  const open = queue.questions.find((q) => q.type === "open");
  if (!open) throw new Error("[e2e] the practice test has no open question");
  openQuestionId = open.id;
  for (const student of STUDENTS) {
    await provisionStudent(api, student);
    const s = await studentApiFor(student);
    const { attemptId } = await s.mutation<{ attemptId: string }>(
      "portal.startAttempt",
      { assignmentId: afnameId },
    );
    await s.mutation("portal.saveAnswer", {
      attemptId,
      questionId: openQuestionId,
      response: { text: `Uitleg van ${student.name}` },
    });
    await s.mutation("portal.submitAttempt", { attemptId });
    await s.dispose();
  }
});

test.afterAll(async () => {
  for (const student of STUDENTS) await removeStudent(api, student.number);
  await api.dispose();
});

const studentHeading = (page: Page) => page.locator("article h2").first();

test("Nakijken: focus follows the teacher from student to student", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    `/docent/afnames/${afnameId}/nakijken?vraag=${openQuestionId}`,
  );
  await expect(studentHeading(page)).toContainText(STUDENTS[0].name);

  await page.getByLabel(/^Punten voor vraag \d+/).fill("1");
  await page.getByRole("button", { name: "Opslaan en volgende" }).focus();
  await page.keyboard.press("Enter");
  await expect(studentHeading(page)).toContainText(STUDENTS[1].name);
  await expect(studentHeading(page)).toBeFocused();

  // The shortcuts keep working because focus stayed inside the panel.
  await page.keyboard.press("Alt+ArrowUp");
  await expect(studentHeading(page)).toContainText(STUDENTS[0].name);
  await expect(studentHeading(page)).toBeFocused();

  // Past the last answer: the "Klaar" panel takes focus.
  const done = page.getByRole("heading", { name: "Klaar met deze vraag!" });
  for (let i = 0; i < 100 && !(await done.isVisible()); i++) {
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.locator("h2:focus")).toHaveCount(1);
  }
  await expect(done).toBeFocused();
});

async function coveredMatrixFocus(page: Page, presses: number) {
  const problems: string[] = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press("Tab");
    const problem = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const region = el?.closest(
        '[aria-label="Resultaten per leerling en vraag"]',
      );
      if (!el || !region || el === region) return null;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return hit && (hit === el || el.contains(hit) || hit.contains(el))
        ? null
        : `"${(el.textContent ?? "").trim().slice(0, 30)}" covered by "${(hit?.textContent ?? "").trim().slice(0, 30)}"`;
    });
    if (problem) problems.push(problem);
  }
  return problems;
}

for (const width of [1280, 320]) {
  test(`Resultaten (${width}px): focus never hides under the sticky column`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/docent/afnames/${afnameId}/resultaten`);
    await waitForSettled(page);
    // Through the column headers …
    await page.getByRole("button", { name: /^Leerling/ }).focus();
    expect(await coveredMatrixFocus(page, 16)).toEqual([]);
    // … and from the far right ("Cijfer") into the next rows' score links.
    await page.getByRole("button", { name: /^Cijfer/ }).focus();
    expect(await coveredMatrixFocus(page, 30)).toEqual([]);
  });
}
