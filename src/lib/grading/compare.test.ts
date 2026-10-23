import { describe, expect, test } from "bun:test";
import type { OutputMatchMode } from "@/lib/questions/schema";
import {
  compareOutput,
  compareValues,
  extractNumbers,
  normalizeLines,
} from "./compare";
import { parsePythonLiteral } from "./pyvalue";

function cmp(
  actual: string,
  expected: string,
  match: OutputMatchMode,
  ignoreCase = true,
  tolerance = 0.01,
) {
  return compareOutput(actual, expected, { match, ignoreCase, tolerance });
}

/** Flexible comparison of one test of a question (stdin + the other tests' expected outputs). */
function flex(
  actual: string,
  expected: string,
  { stdin, siblings }: { stdin?: string; siblings?: string[] } = {},
) {
  return compareOutput(actual, expected, {
    match: "flexible",
    ignoreCase: true,
    tolerance: 0.01,
    stdin,
    siblings,
  });
}

const upTo = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("normalizeLines", () => {
  test("CRLF, trailing whitespace and trailing empty lines", () => {
    expect(normalizeLines("a  \r\nb\t\n\n\n")).toEqual(["a", "b"]);
    expect(normalizeLines("")).toEqual([]);
    expect(normalizeLines("\nx")).toEqual(["", "x"]);
  });
});

describe("exact", () => {
  test("passes on identical output, ignoring trailing whitespace/newlines", () => {
    expect(cmp("Hallo Mark\n", "Hallo Mark", "exact").passed).toBe(true);
    expect(cmp("Hallo Mark   \n\n", "Hallo Mark", "exact").passed).toBe(true);
    expect(cmp("a\r\nb\r\n", "a\nb", "exact").passed).toBe(true);
  });

  test("ignoreCase", () => {
    expect(cmp("hallo mark", "Hallo Mark", "exact", true).passed).toBe(true);
    expect(cmp("hallo mark", "Hallo Mark", "exact", false).passed).toBe(false);
  });

  test("feedback names the first differing line", () => {
    const r = cmp("Hoi\nHallo mark!\n", "Hoi\nHallo Mark", "exact", false);
    expect(r.passed).toBe(false);
    expect(r.feedback).toBe(
      "Regel 2: verwacht `Hallo Mark`, maar je programma printte `Hallo mark!`.",
    );
  });

  test("hints about spaces and case", () => {
    expect(cmp("Hallo  Mark", "Hallo Mark", "exact").feedback).toContain(
      "Let op de spaties",
    );
    expect(cmp("hallo Mark", "Hallo Mark", "exact", false).feedback).toContain(
      "hoofdletters",
    );
  });

  test("missing / extra lines and empty output", () => {
    expect(cmp("a", "a\nb", "exact").feedback).toContain(
      "Regel 2 ontbreekt: `b`",
    );
    expect(cmp("a\nb\nc", "a\nb", "exact").feedback).toContain(
      "Extra regel 3: `c`",
    );
    expect(cmp("", "a", "exact").feedback).toContain(
      "Je programma printte niets",
    );
  });

  test("leading empty line matters in exact mode", () => {
    expect(cmp("\nHallo", "Hallo", "exact").passed).toBe(false);
  });
});

