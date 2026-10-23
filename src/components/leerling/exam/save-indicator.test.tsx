import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionHeader } from "./question-view";
import { SaveIndicator } from "./save-indicator";
import type { ExamQuestion } from "./types";

describe("a refused answer is shown as such, not as 'Offline' (A24)", () => {
  test("the header indicator names the question", () => {
    const html = renderToStaticMarkup(
      <SaveIndicator
        snapshot={{
          state: "error",
          lastSavedAt: null,
          pendingCount: 0,
          rejected: ["q12"],
        }}
        rejectedLabel="vraag 12"
      />,
    );
    expect(html).toContain('title="Niet opgeslagen: vraag 12"');
    expect(html).not.toContain("Offline");
  });

  test("the question itself says why it was not saved", () => {
    const question = {
      id: "q12",
      type: "open",
      title: "Leg uit",
      points: 2,
    } as unknown as ExamQuestion;
    const message =
      "Je antwoord bij vraag 12 is te lang (maximaal 20.000 tekens) en is niet opgeslagen. Maak het korter.";
    const html = renderToStaticMarkup(
      <QuestionHeader
        question={question}
        number={12}
        total={12}
        headingId="h"
        flagged={false}
        onToggleFlag={() => {}}
        saveProblem={message}
      />,
    );
    expect(html).toContain(message);
    const clean = renderToStaticMarkup(
      <QuestionHeader
        question={question}
        number={12}
        total={12}
        headingId="h"
        flagged={false}
        onToggleFlag={() => {}}
      />,
    );
    expect(clean).not.toContain("niet opgeslagen");
  });
});
