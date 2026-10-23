import { describe, expect, test } from "bun:test";
import { isBlankResponse, scoreMultipleChoice } from "./scoring";

describe("isBlankResponse: code", () => {
  const starter = "def gemiddelde(getallen):\n    # jouw code hier\n    pass\n";

  test("empty and unchanged starter code are blank", () => {
    expect(isBlankResponse("code", { code: "" }, starter)).toBe(true);
    expect(isBlankResponse("code", { code: "  \n" }, starter)).toBe(true);
    expect(isBlankResponse("code", { code: starter }, starter)).toBe(true);
    expect(isBlankResponse("code", null, starter)).toBe(true);
  });

  // Regression (F28): "starter + `# geen idee`" used to be graded and earned
  // the check weight.
  test("starter code with only comments, blank lines or spacing added is blank", () => {
    expect(
      isBlankResponse("code", { code: `${starter}\n# geen idee\n` }, starter),
    ).toBe(true);
    expect(
      isBlankResponse(
        "code",
        {
          code: "# ik weet het niet\ndef gemiddelde( getallen ):\n\n    pass  # ?\n",
        },
        starter,
      ),
    ).toBe(true);
    expect(isBlankResponse("code", { code: "# geen idee\n" }, "")).toBe(true);
  });

  test("any real code change is an answer", () => {
    expect(
      isBlankResponse(
        "code",
        { code: "def gemiddelde(getallen):\n    return 0\n" },
        starter,
      ),
    ).toBe(false);
    expect(isBlankResponse("code", { code: "pass" }, "")).toBe(false);
    // Strings are content, even inside the starter structure.
    expect(isBlankResponse("code", { code: 'print("a")' }, 'print("b")')).toBe(
      false,
    );
    // Indentation structure is content.
    expect(
      isBlankResponse(
        "code",
        { code: "for i in range(3):\n    pass\nprint(i)" },
        "for i in range(3):\n    pass\n    print(i)",
      ),
    ).toBe(false);
  });
});

describe('scoreMultipleChoice: partial ("Per optie")', () => {
  // 3 correct (a, b, e), 2 wrong (c, d), like the demo question
  // "Geldige variabelenamen".
  const data = {
    multiple: true,
    scoring: "partial" as const,
    options: [
      { id: "a", text: "a", correct: true },
      { id: "b", text: "b", correct: true },
      { id: "c", text: "c", correct: false },
      { id: "d", text: "d", correct: false },
      { id: "e", text: "e", correct: true },
    ],
  };

  // Regression (F41): the editor text must describe this formula:
  // (right ticks − wrong ticks) / number of correct options, never below 0.
  test("each right tick earns 1/C, each wrong tick costs 1/C", () => {
    expect(scoreMultipleChoice(data, ["a"]).fraction).toBeCloseTo(1 / 3);
    expect(scoreMultipleChoice(data, ["a", "b", "c"]).fraction).toBeCloseTo(
      1 / 3,
    );
    expect(scoreMultipleChoice(data, []).fraction).toBe(0);
    expect(scoreMultipleChoice(data, ["c", "d"]).fraction).toBe(0);
  });

  test("ticking every option scores (C − W) / C", () => {
    expect(
      scoreMultipleChoice(data, ["a", "b", "c", "d", "e"]).fraction,
    ).toBeCloseTo((3 - 2) / 3);
  });
});