describe("flexible", () => {
  test("core case: prompt is never in stdout, so Hallo Mark passes", () => {
    expect(cmp("Hallo Mark\n", "Hallo Mark", "flexible").passed).toBe(true);
  });

  test("case, spacing and punctuation don't matter", () => {
    expect(cmp("HALLO    mark", "Hallo Mark", "flexible").passed).toBe(true);
    expect(cmp("Hallo, Mark!", "Hallo Mark", "flexible").passed).toBe(true);
    expect(cmp("  Hallo Mark  ", "Hallo Mark", "flexible").passed).toBe(true);
  });

  test("ignoreCase=false makes it case-sensitive", () => {
    expect(cmp("hallo mark", "Hallo Mark", "flexible", false).passed).toBe(
      false,
    );
  });

  test("extra labels on the same line are fine", () => {
    expect(cmp("Het antwoord is: 15", "15", "flexible").passed).toBe(true);
    expect(
      cmp("Wat is je naam? Hallo Mark", "Hallo Mark", "flexible").passed,
    ).toBe(true);
    expect(cmp("Bedrag in dollar: 108.50", "108.5", "flexible").passed).toBe(
      true,
    );
  });

  test("printed prompts / headings on extra lines are tolerated", () => {
    expect(
      cmp("Wat is je naam?\nHallo Mark", "Hallo Mark", "flexible").passed,
    ).toBe(true);
    expect(
      cmp("Geef een getal:\nGeef nog een getal:\nSom: 7", "7", "flexible")
        .passed,
    ).toBe(true);
    expect(cmp("Even getallen:\n2\n4\n6", "2\n4\n6", "flexible").passed).toBe(
      true,
    );
    expect(cmp("=========\n2\n4", "2\n4", "flexible").passed).toBe(true);
  });

  test("token boundaries: 5 never matches inside 15 or -5", () => {
    expect(cmp("15", "5", "flexible").passed).toBe(false);
    expect(cmp("Het antwoord is 15", "5", "flexible").passed).toBe(false);
    expect(cmp("-5", "5", "flexible").passed).toBe(false);
    expect(cmp("5.5", "5", "flexible").passed).toBe(false);
    expect(cmp("Hallo Markus", "Hallo Mark", "flexible").passed).toBe(false);
  });

  test("numbers compare by value", () => {
    expect(cmp("108.50", "108.5", "flexible").passed).toBe(true);
    expect(cmp("3.0", "3", "flexible").passed).toBe(true);
    expect(cmp("108.51", "108.5", "flexible").passed).toBe(false);
  });

  test("printing ALL numbers fails 'print the even numbers'", () => {
    const r = cmp("1\n2\n3\n4\n5\n6", "2\n4\n6", "flexible");
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain("`1`");
  });

  test("other extra lines fail with feedback", () => {
    const r = cmp("Welkom bij de omrekenaar!\n108.5", "108.5", "flexible");
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain("Welkom bij de omrekenaar!");
  });

  test("order matters", () => {
    expect(cmp("4\n2", "2\n4", "flexible").passed).toBe(false);
  });

  test("finds the right line even when a prompt contains the same number", () => {
    expect(cmp("Geef 5 getallen:\n5", "5", "flexible").passed).toBe(true);
  });

  test("blank lines in expected or actual output are ignored", () => {
    expect(cmp("a\n\n\nb", "a\nb", "flexible").passed).toBe(true);
    expect(cmp("a\nb", "a\n\nb", "flexible").passed).toBe(true);
  });

  test("feedback points at the most similar line", () => {
    expect(
      cmp("Wat leuk!\nHallo Mike", "Hallo Mark", "flexible").feedback,
    ).toBe(
      "Regel 2: verwacht `Hallo Mark`, maar je programma printte `Hallo Mike`.",
    );
  });

  test("helpful feedback", () => {
    expect(cmp("Hallo Mike", "Hallo Mark", "flexible").feedback).toBe(
      "Regel 1: verwacht `Hallo Mark`, maar je programma printte `Hallo Mike`.",
    );
    expect(cmp("", "Hallo Mark", "flexible").feedback).toContain(
      "printte niets",
    );
    expect(cmp("Wat is je naam?", "Hallo Mark", "flexible").feedback).toContain(
      "Hallo Mark",
    );
  });
});

