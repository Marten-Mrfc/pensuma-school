import { describe, expect, test } from "bun:test";
import { markdownExcerpt } from "./excerpt";

describe("markdownExcerpt", () => {
  test("strips markdown syntax", () => {
    expect(
      markdownExcerpt(
        "## Opdracht\n\nSchrijf een **functie** `gemiddelde(getallen)`.\n\n- Gebruik *return*\n> Tip: [lees dit](https://x.nl)",
      ),
    ).toBe(
      "Opdracht Schrijf een functie gemiddelde(getallen). Gebruik return Tip: lees dit",
    );
  });

  test("keeps code from fenced blocks and alt text from images", () => {
    expect(
      markdownExcerpt("```python\nprint(7 // 2)\n```\n![Een diagram](data:x)"),
    ).toBe("print(7 // 2) Een diagram");
  });

  test("tables become plain words", () => {
    expect(markdownExcerpt("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(
      "a b 1 2",
    );
  });

  test("cuts long text at a word boundary with an ellipsis", () => {
    const long = "woord ".repeat(60);
    const out = markdownExcerpt(long, 180);
    expect(out.length).toBeLessThanOrEqual(180);
    expect(out.endsWith("woord…")).toBe(true);
  });

  test("keeps snake_case names intact", () => {
    expect(markdownExcerpt("Maak tel_woorden en is_even.")).toBe(
      "Maak tel_woorden en is_even.",
    );
  });
});
