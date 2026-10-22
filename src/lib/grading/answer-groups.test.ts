import { describe, expect, test } from "bun:test";
import { groupAnswers, groupKey } from "./answer-groups";

describe("groupKey: open", () => {
  test("ignores case, spacing and punctuation", () => {
    const a = groupKey("open", { text: "Een lus herhaalt code!" });
    const b = groupKey("open", { text: "  een LUS   herhaalt\ncode " });
    const c = groupKey("open", { text: "Een lus, herhaalt code." });
    expect(a).toBe("een lus herhaalt code");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  test("different words give different keys", () => {
    expect(groupKey("open", { text: "= is toekennen" })).not.toBe(
      groupKey("open", { text: "== is vergelijken" }),
    );
  });

  test("blank or missing text → empty key", () => {
    expect(groupKey("open", { text: "  ?! " })).toBe("");
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