describe("flexible: printing every candidate answer does not pass (F03, F27)", () => {
  test("all numbers on one line", () => {
    const all = upTo(1000).join(" ");
    expect(flex(all, "8").passed).toBe(false);
    expect(
      flex(all, "8", { stdin: "3\n5", siblings: ["7", "350"] }).passed,
    ).toBe(false);
    expect(flex("7 8 9", "8").passed).toBe(false);
    expect(flex("3 9 5", "9", { stdin: "3\n9\n5" }).passed).toBe(false);
  });

  test("numbers next to a numeric answer need a label", () => {
    expect(flex("8,5", "8").passed).toBe(false);
    expect(flex("[1, 2, 4, 6]", "[2, 4, 6]").passed).toBe(false);
    expect(flex("[2, 4, 6, 8]", "[2, 4, 6]").passed).toBe(false);
    expect(flex("3 + 4 = 7", "7", { stdin: "3\n4" }).passed).toBe(true);
    expect(flex("Stap 2: 8", "8").passed).toBe(true);
    expect(flex("Oppervlakte: 12 m2", "12").passed).toBe(true);
    // Echoed input after some words is fine; bare candidates are not.
    expect(flex("25 is het kwadraat van 5", "25", { stdin: "5" }).passed).toBe(
      true,
    );
    expect(flex("9 3 5", "9", { stdin: "9\n3\n5" }).passed).toBe(false);
    expect(flex("8 en 9 en 10", "8", { stdin: "4" }).passed).toBe(false);
    // One extra number after some words is fine, unless it is another
    // test's answer or there are more.
    expect(
      flex("De som is 51, uit 3 getallen", "51", {
        stdin: "10\n20\n21\nstop",
        siblings: ["20", "0"],
      }).passed,
    ).toBe(true);
    expect(flex("Je wordt 16 in 2024", "16", { stdin: "2008" }).passed).toBe(
      true,
    );
    expect(
      flex("Prijs: 8.5 euro (incl. 21% btw)", "8.5", { stdin: "7" }).passed,
    ).toBe(true);
    expect(
      flex("a 7 a 8 a 9", "8", { stdin: "3\n5", siblings: ["9", "350"] })
        .passed,
    ).toBe(false);
    expect(
      flex("a 7 a 8 a 9 a 10", "8", { stdin: "3\n5", siblings: ["350"] })
        .passed,
    ).toBe(false);
  });

  // The answer is one of the inputs ("which number is the largest?"):
  // printing all inputs, in any form, must not pass every test.
  test("printing every input does not choose one", () => {
    const max = [
      ["4\n1\n2", "4"],
      ["1\n7\n3", "7"],
      ["2\n3\n8", "8"],
    ];
    const longest = [
      ["kat\nolifant\nhond", "olifant"],
      ["giraffe\nmuis\nkoe", "giraffe"],
      ["aap\nbeer\nzebra", "zebra"],
    ];
    const printAll: ((inputs: string[]) => string)[] = [
      (i) => i.join(" en "),
      (i) => `Je getallen: ${i.join(" en ")}`,
      (i) => i.join(", "),
      (i) => i.map((x) => `${x}:`).join("\n"),
      (i) => i.map((x) => `Getal ${x}:`).join("\n"),
    ];
    for (const tests of [max, longest]) {
      for (const program of printAll) {
        const passed = tests.map(
          ([stdin, expected], index) =>
            flex(program(stdin.split("\n")), expected, {
              stdin,
              siblings: tests.filter((_, k) => k !== index).map((t) => t[1]),
            }).passed,
        );
        // At most the test whose answer happens to be printed last.
        expect(passed.slice(0, 2)).toEqual([false, false]);
      }
    }
    // Honest answers keep passing.
    for (const output of [
      "9",
      "Het grootste getal is 9",
      "De grootste van 3, 9 en 5 is 9",
      "Grootste: 9",
      "Geef getal 1:\nGeef getal 2:\nGeef getal 3:\nGrootste: 9",
    ]) {
      expect(
        flex(output, "9", { stdin: "3\n9\n5", siblings: ["4", "8"] }).passed,
      ).toBe(true);
    }
    expect(
      flex("Het langste woord is olifant", "olifant", {
        stdin: "kat\nolifant\nhond",
        siblings: ["giraffe"],
      }).passed,
    ).toBe(true);
    // Trade-off: an input listed after the chosen answer is ambiguous.
    expect(
      flex("9 is groter dan 3 en 5", "9", { stdin: "9\n3\n5" }).passed,
    ).toBe(false);
    // An expected line that ends like a prompt may be matched by one.
    expect(flex("Naam:\nMark:", "Naam:\nMark:", { stdin: "Mark" }).passed).toBe(
      true,
    );
  });

  test("both answers on one line", () => {
    const evenOdd = { even: ["oneven"], odd: ["even"] };
    expect(
      flex("even oneven", "even", { stdin: "4", siblings: evenOdd.even })
        .passed,
    ).toBe(false);
    expect(
      flex("even oneven", "oneven", { stdin: "7", siblings: evenOdd.odd })
        .passed,
    ).toBe(false);
    expect(
      flex("Ja Nee", "Ja", { stdin: "18", siblings: ["Nee"] }).passed,
    ).toBe(false);
    expect(
      flex("Ja Nee", "Nee", { stdin: "12", siblings: ["Ja"] }).passed,
    ).toBe(false);
    expect(
      flex("True False", "True", { stdin: "4", siblings: ["False"] }).passed,
    ).toBe(false);
    const both = "Je mag stemmen / Je mag nog niet stemmen";
    expect(
      flex(both, "Je mag stemmen", {
        stdin: "18",
        siblings: ["Je mag nog niet stemmen", "Je mag stemmen"],
      }).passed,
    ).toBe(false);
    expect(
      flex(both, "Je mag nog niet stemmen", {
        stdin: "15",
        siblings: ["Je mag stemmen", "Je mag stemmen"],
      }).passed,
    ).toBe(false);
  });

  test("a negation turns a word answer around", () => {
    expect(flex("Niet geslaagd", "Geslaagd").passed).toBe(false);
    expect(flex("Het getal is niet even", "even").passed).toBe(false);
    expect(flex("Geen toegang", "Toegang").passed).toBe(false);
    expect(flex("Geslaagd? Nee", "Geslaagd").passed).toBe(false);
    expect(
      flex("Niet geslaagd", "Geslaagd", {
        stdin: "6.5",
        siblings: ["Niet geslaagd"],
      }).passed,
    ).toBe(false);
    expect(
      flex("Helaas, je bent niet geslaagd", "Niet geslaagd", {
        stdin: "4",
        siblings: ["Geslaagd"],
      }).passed,
    ).toBe(true);
  });

  test("candidates printed as prompt-like lines", () => {
    // Bare "N:" lines are never prompts.
    expect(flex("1:\n2:\n3:\n4:\n5:\n6:", "2\n4\n6").passed).toBe(false);
    const repeated = [0, 1, 2, 3]
      .flatMap(() => upTo(30).map((n) => `${n}:`))
      .join("\n");
    expect(flex(repeated, "8\n22\n10\n6").passed).toBe(false);
    // A prompt-like line may not carry another test's answer.
    expect(
      flex("even:\noneven:", "even", { stdin: "4", siblings: ["oneven"] })
        .passed,
    ).toBe(false);
    expect(
      flex("even:\noneven:", "oneven", { stdin: "7", siblings: ["even"] })
        .passed,
    ).toBe(false);
    expect(
      flex("Antwoord: even:\nAntwoord: oneven:", "even", {
        stdin: "4",
        siblings: ["oneven"],
      }).passed,
    ).toBe(false);
    expect(
      flex(
        "Uitslag:\nGeslaagd:\nUitslag: Niet geslaagd:",
        "Uitslag:\nGeslaagd",
        {
          stdin: "7",
          siblings: ["Uitslag:\nNiet geslaagd"],
        },
      ).passed,
    ).toBe(false);
    expect(
      flex(
        "Uitslag:\nGeslaagd:\nUitslag: Niet geslaagd:",
        "Uitslag:\nNiet geslaagd",
        {
          stdin: "4",
          siblings: ["Uitslag:\nGeslaagd"],
        },
      ).passed,
    ).toBe(false);
  });

  test("at most (stdin lines + 2) prompt/heading lines", () => {
    const lines = upTo(31)
      .map((n) => `Getal ${n}:`)
      .join("\n");
    const r = flex(lines, "2\n4\n6\n8\n10", { stdin: "5" });
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain("meer extra regels dan verwacht");
    expect(
      flex("Getal 1:\nGetal 2:\nGetal 3:\nSom: 6", "6", {
        stdin: "1\n2\n3",
        siblings: ["3", "2"],
      }).passed,
    ).toBe(true);
  });

  test("feedback says the answer is there, but with something extra", () => {
    expect(flex("Niet geslaagd", "Geslaagd").feedback).toBe(
      "Regel 1: verwacht `Geslaagd`, maar je programma printte `Niet geslaagd`. Het antwoord staat er wel in, maar met iets erbij dat niet mag (zoals ‘niet’, een tweede antwoord of een extra getal).",
    );
    expect(
      flex("even:\noneven:", "even", { stdin: "4", siblings: ["oneven"] })
        .feedback,
    ).toBe(
      "Je programma printte een regel die niet verwacht werd (regel 2): `oneven:`.",
    );
  });
});

