import { describe, expect, test } from "bun:test";
import {
  prependRubricFeedback,
  rubricFeedbackLines,
  rubricScore,
  unknownRubricIds,
} from "./rubric";

const items = [
  { id: "a", label: "Juiste uitleg", points: 1 },
  { id: "b", label: "Passend voorbeeld", points: 1.5 },
  { id: "c", label: "Vaktaal", points: 0.5 },
];

describe("rubricScore", () => {
  test("sums the points of the checked criteria", () => {
    expect(rubricScore(items, [], 3)).toBe(0);
    expect(rubricScore(items, ["a"], 3)).toBe(1);
    expect(rubricScore(items, ["a", "b"], 3)).toBe(2.5);
    expect(rubricScore(items, ["a", "b", "c"], 3)).toBe(3);
  });

  test("clamps to the maximum and to zero", () => {
    expect(rubricScore(items, ["a", "b", "c"], 2)).toBe(2);
    expect(rubricScore([{ id: "x", label: "", points: -5 }], ["x"], 2)).toBe(0);
    expect(rubricScore(items, ["a"], 0)).toBe(0);
  });

  test("ignores unknown and duplicate ids", () => {
    expect(rubricScore(items, ["a", "a", "zzz"], 3)).toBe(1);
  });

  test("avoids floating point noise", () => {
    const tenths = [
      { id: "p", label: "", points: 0.1 },
      { id: "q", label: "", points: 0.2 },
    ];
    expect(rubricScore(tenths, ["p", "q"], 1)).toBe(0.3);
  });
});

describe("unknownRubricIds", () => {
  test("lists ids that are not criteria", () => {
    expect(unknownRubricIds(items, ["a", "x", "x", "y"])).toEqual(["x", "y"]);
    expect(unknownRubricIds(items, ["a", "b"])).toEqual([]);
  });
});

describe("rubric feedback lines", () => {
  test("one line per criterion", () => {
    expect(rubricFeedbackLines(items, ["a", "c"])).toBe(
      "✓ Juiste uitleg (1 pt)\n✗ Passend voorbeeld (1,5 pt)\n✓ Vaktaal (0,5 pt)",
    );
  });

  test("prepends and replaces an earlier block", () => {
    const lines = rubricFeedbackLines(items, ["a"]);
    const first = prependRubricFeedback("Goed gedaan!", lines);
    expect(first).toBe(`${lines}\n\nGoed gedaan!`);
    const again = prependRubricFeedback(
      first,
      rubricFeedbackLines(items, ["a", "b"]),
    );
    expect(again).toBe(
      `${rubricFeedbackLines(items, ["a", "b"])}\n\nGoed gedaan!`,
    );
    expect(prependRubricFeedback("", lines)).toBe(lines);
  });
});
