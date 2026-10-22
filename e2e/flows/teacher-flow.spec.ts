/**
 * A teacher's whole cycle, with a student in a second browser context:
 * build a test → publish → open an exam afname with an access code → the
 * student takes it → the monitor shows the hand-in → grade an open answer
 * with feedback → release results → the student sees score and feedback.
 */
import { expect, type Page, test } from "@playwright/test";
import {
  findAssignment,
  findTest,
  provisionStudent,
  removeStudent,
  type TrpcApi,
  teacherApi,
} from "../helpers/trpc";
import { DEMO_CLASS, E2E_STUDENTS, TEACHER_STATE } from "../support/env";
import {
  expectAllSaved,
  goToQuestion,
  replaceCode,
  submitAttempt,
} from "../support/exam";
import { loginAsStudent } from "../support/login";

test.use({ storageState: TEACHER_STATE });

const stamp = Date.now().toString(36).slice(-5).toUpperCase();
const TEST_TITLE = `E2E-toets ${stamp}`;
const AFNAME_TITLE = `E2E-afname ${stamp}`;
const ACCESS_CODE = `PY${stamp}`;
const FEEDBACK = "Goed uitgelegd! Noem de volgende keer ook een voorbeeld.";
const student = {
  ...E2E_STUDENTS.exam,
  number: `${E2E_STUDENTS.exam.number}${stamp.length}`,
};

let api: TrpcApi;

test.beforeAll(async () => {
  api = await teacherApi();
  await provisionStudent(api, student);
});

test.afterAll(async () => {
  // The afname first (its attempts block deleting the test).
  const afname = await findAssignment(api, AFNAME_TITLE).catch(() => null);
  if (afname) await api.mutation("assignment.delete", { id: afname.id });
  const created = await findTest(api, TEST_TITLE).catch(() => null);
  if (created) await api.mutation("test.delete", { id: created.id });
  await removeStudent(api, student.number);
  await api.dispose();
});

async function addQuestion(page: Page, template: RegExp) {
  await page.getByRole("button", { name: "Vraag toevoegen" }).first().click();
  await page.getByRole("menuitem", { name: template }).click();
}