describe("flexible: crafted output stays fast", () => {
  // Grading runs in the server process: checking every occurrence of the
  // answer must not rescan the rest of the line (that took over a second
  // for 64 KB of "a 8 a 8 …").
  test.each([
    ["a 8 ".repeat(16_000), "8", "5", ["3"]],
    ["hond kat ".repeat(7_000), "kat", "kat\nhond", ["hond"]],
    ["a 8 oneven ".repeat(6_000), "8", "4", ["oneven"]],
    [`${"a 8 ".repeat(8_000)}\n${"a 8 ".repeat(8_000)}`, "8\n8", "5", ["3"]],
  ])("%#", (output, expected, stdin, siblings) => {
    const started = performance.now();
    flex(output.slice(0, 64 * 1024), expected, { stdin, siblings });
    expect(performance.now() - started).toBeLessThan(600);
  });
});

describe("flexible: honest answers keep passing", () => {
  test.each([
    ["Geef 5 getallen:\n5", "5", ""],
    ["Het antwoord is: 15", "15", ""],
    ["Wat is je naam? Hallo Mark", "Hallo Mark", "Mark"],
    ["Hallo Mark, welkom!", "Hallo Mark", "Mark"],
    ["Het getal 4 is even", "even", "4"],
    ["4 is een even getal", "even", "4"],
    ["Is het getal even of oneven?\neven", "even", "4"],
    ["Gefeliciteerd, je bent geslaagd!", "Geslaagd", "6.5"],
    ["informatica heeft 5 klinkers", "5", "informatica"],
    ["Het woord Python heeft 1 klinker(s)", "1", "Python"],
    ["3+4=7", "7", "3\n4"],
    ["10-2=8", "8", "10\n-2"],
    ["Geef een getal: Geef nog een getal: 7", "7", "3\n4"],
    ["100.0 euro is 108.0 dollar", "108", "100"],
    ["Grootste van 3, 9, 5: 9", "9", "3\n9\n5"],
    ["Tafel van 7:\n1 x 7 = 7\n2 x 7 = 14\n3 x 7 = 21", "7\n14\n21", "7"],
    ["kat omgekeerd is tak", "tak", "kat"],
    ["Ja, 2024 is een schrikkeljaar", "2024 is een schrikkeljaar", "2024"],
  ])("%p passes %p", (actual, expected, stdin) => {
    const siblings: Record<string, string[]> = {
      even: ["oneven"],
      Geslaagd: ["Niet geslaagd"],
      "Hallo Mark": ["Hallo Fatima"],
      "5": ["1", "8"],
      "1": ["5", "8"],
      "7": ["8", "350"],
      "9": ["5", "1"],
      "7\n14\n21": ["3\n6\n9"],
      tak: ["kat"],
      "2024 is een schrikkeljaar": ["2023 is geen schrikkeljaar"],
    };
    expect(
      flex(actual, expected, { stdin, siblings: siblings[expected] }).passed,
    ).toBe(true);
  });

  test("a heading that lists every option is fine", () => {
    expect(
      flex("Is het getal even of oneven?\noneven", "oneven", {
        stdin: "7",
        siblings: ["even"],
      }).passed,
    ).toBe(true);
    expect(
      flex(
        "Uitslag (geslaagd of niet geslaagd):\nniet geslaagd",
        "Niet geslaagd",
        {
          stdin: "4",
          siblings: ["Geslaagd"],
        },
      ).passed,
    ).toBe(true);
  });

  test("the expected output itself always passes, whatever the other tests expect", () => {
    expect(
      flex("Uitslag:\nNiet geslaagd", "Uitslag:\nNiet geslaagd", {
        stdin: "4",
        siblings: ["Uitslag:\nGeslaagd", "Geslaagd"],
      }).passed,
    ).toBe(true);
    expect(
      flex("Je mag nog niet stemmen", "Je mag nog niet stemmen", {
        stdin: "15",
        siblings: ["Je mag stemmen"],
      }).passed,
    ).toBe(true);
  });
});

