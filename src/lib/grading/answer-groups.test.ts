import { describe, expect, test } from "bun:test";
import { groupAnswers, groupKey } from "./answer-groups";

describe("groupKey: open", () => {
  test("ignores spacing and sentence punctuation after words", () => {
    const a = groupKey("open", { text: "Een lus herhaalt code!" });
    const b = groupKey("open", { text: "  Een lus   herhaalt\ncode " });
    const c = groupKey("open", { text: "Een lus, herhaalt code." });
    expect(a).toBe("Een lus herhaalt code");
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(groupKey("open", { text: "print(x)." })).toBe("print(x)");
  });

  test("different words give different keys", () => {
    expect(groupKey("open", { text: "= is toekennen" })).not.toBe(
      groupKey("open", { text: "== is vergelijken" }),
    );
  });

  // Regression (F39): symbols, signs and brackets carry the meaning in an
  // informatica answer, so these pairs must NOT be "precies hetzelfde".
  test.each([
    ["4", "-4"],
    ["x == 5 vergelijkt", "x = 5 vergelijkt"],
    ["a < b", "a > b"],
    ["x += 1", "x -= 1"],
    ["3 * 2 = 6", "3 + 2 = 6"],
    ["10 % 3", "10 / 3"],
    ["[1, 2]", "(1, 2)"],
    ["(1, 2)", "(1 2)"],
    ["2**3", "2*3"],
    ["True", "true"],
    ["3.5", "35"],
  ])("%p and %p get different keys", (a, b) => {
    expect(groupKey("open", { text: a })).not.toBe(
      groupKey("open", { text: b }),
    );
  });

  test("blank or missing text → empty key", () => {
    expect(groupKey("open", { text: "  \n\t " })).toBe("");
    expect(groupKey("open", { text: "" })).toBe("");
    expect(groupKey("open", null)).toBe("");
  });
});

describe("groupKey: code", () => {
  test("ignores comments, blank lines and spacing", () => {
    const a = groupKey("code", {
      code: 'naam = input("Naam? ")\nprint("Hallo", naam)\n',
    });
    const b = groupKey("code", {
      code: '# vraag de naam\nnaam=input( "Naam? " )\n\n\nprint("Hallo",naam)',
    });
    expect(b).toBe(a);
  });

  test("keeps variable names and strings", () => {
    const a = groupKey("code", { code: "x = 1\nprint(x)" });
    expect(groupKey("code", { code: "y = 1\nprint(y)" })).not.toBe(a);
    expect(groupKey("code", { code: 'print("a")' })).not.toBe(
      groupKey("code", { code: 'print("b")' }),
    );
  });

  test("indentation structure matters", () => {
    const inside = "for i in range(3):\n    print(i)\n    print('klaar')";
    const after = "for i in range(3):\n    print(i)\nprint('klaar')";
    expect(groupKey("code", { code: inside })).not.toBe(
      groupKey("code", { code: after }),
    );
    // Two or four spaces: same structure.
    expect(groupKey("code", { code: "if x:\n  print(1)\n" })).toBe(
      groupKey("code", { code: "if x:\n    print(1)" }),
    );
  });
});

describe("groupKey: multiple choice", () => {
  test("order of the chosen options does not matter", () => {
    expect(groupKey("multiple_choice", { selected: ["b", "a"] })).toBe(
      groupKey("multiple_choice", { selected: ["a", "b", "a"] }),
    );
  });
});

describe("groupAnswers", () => {
  test("groups by key in first-seen order; blanks stay separate", () => {
    const items = [
      { id: 1, key: "x" },
      { id: 2, key: "y" },
      { id: 3, key: "x" },
      { id: 4, key: "" },
      { id: 5, key: "" },
    ];
    const groups = groupAnswers(items, (i) => i.key);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([
      [1, 3],
      [2],
      [4],
      [5],
    ]);
  });
});
