import { describe, expect, test } from "bun:test";
import { validateQuestion } from "./validate";

function ioIssues(tests: Record<string, unknown>[]) {
  return validateQuestion({
    type: "code",
    title: "Vraag",
    prompt: "Opdracht",
    points: 1,
    data: { solution: "x = input()\nprint(x)", tests },
  }).filter((i) => i.code.startsWith("code.io_"));
}

describe("warning: another test's answer also passes (F27)", () => {
  test("'Bevat: Geslaagd' is also met by 'Niet geslaagd'", () => {
    const issues = ioIssues([
      {
        id: "a",
        kind: "io",
        stdin: "7",
        expectedOutput: "Geslaagd",
        match: "contains",
      },
      { id: "b", kind: "io", stdin: "4", expectedOutput: "Niet geslaagd" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: "warning",
      code: "code.io_expected_overlap",
      target: { field: "test", id: "a", index: 0 },
    });
    expect(issues[0].message).toContain('test 2 ("Niet geslaagd")');
    expect(issues[0].message).toContain('Kies "Flexibel" of "Exact"');
  });

  test("flexible already tells 'Geslaagd' and 'Niet geslaagd' apart", () => {
    expect(
      ioIssues([
        { id: "a", kind: "io", stdin: "7", expectedOutput: "Geslaagd" },
        { id: "b", kind: "io", stdin: "4", expectedOutput: "Niet geslaagd" },
      ]),
    ).toEqual([]);
  });

  test("same answer for different inputs is normal", () => {
    expect(
      ioIssues([
        { id: "a", kind: "io", stdin: "18", expectedOutput: "Je mag stemmen" },
        { id: "b", kind: "io", stdin: "42", expectedOutput: "Je mag stemmen!" },
        {
          id: "c",
          kind: "io",
          stdin: "15",
          expectedOutput: "Je mag nog niet stemmen",
        },
      ]),
    ).toEqual([]);
  });
});

describe("warning: slow regular expression (F08)", () => {
  test("nested quantifier", () => {
    const issues = ioIssues([
      {
        id: "a",
        kind: "io",
        stdin: "",
        expectedOutput: "^(\\w+\\s?)+$",
        match: "regex",
      },
    ]);
    expect(issues.map((i) => i.code)).toEqual(["code.io_regex_slow"]);
    expect(issues[0].severity).toBe("warning");
  });

  test("ordinary pattern", () => {
    expect(
      ioIssues([
        {
          id: "a",
          kind: "io",
          stdin: "",
          expectedOutput: "^Hallo \\w+( \\w+)*$",
          match: "regex",
        },
      ]),
    ).toEqual([]);
  });
});