describe("flexible: digits and letters split (F35)", () => {
  test("'3x7=21' matches '3 x 7 = 21'", () => {
    expect(cmp("1x3=3", "1 x 3 = 3", "flexible").passed).toBe(true);
    expect(cmp("1 X 3=3", "1 x 3 = 3", "flexible").passed).toBe(true);
    expect(cmp("Lengte: 180cm", "180 cm", "flexible").passed).toBe(true);
    expect(cmp("5euro", "5 euro", "flexible").passed).toBe(true);
  });

  test("number boundaries, signs and exponents still hold", () => {
    expect(cmp("15", "5", "flexible").passed).toBe(false);
    expect(cmp("x15", "x 5", "flexible").passed).toBe(false);
    expect(cmp("1e3", "1000", "flexible").passed).toBe(true);
    expect(cmp("Antwoord: -5", "-5", "flexible").passed).toBe(true);
    expect(cmp("Antwoord: 5", "-5", "flexible").passed).toBe(false);
    expect(cmp("10-3", "-3", "flexible").passed).toBe(false);
  });
});

describe("contains", () => {
  test("every expected line somewhere, any order", () => {
    expect(cmp("x\nResultaat: 42\nklaar", "klaar\n42", "contains").passed).toBe(
      true,
    );
    expect(cmp("Resultaat: 142", "42", "contains").passed).toBe(false);
    expect(cmp("abc", "def", "contains").feedback).toContain("`def`");
  });
});

