/**
 * Question editors (test builder):
 * - A13: errors and warnings in the question list differ in shape, drawn
 *   in the contrast-safe "-ink" tones;
 * - A08/A31: the "Verwachte uitvoer invullen met modeloplossing" button
 *   wraps instead of overflowing the card at 320–390 px;
 * - A35: the editors tell the truth about what students see;
 * - A06: deleting a test case no longer depends on a 4-second toast.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultSettingsForMode } from "@/components/docent/assignments/defaults";
import type { QuestionIssue } from "@/lib/questions/validate";
import { createRenderer, tagsMatching, textOf } from "../a11y/render-for-test";
import { IssueDot, IssueIcon, issueCountLabel } from "./issue-list";
import { TestCaseEditor } from "./test-case-editor";
import {
  CODE_QUESTION_VISIBILITY_NOTE,
  OPEN_QUESTION_VISIBILITY_NOTE,
} from "./visibility-notes";

const issue = (severity: QuestionIssue["severity"]): QuestionIssue => ({
  severity,
  code: `x.${severity}`,
  message: severity === "error" ? "geen tests" : "geen naam",
});

describe("IssueDot (A13)", () => {
  test("errors and warnings have a different icon, not only a colour", () => {
    const error = renderToStaticMarkup(<IssueDot issues={[issue("error")]} />);
    const warning = renderToStaticMarkup(
      <IssueDot issues={[issue("warning")]} />,
    );
    expect(error).toContain("lucide-circle-alert");
    expect(warning).toContain("lucide-triangle-alert");
    expect(warning).not.toContain("lucide-circle-alert");
  });

  test("drawn in the -ink tones (3:1 on cards), never the light amber dot", () => {
    const warning = renderToStaticMarkup(
      <IssueDot issues={[issue("warning")]} />,
    );
    const error = renderToStaticMarkup(<IssueDot issues={[issue("error")]} />);
    expect(warning).toContain("text-warning-ink");
    expect(error).toContain("text-destructive-ink");
    expect(warning).not.toContain("bg-warning");
  });

  test("keeps an accessible name with the count", () => {
    const html = renderToStaticMarkup(
      <IssueDot issues={[issue("error"), issue("warning")]} />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="2 problemen"');
    expect(issueCountLabel([issue("warning")])).toBe("1 aandachtspunt");
    expect(renderToStaticMarkup(<IssueDot issues={[]} />)).toBe("");
    expect(
      renderToStaticMarkup(<IssueIcon severity="error" label="Probleem" />),
    ).toContain('aria-label="Probleem"');
  });
});

describe("TestCaseEditor fill button (A08, A31)", () => {
  test("the long label may wrap and its wrapper may shrink", () => {
    const { render } = createRenderer();
    const html = render(
      <TestCaseEditor
        tests={[]}
        onChange={() => {}}
        solution={'print("hoi")'}
        timeLimitMs={2000}
        issues={[]}
      />,
    );
    const [button] = tagsMatching(html, /<button[^>]*whitespace-normal/);
    expect(button).toBeDefined();
    expect(button).toContain("h-auto");
    expect(button).toContain("max-w-full");
    expect(textOf(html)).toContain(
      "Verwachte uitvoer invullen met modeloplossing",
    );
    const wrapper = tagsMatching(html, /class="[^"]*ml-auto/)[0] ?? "";
    expect(wrapper).toContain("min-w-0");
    expect(wrapper).toContain("max-w-full");
  });
});

describe("TestCaseEditor delete (A06)", () => {
  const source = readFileSync(
    path.join(import.meta.dir, "test-case-editor.tsx"),
    "utf8",
  );
  const removeFn = source.slice(
    source.indexOf("function remove("),
    source.indexOf("function undoRemove("),
  );

  test("undo is an inline button, not a timed toast action", () => {
    expect(removeFn).not.toContain("toast(");
    expect(removeFn).toContain("setLastRemoved");
    expect(source).toContain("Ongedaan maken");
  });
});

describe("visibility notes (A35)", () => {
  test("no promise that students never see the answers", () => {
    for (const note of [
      OPEN_QUESTION_VISIBILITY_NOTE,
      CODE_QUESTION_VISIBILITY_NOTE,
    ]) {
      expect(note).not.toMatch(/nooit te zien|zien ze nooit/);
    }
  });

  test("the model solution: as the afname setting says, never in a Toets", () => {
    // The defaults the notes describe.
    expect(defaultSettingsForMode("practice").showSolutions).toBe(
      "after_attempts",
    );
    expect(defaultSettingsForMode("exam").showSolutions).toBe("never");
    expect(CODE_QUESTION_VISIBILITY_NOTE).toContain("‘Modeloplossing tonen’");
    expect(CODE_QUESTION_VISIBILITY_NOTE).toContain(
      "standaard bij Oefenen na de laatste poging, nooit bij een Toets",
    );
    expect(OPEN_QUESTION_VISIBILITY_NOTE).toContain(
      "Het modelantwoord ziet de leerling alleen als de afname modeloplossingen toont",
    );
  });

  test("criteria are shown with the result; the grading notes are not", () => {
    expect(OPEN_QUESTION_VISIBILITY_NOTE).toContain(
      "ziet de leerling ze bij het resultaat, met per criterium behaald of niet behaald",
    );
    expect(OPEN_QUESTION_VISIBILITY_NOTE).toContain(
      "De toelichting voor het nakijken zien alleen docenten",
    );
  });
});
