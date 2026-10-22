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

  test("count and order", () => {
    expect(cmp("1 2 3", "1\n2\n3", "numbers").passed).toBe(true);
    expect(cmp("1 3 2", "1 2 3", "numbers").feedback).toContain(
      "Getal 2: verwacht 2, maar je programma printte 3",
    );
    expect(cmp("1 2", "1 2 3", "numbers").feedback).toContain(
      "Getal 3 ontbreekt: 3",
    );
    expect(cmp("1 2 3 4", "1 2 3", "numbers").feedback).toContain(
      "Extra getal: 4",
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