describe("numbers", () => {
  test("format-insensitive", () => {
    expect(cmp("Dat is $108.50", "108.5", "numbers").passed).toBe(true);
    expect(cmp("Dat is € 108,50", "108.5", "numbers").passed).toBe(true);
    expect(cmp("1e3", "1000", "numbers").passed).toBe(true);
    expect(cmp("Temperatuur: -5 graden", "-5", "numbers").passed).toBe(true);
    expect(cmp("5", "-5", "numbers").passed).toBe(false);
  });

  test("tolerance", () => {
    expect(cmp("3.333", "3.33", "numbers", true, 0.01).passed).toBe(true);
    expect(cmp("3.35", "3.33", "numbers", true, 0.01).passed).toBe(false);
    expect(cmp("3.34", "3.33", "numbers", true, 0).passed).toBe(false);
  });

  test("expected numbers as an ordered subsequence (extra numbers allowed)", () => {
    expect(cmp("100.0 euro is 108.0 dollar", "108", "numbers").passed).toBe(
      true,
    );
    expect(cmp("1 2 3", "1\n2\n3", "numbers").passed).toBe(true);
    expect(cmp("Invoer 4, 7, 9 → som 20", "20", "numbers").passed).toBe(true);
    expect(cmp("1 2 3 4", "1 3", "numbers").passed).toBe(true);
    expect(cmp("3 2 1", "1 2", "numbers").passed).toBe(false);
    expect(cmp("15", "5", "numbers").passed).toBe(false);
    expect(cmp("anything", "geen getal", "numbers").passed).toBe(true);
  });

  test("feedback", () => {
    expect(cmp("100 euro is 107 dollar", "108", "numbers").feedback).toBe(
      "Het getal 108 ontbreekt in je uitvoer (gevonden: 100, 107). Een verschil tot 0.01 mag.",
    );
    expect(cmp("1 2", "1 2 3", "numbers", true, 0).feedback).toBe(
      "Het getal 3 ontbreekt na 2 in je uitvoer (gevonden: 1, 2).",
    );
    expect(cmp("geen", "7", "numbers").feedback).toContain("geen getallen");
  });
});