test("build, publish, plan, take, grade and release an exam", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);

  // 1. A new test with a code question and an open question.
  await page.goto("/docent/toetsen");
  await page.getByRole("button", { name: "Nieuwe toets" }).first().click();
  const newTest = page.getByRole("dialog", { name: "Nieuwe toets" });
  await newTest.getByLabel("Titel").fill(TEST_TITLE);
  await newTest.getByRole("button", { name: "Aanmaken" }).click();
  await page.waitForURL(/\/docent\/toetsen\/[0-9a-f-]{36}/);

  await addQuestion(page, /^Print-opdracht/);
  const questionList = page.getByRole("complementary", { name: "Vragenlijst" });
  await expect(questionList).toContainText("Print een zin");
  await addQuestion(page, /^Open vraag/);
  await expect(questionList).toContainText("Open vraag");

  // 2. Publish (the unchecked model solution is only a warning).
  await page.getByRole("button", { name: /^Publiceren/ }).click();
  const publish = page.getByRole("dialog", {
    name: "Wil je de toets toch publiceren?",
  });
  const planLink = page.getByRole("link", { name: "Afname plannen" });
  await expect(publish.or(planLink).first()).toBeVisible();
  if (await publish.isVisible()) {
    await publish.getByRole("button", { name: "Toch publiceren" }).click();
  }
  await expect(planLink).toBeVisible();

  // 3. Plan an exam afname for the demo class, open now, own access code.
  await planLink.click();
  await page.waitForURL(/\/docent\/afnames\/nieuw/);
  await page
    .getByRole("checkbox", { name: new RegExp(escape(DEMO_CLASS)) })
    .check();
  await page.getByLabel("Titel (optioneel)").fill(AFNAME_TITLE);
  await page
    .getByRole("radiogroup", { name: "Modus" })
    .getByRole("radio", { name: /^Toets/ })
    .click();
  await page.getByRole("radio", { name: /^Nu openen/ }).click();
  await page
    .getByRole("radiogroup", { name: "Toegangscode" })
    .getByRole("radio", { name: /^Zelf kiezen/ })
    .click();
  await page.getByLabel("Jouw code").fill(ACCESS_CODE);
  await page.getByRole("button", { name: "Afname openen" }).click();
  await page.waitForURL(/\/docent\/afnames\/[0-9a-f-]{36}$/);
  const monitorUrl = page.url();

  // 4. The student starts with the code, answers and hands in.
  const studentContext = await browser.newContext();
  const sp = await studentContext.newPage();
  await loginAsStudent(sp, student.number, student.pin);
  const card = sp
    .getByRole("article")
    .filter({ has: sp.getByRole("heading", { name: AFNAME_TITLE }) });
  await card.getByRole("link", { name: /Starten/ }).click();
  await sp.getByLabel("Toegangscode").fill(ACCESS_CODE.toLowerCase());
  await sp.getByRole("button", { name: "Start toets" }).click();
  await sp.waitForURL(/\/leerling\/poging\//);
  await goToQuestion(sp, "Print een zin");
  await replaceCode(sp, 'print("Ik leer Python!")\n');
  await goToQuestion(sp, "Open vraag");
  await sp
    .getByLabel("Jouw antwoord")
    .fill("Een variabele bewaart een waarde onder een naam, zoals x = 5.");
  await expectAllSaved(sp);
  await submitAttempt(sp);
  await expect(
    sp.getByText("Je ziet je resultaat zodra je docent de toets sluit."),
  ).toBeVisible();

  // 5. The monitor shows the hand-in.
  await page.goto(monitorUrl);
  const row = page.getByRole("row").filter({ hasText: student.name });
  await expect
    .poll(async () => (await row.first().textContent()) ?? "", {
      timeout: 60_000,
    })
    .toContain("Ingeleverd");

  // 6. Grade the open answer with feedback.
  await page.goto(`${monitorUrl}/nakijken`);
  await expect(
    page.getByLabel(
      /^Punten voor vraag \d+ \(maximaal 2\)$|^Punten \(maximaal 2\)$/,
    ),
  ).toBeVisible({ timeout: 60_000 });
  await page
    .getByRole("group", { name: "Snelle score" })
    .getByRole("button", { name: "1,5", exact: true })
    .click();
  const addFeedback = page.getByRole("button", { name: "Feedback toevoegen" });
  if (await addFeedback.isVisible()) await addFeedback.click();
  await page.getByLabel("Feedback voor de leerling").fill(FEEDBACK);
  await page
    .getByRole("button", { name: /^Opslaan/ })
    .first()
    .click();
  // Code question 1 (graded by the server) + the manual 1,5.
  const afname = await findAssignment(api, AFNAME_TITLE);
  await expect
    .poll(
      async () => {
        const results = await api.query<{
          rows: {
            student: { name: string };
            attempt: { score: number | null; gradingStatus: string } | null;
          }[];
        }>("review.results", { assignmentId: afname.id });
        const mine = results.rows.find((r) => r.student.name === student.name);
        return mine?.attempt
          ? `${mine.attempt.gradingStatus} ${mine.attempt.score}`
          : "";
      },
      { timeout: 60_000 },
    )
    .toBe("graded 2.5");

  // 7. Release the results.
  await page.goto(`${monitorUrl}/resultaten`);
  await page.getByRole("button", { name: "Resultaten vrijgeven" }).click();
  await expect(
    page.getByRole("button", { name: "Vrijgave intrekken" }),
  ).toBeVisible();

  // 8. The student sees score and feedback.
  await sp.reload();
  await expect(
    sp.getByRole("button", { name: /Open vraag/ }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await sp
    .getByRole("button", { name: /Open vraag/ })
    .first()
    .click();
  await expect(sp.getByText(FEEDBACK)).toBeVisible();
  await expect(
    sp.getByRole("button", { name: /^Goed\b.*Print een zin/ }),
  ).toBeVisible({ timeout: 60_000 });
  await studentContext.close();
});

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
