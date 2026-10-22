import { describe, expect, test } from "bun:test";
import { applyHintPenalty, hintPenaltyFraction } from "./hint-penalty";

const hints = [
  { id: "h1", penalty: 0.25 },
  { id: "h2", penalty: 0.5 },
  { id: "h3", penalty: 0.5 },
];

describe("applyHintPenalty", () => {
  test("one 25% hint with all tests passing gives 75% of the points", () => {
    const fraction = applyHintPenalty(1, hints, [
      { id: "h1", at: "2026-10-22T09:00:00Z" },
    ]);
    expect(fraction).toBe(0.75);
    // As autoScore for a 4-point question: 3 points.
    expect(Math.round(fraction * 4 * 100) / 100).toBe(3);
  });

  test("no hints used, no penalty", () => {
    expect(applyHintPenalty(0.8, hints, [])).toBe(0.8);
    expect(applyHintPenalty(0.8, hints, null)).toBe(0.8);
    expect(applyHintPenalty(0.8, [], [{ id: "h1" }])).toBe(0.8);
  });

  test("penalties add up and never go below zero", () => {
    expect(applyHintPenalty(1, hints, [{ id: "h1" }, { id: "h2" }])).toBe(0.25);
    expect(applyHintPenalty(0.5, hints, [{ id: "h2" }, { id: "h3" }])).toBe(0);
    expect(applyHintPenalty(0.2, hints, [{ id: "h1" }])).toBe(0);
  });

  test("unknown and duplicate hint ids are ignored", () => {
    expect(applyHintPenalty(1, hints, [{ id: "nope" }])).toBe(1);
    expect(applyHintPenalty(1, hints, [{ id: "h1" }, { id: "h1" }])).toBe(0.75);
  });

  test("the total penalty is capped at 1", () => {
    expect(
      hintPenaltyFraction(hints, [{ id: "h1" }, { id: "h2" }, { id: "h3" }]),
    ).toBe(1);
  });

  test("invalid fractions are clamped", () => {
    expect(applyHintPenalty(Number.NaN, hints, [])).toBe(0);
    expect(applyHintPenalty(1.5, hints, [])).toBe(1);
  });
});
