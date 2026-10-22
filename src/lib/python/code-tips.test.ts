import { describe, expect, test } from "bun:test";
import { EXAMPLE_TESTS } from "@/lib/questions/examples";
import {
  type CodeQuestionData,
  codeQuestionDataSchema,
  questionDataForStudent,
  type StudentCodeQuestionData,
} from "@/lib/questions/schema";
import { DEMO_QUESTIONS } from "@/server/demo/questions";
import {
  type CodeTipId,
  type CodeTipOptions,
  countWarnings,
  getCodeTips,
  levenshtein,
} from "./code-tips";

const ids = (code: string, options?: CodeTipOptions) =>
  getCodeTips(code, options).map((t) => t.id);
const has = (code: string, id: CodeTipId, options?: CodeTipOptions) =>
  ids(code, options).includes(id);
const tip = (code: string, id: CodeTipId, options?: CodeTipOptions) =>
  getCodeTips(code, options).find((t) => t.id === id);

describe("unchanged", () => {
  const starterCode = "def dubbel(x):\n    pass\n";

  test("warns when the starter code is untouched", () => {
    const tips = getCodeTips("def dubbel(x):\n    pass\n\n", {
      starterCode,
      functionNames: ["dubbel"],
    });
    expect(tips).toHaveLength(1);
    expect(tips[0]).toMatchObject({
      id: "unchanged",
      severity: "warning",
      message: "Je hebt de startcode nog niet aangepast.",
    });
  });

  test("says nothing once the code changed", () => {
    expect(
      has("def dubbel(x):\n    return 2 * x\n", "unchanged", {
        starterCode,
      }),
    ).toBe(false);
  });

  test("blank code gives no tips", () => {
    expect(getCodeTips("   \n", { hasIoTests: true })).toEqual([]);
  });
});

describe("missing_function", () => {
  test("suggests a close match (case or spelling)", () => {
    const t = tip(
      "def Gemiddelde(lijst):\n    return 1\n",
      "missing_function",
      {
        functionNames: ["gemiddelde"],
      },
    );
    expect(t?.message).toBe(
      "De opdracht vraagt om een functie `gemiddelde`, maar jouw functie heet `Gemiddelde`. Let op hoofdletters en spelling.",
    );
    expect(t?.line).toBe(1);
    expect(
      tip("def gemidelde(l):\n    return 1\n", "missing_function", {
        functionNames: ["gemiddelde"],
      })?.message,
    ).toContain("jouw functie heet `gemidelde`");
  });

  test("without a close match: the function is missing", () => {
    expect(
      tip("def iets_anders(x):\n    return x\n", "missing_function", {
        functionNames: ["gemiddelde"],
      })?.message,
    ).toBe(
      "De opdracht vraagt om een functie `gemiddelde`, maar die staat niet in je code.",
    );
  });

  test("no tip when the function exists", () => {
    expect(
      has(
        "def gemiddelde(l):\n    return sum(l) / len(l)\n",
        "missing_function",
        {
          functionNames: ["gemiddelde"],
        },
      ),
    ).toBe(false);
    expect(
      has("gemiddelde = lambda l: sum(l) / len(l)\n", "missing_function", {
        functionNames: ["gemiddelde"],
      }),
    ).toBe(false);
  });

  test("a nested function does not count", () => {
    expect(
      has(
        "def buiten():\n    def gemiddelde(l):\n        return 1\n    return gemiddelde\n",
        "missing_function",
        { functionNames: ["gemiddelde"] },
      ),
    ).toBe(true);
  });
});