describe("extractNumbers", () => {
  const vals = (s: string) => extractNumbers(s).map((n) => n.value);
  test("various formats", () => {
    expect(vals("108.50 en 108,50")).toEqual([108.5, 108.5]);
    expect(vals("1e3 2E-2")).toEqual([1000, 0.02]);
    expect(vals("x = -5, y = +3")).toEqual([-5, 3]);
    expect(vals("10-5")).toEqual([10, 5]);
    expect(vals("[1, 2, 3]")).toEqual([1, 2, 3]);
    expect(vals("1,2,3")).toEqual([1, 2, 3]);
    expect(vals("Het is 5.")).toEqual([5]);
    expect(vals("5euro")).toEqual([5]);
    expect(vals("geen getal")).toEqual([]);
    expect(vals(".5")).toEqual([0.5]);
  });
});

describe("regex", () => {
  test("search with multiline + ignoreCase", () => {
    expect(cmp("x\nHallo Mark\n", "^hallo \\w+$", "regex").passed).toBe(true);
    expect(cmp("Hallo Mark", "^hallo", "regex", false).passed).toBe(false);
    expect(cmp("abc", "(", "regex").feedback).toContain(
      "ongeldige reguliere expressie",
    );
  });

  // Regression (F08): a teacher pattern with nested quantifiers on crafted
  // student output used to block the server's event loop for hours.
  test("a pattern that backtracks too long fails the test instead of hanging", () => {
    const started = Date.now();
    const r = cmp(`${"a".repeat(40)}!`, "^(\\w+\\s?)+$", "regex");
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(r.passed).toBe(false);
    expect(r.feedback).toBe(
      "De reguliere expressie van deze test is te traag; vraag je docent om dit te controleren.",
    );
  });

  test("uses the injected regex tester", () => {
    const calls: string[][] = [];
    const r = compareOutput("Hallo", "^Hallo$", {
      match: "regex",
      ignoreCase: false,
      tolerance: 0,
      regexTest: (pattern, flags, text) => {
        calls.push([pattern, flags, text]);
        return "timeout";
      },
    });
    expect(calls).toEqual([["^Hallo$", "mu", "Hallo"]]);
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain("te traag");
  });
});

describe("compareValues", () => {
  const v = parsePythonLiteral;
  const eq = (a: string, e: string, tol = 1e-6) =>
    compareValues(v(a), v(e), tol);

  test("numbers with tolerance, int vs float", () => {
    expect(eq("2", "2.0").equal).toBe(true);
    expect(eq("0.30000000000000004", "0.3").equal).toBe(true);
    expect(eq("2.5", "2.0").equal).toBe(false);
    expect(eq("2.004", "2.0", 0.01).equal).toBe(true);
    expect(eq("float('nan')", "float('nan')").equal).toBe(true);
    expect(eq("123456789012345678901", "123456789012345678902").equal).toBe(
      false,
    );
  });

  test("types: bool is not int, list is not tuple, str is exact", () => {
    expect(eq("True", "1").equal).toBe(false);
    expect(eq("[1, 2]", "(1, 2)").equal).toBe(false);
    expect(eq("'2.0'", "2.0").equal).toBe(false);
    expect(eq("'Hallo'", "'hallo'").equal).toBe(false);
    expect(eq("None", "None").equal).toBe(true);
  });

  test("containers recursively, sets and dicts unordered", () => {
    expect(eq("[1.0000001, [2, 3]]", "[1, [2, 3]]").equal).toBe(true);
    expect(eq("{2, 1}", "{1, 2}").equal).toBe(true);
    expect(eq("{'b': 2, 'a': [1.0]}", "{'a': [1], 'b': 2}").equal).toBe(true);
    expect(eq("frozenset({1})", "{1}").equal).toBe(true);
  });

  test("reasons point at the difference", () => {
    expect(eq("[1, 2, 4]", "[1, 2, 3]").reason).toContain("[2]");
    expect(eq("[1, 2]", "[1, 2, 3]").reason).toContain("2 elementen");
    expect(eq("{'a': 1}", "{'a': 1, 'b': 2}").reason).toContain("'b'");
    expect(eq("{1, 2, 3}", "{1, 2}").reason).toContain("3");
  });
});
