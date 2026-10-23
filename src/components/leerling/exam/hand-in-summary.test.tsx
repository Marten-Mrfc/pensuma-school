import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HandInSummary,
  handInDescription,
  QuestionOverviewButton,
} from "./hand-in-summary";
import type { ExamQuestion } from "./types";

const questions = Array.from(
  { length: 12 },
  (_, i) =>
    ({ id: `q${i + 1}`, title: `Vraag titel ${i + 1}` }) as ExamQuestion,
);

/** Text as a screen reader gets it: tags dropped, entities decoded. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("hand-in dialog description (A10)", () => {
  test("the unanswered count is part of the dialog's description", () => {
    const text = textOf(
      renderToStaticMarkup(handInDescription({ unanswered: 11 })),
    );
    expect(text).toBe(
      "11 vragen zijn nog niet beantwoord. Na het inleveren kun je je antwoorden niet meer veranderen.",
    );
    expect(
      textOf(renderToStaticMarkup(handInDescription({ unanswered: 1 }))),
    ).toStartWith("1 vraag is nog niet beantwoord.");
  });

  test("refused answers come first; nothing extra when all is fine", () => {
    expect(
      textOf(
        renderToStaticMarkup(handInDescription({ unanswered: 2, rejected: 1 })),
      ),
    ).toBe(
      "1 antwoord is niet opgeslagen. 2 vragen zijn nog niet beantwoord. Na het inleveren kun je je antwoorden niet meer veranderen.",
    );
    expect(
      textOf(renderToStaticMarkup(handInDescription({ unanswered: 0 }))),
    ).toBe("Na het inleveren kun je je antwoorden niet meer veranderen.");
  });

  test("the counts are visually hidden (the body shows them already)", () => {
    const html = renderToStaticMarkup(handInDescription({ unanswered: 3 }));
    expect(html).toContain('<span class="sr-only">3 vragen');
  });
});

describe("hand-in dialog lists (A10, A24)", () => {
  const html = renderToStaticMarkup(
    <HandInSummary
      questions={questions}
      unanswered={questions.slice(1)}
      withTips={[questions[2] as ExamQuestion]}
      flagged={[questions[4] as ExamQuestion]}
      rejected={[questions[11] as ExamQuestion]}
      offline={false}
      onJump={() => {}}
    />,
  );

  test("each list of jump buttons is a group named by its heading", () => {
    const groups = [
      ...html.matchAll(/<fieldset aria-labelledby="([^"]+)"[^>]*>/g),
    ].map((m) => m[1]);
    expect(groups).toHaveLength(4);
    const headings = groups.map((id) => {
      const m = html.match(new RegExp(`<p id="${id}"[^>]*>(.*?)</p>`));
      return textOf(m?.[1] ?? "");
    });
    expect(headings).toEqual([
      "1 antwoord is niet opgeslagen:",
      "11 vragen zijn nog niet beantwoord:",
      "Misschien wil je dit nog nakijken:",
      "Gemarkeerd voor later:",
    ]);
  });

  test("jump buttons keep their names", () => {
    expect(html).toContain('aria-label="Naar vraag 12: Vraag titel 12"');
    expect(html).toContain('aria-label="Naar vraag 2: Vraag titel 2"');
  });

  test("all answered: no unanswered group", () => {
    const done = renderToStaticMarkup(
      <HandInSummary
        questions={questions}
        unanswered={[]}
        withTips={[]}
        flagged={[]}
        rejected={[]}
        offline={true}
        onJump={() => {}}
      />,
    );
    expect(done).not.toContain("<fieldset");
    expect(textOf(done)).toContain("Je hebt alle 12 vragen beantwoord.");
    expect(textOf(done)).toContain("je bent offline");
  });
});

describe("question overview button (A12)", () => {
  test("the visible '3/12' is part of the accessible name", () => {
    const html = renderToStaticMarkup(
      <QuestionOverviewButton index={2} total={12} onClick={() => {}} />,
    );
    // Name from content: no aria-label overriding it, nothing aria-hidden
    // except the icon.
    expect(html).not.toContain("aria-label=");
    expect(html).not.toMatch(/<span[^>]*aria-hidden="true"[^>]*>3\/12/);
    expect(textOf(html)).toBe("Vragenoverzicht, vraag 3/12");
    expect(html).toContain(">3/12</span>");
  });
});
