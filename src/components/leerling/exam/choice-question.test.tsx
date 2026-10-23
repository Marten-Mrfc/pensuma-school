import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { optionLetter } from "@/lib/questions/validate";
import { ChoiceQuestion } from "./choice-question";

describe("multiple-choice option letters (A32)", () => {
  test("options 27–30 get the same label as in the teacher's editor", () => {
    const options = Array.from({ length: 30 }, (_, i) => ({
      id: `o${i}`,
      text: `Optie ${i + 1}`,
    }));
    const html = renderToStaticMarkup(
      <ChoiceQuestion
        number={1}
        data={{ multiple: false, options }}
        selected={[]}
        onChange={() => {}}
      />,
    );
    const badges = [
      ...html.matchAll(
        /<span aria-hidden="true" class="grid size-8[^"]*">([^<]*)<\/span>/g,
      ),
    ].map((m) => m[1]);
    expect(badges).toHaveLength(30);
    expect(badges.every((b) => b !== "")).toBe(true);
    expect(badges.slice(0, 3)).toEqual(["A", "B", "C"]);
    expect(badges[25]).toBe("Z");
    expect(badges.slice(26)).toEqual(["27", "28", "29", "30"]);
    expect(badges).toEqual(options.map((_, i) => optionLetter(i)));
  });
});