describe("print_instead_of_return", () => {
  const options = { functionNames: ["dubbel"] };

  test("warns when the function prints but returns nothing", () => {
    const t = tip(
      "def dubbel(x):\n    print(x * 2)\n",
      "print_instead_of_return",
      options,
    );
    expect(t?.message).toBe(
      "Je functie `dubbel` print het antwoord, maar geeft het niet terug met `return`. De test kijkt naar wat de functie teruggeeft.",
    );
    expect(t?.line).toBe(1);
  });

  test("no tip when it returns a value", () => {
    expect(
      has(
        "def dubbel(x):\n    print('bezig')\n    return x * 2\n",
        "print_instead_of_return",
        options,
      ),
    ).toBe(false);
  });

  test("print( inside an f-string is not a print call", () => {
    expect(
      has(
        'def dubbel(x):\n    tekst = f"print({x})"\n    return tekst\n',
        "print_instead_of_return",
        options,
      ),
    ).toBe(false);
    expect(has('print(f"print(1)")\n', "no_output", { hasIoTests: true })).toBe(
      false,
    );
  });

  test("nested defs: a return in a helper doesn't count for the outer function", () => {
    expect(
      has(
        "def dubbel(x):\n    def hulp(y):\n        return y * 2\n    print(hulp(x))\n",
        "print_instead_of_return",
        options,
      ),
    ).toBe(true);
  });

  test("nested defs: a print in a helper doesn't count either", () => {
    expect(
      has(
        "def dubbel(x):\n    def log(y):\n        print(y)\n    log(x)\n    return x * 2\n",
        "print_instead_of_return",
        options,
      ),
    ).toBe(false);
  });

  test("only for functions the tests call", () => {
    expect(
      has("def toon(x):\n    print(x)\n", "print_instead_of_return", options),
    ).toBe(false);
  });
});

describe("no_output", () => {
  test("warns when a program checked on output prints nothing", () => {
    expect(
      tip("x = 5\ny = x * 2\n", "no_output", { hasIoTests: true })?.message,
    ).toBe(
      "Je programma print niets. De tests kijken naar wat je programma print.",
    );
  });

  test("no tip with a print, or without output tests", () => {
    expect(has("print(5)\n", "no_output", { hasIoTests: true })).toBe(false);
    expect(has("x = 5\n", "no_output", { hasIoTests: false })).toBe(false);
  });
});

describe("input_not_stored", () => {
  test("warns about an input() whose answer is thrown away", () => {
    const t = tip(
      'input("Wat is je naam? ")\nprint("Hallo")\n',
      "input_not_stored",
    );
    expect(t?.message).toBe(
      "Op regel 1 vraag je om invoer, maar je bewaart het antwoord niet in een variabele.",
    );
    expect(t?.line).toBe(1);
  });

  test("no tip when the answer is stored or used", () => {
    expect(has('naam = input("Naam? ")\n', "input_not_stored")).toBe(false);
    expect(has('print("Hoi " + input("Naam? "))\n', "input_not_stored")).toBe(
      false,
    );
    expect(has('x = int(input("Getal? "))\n', "input_not_stored")).toBe(false);
  });
});

describe("input_text_math", () => {
  test("hints that input() gives text when calculating", () => {
    const t = tip(
      'leeftijd = input("Hoe oud? ")\nif leeftijd >= 18:\n    print("ok")\n',
      "input_text_math",
    );
    expect(t?.severity).toBe("info");
    expect(t?.line).toBe(2);
    expect(t?.message).toBe(
      "Op regel 2 reken of vergelijk je met `leeftijd`, maar `input()` geeft altijd tekst. Gebruik `int(input(...))` of `float(input(...))`.",
    );
    expect(has("x = input().strip()\nprint(x + 1)\n", "input_text_math")).toBe(
      true,
    );
    expect(has("x = input()\nx += 1\n", "input_text_math")).toBe(true);
  });

  test("no tip for text use, converted values or comparisons with text", () => {
    expect(
      has('naam = input()\nprint("Hallo " + naam)\n', "input_text_math"),
    ).toBe(false);
    expect(has("x = int(input())\nprint(x + 1)\n", "input_text_math")).toBe(
      false,
    );
    expect(
      has("x = input()\nx = int(x)\nprint(x + 1)\n", "input_text_math"),
    ).toBe(false);
    expect(
      has(
        'x = input()\nwhile x != "stop":\n    x = input()\n',
        "input_text_math",
      ),
    ).toBe(false);
    expect(has("x = input()\nprint(int(x) + 1)\n", "input_text_math")).toBe(
      false,
    );
  });

  test("is not a warning", () => {
    expect(
      countWarnings(
        getCodeTips("x = input()\nprint(x * 2)\n", { hasIoTests: true }),
      ),
    ).toBe(0);
  });
});

