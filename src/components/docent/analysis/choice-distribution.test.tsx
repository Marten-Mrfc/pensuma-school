import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChoiceDistribution, choiceSummary } from "./choice-distribution";

const option = (
  id: string,
  text: string,
  count: number,
  percentage: number,
  correct = false,
) => ({ id, text, count, percentage, correct });

describe("choiceSummary (A38)", () => {
  test("nobody answered: no 'most chosen' option", () => {
    const summary = choiceSummary({
      answered: 0,
      options: [
        option("a", "`leeftijd`", 0, 0, true),
        option("b", "`2getal`", 0, 0),
      ],
    });
    expect(summary).toBe("Niemand heeft deze vraag beantwoord.");
    expect(summary).not.toContain("Meest gekozen");
  });

  test("no options at all", () => {
    expect(choiceSummary({ answered: 0, options: [] })).toBe(
      "Niemand heeft deze vraag beantwoord.",
    );
  });

  test("names the most chosen option once someone chose it", () => {
    expect(
      choiceSummary({
        answered: 4,
        options: [
          option("a", "`leeftijd`", 1, 0.25, true),
          option("b", "`2getal`", 3, 0.75),
        ],
      }),
    ).toBe("4 leerlingen antwoordden. Meest gekozen: 2getal (75%).");
    expect(
      choiceSummary({
        answered: 1,
        options: [option("a", "`leeftijd`", 1, 1, true)],
      }),
    ).toBe(
      "1 leerling antwoordde. Meest gekozen: leeftijd (100%), het juiste antwoord.",
    );
  });

  test("the card shows the sentence", () => {
    const html = renderToStaticMarkup(
      <ChoiceDistribution
        questions={[
          {
            questionId: "q7",
            number: 7,
            title: "Geldige variabelenamen",
            summary: {
              answered: 0,
              blank: 1,
              multiple: false,
              options: [option("a", "`leeftijd`", 0, 0, true)],
            },
          },
        ]}
      />,
    );
    expect(html).toContain("Niemand heeft deze vraag beantwoord.");
    expect(html).not.toContain("Meest gekozen");
  });
});
