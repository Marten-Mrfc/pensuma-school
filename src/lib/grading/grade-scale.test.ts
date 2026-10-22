import { describe, expect, test } from "bun:test";
import {
  computeGrade,
  describeScale,
  type GradingScale,
  gradeTable,
  LINEAR_SCALE,
} from "./grade-scale";

/** The formula `dutchGrade` used before grading scales existed. */
function oldDutchGrade(score: number, maxScore: number): number | null {
  if (!maxScore) return null;
  const grade = 1 + 9 * Math.max(0, Math.min(1, score / maxScore));
  return Math.round(grade * 10) / 10;
}

const cesuur = (passPercentage: number): GradingScale => ({
  method: "cesuur",
  passPercentage,
  nTerm: 1,
});
const nterm = (nTerm: number): GradingScale => ({
  method: "nterm",
  passPercentage: 55,
  nTerm,
});

describe("computeGrade", () => {
  test("no maximum gives null", () => {
    expect(computeGrade(3, 0)).toBeNull();
    expect(computeGrade(3, -2)).toBeNull();
    expect(computeGrade(3, 0, cesuur(60))).toBeNull();
  });

  test("linear equals the old formula for every score 0..max", () => {
    for (const max of [1, 3, 7, 10, 12, 20, 33, 40, 64, 100]) {
      for (let score = 0; score <= max; score++) {
        expect(computeGrade(score, max)).toBe(oldDutchGrade(score, max));
        expect(computeGrade(score, max, LINEAR_SCALE)).toBe(
          oldDutchGrade(score, max),
        );
      }
      // Half points too.
      for (let half = 1; half < 2 * max; half += 2) {
        expect(computeGrade(half / 2, max)).toBe(oldDutchGrade(half / 2, max));
      }
    }
  });

  test("scores outside 0..max are clamped", () => {
    expect(computeGrade(-5, 10)).toBe(1);
    expect(computeGrade(15, 10)).toBe(10);
    expect(computeGrade(Number.NaN, 10)).toBe(1);
  });

  test("cesuur at 60%", () => {
    const scale = cesuur(60);
    expect(computeGrade(6, 10, scale)).toBe(5.5);
    expect(computeGrade(10, 10, scale)).toBe(10);
    expect(computeGrade(0, 10, scale)).toBe(1);
    // Below the cesuur: 1 + 4.5 × (0.3 / 0.6) = 3.25 → 3.3
    expect(computeGrade(3, 10, scale)).toBe(3.3);
    // Above: 5.5 + 4.5 × (0.2 / 0.4) = 7.75 → 7.8
    expect(computeGrade(8, 10, scale)).toBe(7.8);
  });

  test("cesuur at 55% is a little stricter than linear", () => {
    expect(computeGrade(55, 100, cesuur(55))).toBe(5.5);
    expect(computeGrade(50, 100, cesuur(55))).toBeLessThan(5.5);
  });

  test("N-term bounds", () => {
    // N = 2: 0 points stays 1.0 (bounded by 1 + 18r).
    expect(computeGrade(0, 10, nterm(2))).toBe(1);
    // N = 0.5: full marks still give 10.0 (bounded by 10 − 18(1 − r)).
    expect(computeGrade(10, 10, nterm(0.5))).toBe(10);
    // N = 1 equals 9r + 1, i.e. linear.
    for (let score = 0; score <= 20; score++) {
      expect(computeGrade(score, 20, nterm(1))).toBe(computeGrade(score, 20));
    }
    // N = 2 at half the points: min(6.5, 10, 7.75) = 6.5
    expect(computeGrade(5, 10, nterm(2))).toBe(6.5);
    // N = 3 near the top: min(10.1, …, 9.55) → 9.6 (rounded), never above 10
    expect(computeGrade(9, 10, nterm(3))).toBe(9.6);
    expect(computeGrade(10, 10, nterm(3))).toBe(10);
    // N = 0: 0 points → 0, clamped to 1.
    expect(computeGrade(0, 10, nterm(0))).toBe(1);
  });

  test("rounds half up at .x5", () => {
    // 1 + 9 × 0.25 = 3.25 → 3.3
    expect(computeGrade(1, 4)).toBe(3.3);
    // 1 + 9 × 0.75 = 7.75 → 7.8
    expect(computeGrade(3, 4)).toBe(7.8);
    // Cesuur 50%: 1 + 4.5 × 0.25 / 0.5 = 3.25 → 3.3
    expect(computeGrade(1, 4, cesuur(50))).toBe(3.3);
  });
});

describe("describeScale", () => {
  test("Dutch descriptions with a decimal comma", () => {
    expect(describeScale(LINEAR_SCALE)).toBe("Lineair: 1 + 9 × score/max");
    expect(describeScale(cesuur(55))).toBe("Cesuur: 55% van de punten = 5,5");
    expect(describeScale(cesuur(57.5))).toBe(
      "Cesuur: 57,5% van de punten = 5,5",
    );
    expect(describeScale(nterm(1))).toBe("N-term: 1,0");
    expect(describeScale(nterm(1.25))).toBe("N-term: 1,25");
  });
});

describe("gradeTable", () => {
  test("default percentages include the cesuur", () => {
    expect(gradeTable(cesuur(60))).toEqual([
      { percentage: 0, grade: 1 },
      { percentage: 25, grade: computeGrade(25, 100, cesuur(60)) ?? 0 },
      { percentage: 50, grade: computeGrade(50, 100, cesuur(60)) ?? 0 },
      { percentage: 60, grade: 5.5 },
      { percentage: 75, grade: computeGrade(75, 100, cesuur(60)) ?? 0 },
      { percentage: 100, grade: 10 },
    ]);
  });

  test("duplicates are removed and the order is ascending", () => {
    const rows = gradeTable(cesuur(50));
    expect(rows.map((r) => r.percentage)).toEqual([0, 25, 50, 75, 100]);
    expect(gradeTable(LINEAR_SCALE, [100, 0, 50])).toEqual([
      { percentage: 0, grade: 1 },
      { percentage: 50, grade: 5.5 },
      { percentage: 100, grade: 10 },
    ]);
  });
});