describe("while_true_no_break", () => {
  test("warns about an endless loop", () => {
    const t = tip('while True:\n    print("hoi")\n', "while_true_no_break");
    expect(t?.message).toBe(
      "Je `while True`-lus heeft geen `break`. Stopt je programma wel?",
    );
    expect(t?.line).toBe(1);
  });

  test("a break in a nested loop doesn't end the outer loop", () => {
    expect(
      has(
        "while True:\n    for i in range(3):\n        break\n",
        "while_true_no_break",
      ),
    ).toBe(true);
  });

  test("no tip with a break, return or exit", () => {
    expect(
      has(
        'while True:\n    x = input()\n    if x == "stop":\n        break\n',
        "while_true_no_break",
      ),
    ).toBe(false);
    expect(
      has(
        "def f():\n    while True:\n        return 1\n",
        "while_true_no_break",
      ),
    ).toBe(false);
    expect(has("while True: break\n", "while_true_no_break")).toBe(false);
    expect(has("while x < 3:\n    x += 1\n", "while_true_no_break")).toBe(
      false,
    );
  });
});

describe("def_not_called", () => {
  test("warns when a program never calls its function", () => {
    const t = tip('def begroet():\n    print("Hallo")\n', "def_not_called", {
      hasIoTests: true,
    });
    expect(t?.message).toBe(
      "Je maakt de functie `begroet`, maar roept hem nergens aan. Dan wordt hij niet uitgevoerd.",
    );
  });

  test("no tip when it is called, or for function tests", () => {
    expect(
      has(
        'def begroet():\n    print("Hallo")\n\nbegroet()\n',
        "def_not_called",
        {
          hasIoTests: true,
        },
      ),
    ).toBe(false);
    expect(
      has("def dubbel(x):\n    return 2 * x\n", "def_not_called", {
        functionNames: ["dubbel"],
      }),
    ).toBe(false);
  });

  test("a recursive call inside itself doesn't count", () => {
    expect(
      has(
        "def tel(n):\n    if n > 0:\n        print(n)\n        tel(n - 1)\n",
        "def_not_called",
        { hasIoTests: true },
      ),
    ).toBe(true);
  });
});

describe("mixed_indent", () => {
  test("warns about tabs and spaces", () => {
    expect(
      tip("if True:\n\tprint(1)\nif True:\n    print(2)\n", "mixed_indent")
        ?.message,
    ).toBe(
      "Je springt in met tabs én spaties door elkaar. Dat geeft in Python vaak fouten.",
    );
  });

  test("no tip with spaces only", () => {
    expect(has("if True:\n    print(1)\n", "mixed_indent")).toBe(false);
  });
});

describe("levenshtein", () => {
  test("counts edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "ab")).toBe(2);
  });
});

/* ---------------------------- Model solutions ---------------------------- */

function optionsFor(data: CodeQuestionData): CodeTipOptions {
  const student = questionDataForStudent({
    type: "code",
    data,
  }) as StudentCodeQuestionData;
  return {
    starterCode: student.starterCode,
    functionNames: student.functionNames,
    hasIoTests: student.hasIoTests,
  };
}

describe("model solutions", () => {
  test("the demo solutions get no warnings", () => {
    const code = DEMO_QUESTIONS.filter((q) => q.type === "code");
    expect(code.length).toBeGreaterThan(5);
    for (const q of code) {
      const data = codeQuestionDataSchema.parse(q.data);
      const warnings = getCodeTips(data.solution, optionsFor(data)).filter(
        (t) => t.severity === "warning",
      );
      expect({ title: q.title, warnings }).toEqual({
        title: q.title,
        warnings: [],
      });
    }
  });

  test("the example tests' solutions get no warnings", () => {
    for (const example of EXAMPLE_TESTS) {
      for (const q of example.test.questions) {
        if (q.type !== "code") continue;
        const data = codeQuestionDataSchema.parse(q.data);
        if (!data.solution.trim()) continue;
        const warnings = getCodeTips(data.solution, optionsFor(data)).filter(
          (t) => t.severity === "warning",
        );
        expect({ title: q.title, warnings }).toEqual({
          title: q.title,
          warnings: [],
        });
      }
    }
  });
});
