/**
 * @python: the browser runs Python (Pyodide from /pyodide/, self-hosted) and
 * shows the output. Uses the practice playground, so no attempt is created.
 */
import { expect, test } from "@playwright/test";
import { STUDENT_STATE } from "../support/env";

test.use({ storageState: STUDENT_STATE });

test("“Uitvoeren” runs the code and prints the output @python", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/leerling/oefenen");
  const editor = page.getByRole("textbox", {
    name: "Python-code om te oefenen",
  });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText('print("Hallo wereld!")\n');

  await page.getByRole("button", { name: "Uitvoeren" }).click();
  const output = page.getByRole("log", { name: "Uitvoer van je programma" });
  await expect(output).toContainText("Hallo wereld!", { timeout: 100_000 });
});
