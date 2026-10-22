import { describe, expect, test } from "bun:test";
import { alphaLevel, isSmallSample, itemFlags } from "./flags";
import {
  analyzeItems,
  cronbachAlpha,
  type ItemAnalysisRow,
  pearson,
} from "./item-analysis";

/**
 * 5 students × 3 items (A max 1, B max 2, C max 1):
 *
 *        A  B  C | total
 *   S1   1  2  1 |   4
 *   S2   1  2  0 |   3
 *   S3   1  1  1 |   3
 *   S4   0  1  0 |   1
 *   S5   0  0  0 |   0
 *
 * By hand (sample variances, n − 1):
 *   totals: mean 2,2; variance 10,8 / 4 = 2,7; sd √2,7 ≈ 1,643
 *   A: p 0,6; variance 1,2 / 4 = 0,3; Σ(dA·dT) = 3,4 → rit = 3,4 / √(1,2·10,8) = 3,4 / 3,6 ≈ 0,944
 *   B: p 1,2 / 2 = 0,6; variance 0,7
 *   C: p 0,4; variance 0,3
 *   alpha = 3/2 · (1 − (0,3 + 0,7 + 0,3) / 2,7) = 3/2 · 1,4/2,7 = 7/9 ≈ 0,778
 */
const table = [
  [1, 2, 1],
  [1, 2, 0],
  [1, 1, 1],
  [0, 1, 0],
  [0, 0, 0],
];
const maxima = [1, 2, 1];
const ids = ["A", "B", "C"];
const rows: ItemAnalysisRow[] = table.map((scores) => ({
  items: Object.fromEntries(
    ids.map((id, i) => [id, { score: scores[i], max: maxima[i] }]),
  ),
}));

describe("analyzeItems", () => {
  const result = analyzeItems(rows, ids);
  const byId = Object.fromEntries(result.items.map((i) => [i.questionId, i]));

  test("p-values", () => {
    expect(byId.A.p).toBeCloseTo(0.6, 10);
    expect(byId.B.p).toBeCloseTo(0.6, 10);
    expect(byId.C.p).toBeCloseTo(0.4, 10);
  });

  test("item standard deviations", () => {
    expect(byId.A.sd).toBeCloseTo(Math.sqrt(0.3), 10);
    expect(byId.B.sd).toBeCloseTo(Math.sqrt(0.7), 10);
    expect(byId.C.sd).toBeCloseTo(Math.sqrt(0.3), 10);
  });

  test("rit and rir", () => {
    expect(byId.A.rit).toBeCloseTo(3.4 / 3.6, 10);
    expect(byId.B.rit).toBeCloseTo(0.8728715609, 8);
    expect(byId.C.rit).toBeCloseTo(0.7222222222, 8);
    // A against the rest (B + C = 3, 2, 2, 1, 0; mean 1,6): Σd·d = 2,2,
    // Σd² (rest) = 5,2 → 2,2 / √(1,2 · 5,2) ≈ 0,881
    expect(byId.A.rir).toBeCloseTo(2.2 / Math.sqrt(1.2 * 5.2), 10);
    expect(byId.B.rir).toBeCloseTo(0.5976143047, 8);
    expect(byId.C.rir).toBeCloseTo(0.4900980294, 8);
  });

  test("test level: mean, sd and Cronbach's alpha", () => {
    expect(result.test.n).toBe(5);
    expect(result.test.k).toBe(3);
    expect(result.test.maxTotal).toBe(4);
    expect(result.test.mean).toBeCloseTo(2.2, 10);
    expect(result.test.sd).toBeCloseTo(Math.sqrt(2.7), 10);
    expect(result.test.alpha).toBeCloseTo(7 / 9, 10);
  });

  test("an item without variance has no correlations", () => {
    const flat = rows.map((r) => ({
      items: { ...r.items, D: { score: 1, max: 1 } },
    }));
    const res = analyzeItems(flat, [...ids, "D"]);
    const d = res.items.find((i) => i.questionId === "D");
    expect(d?.p).toBe(1);
    expect(d?.sd).toBe(0);
    expect(d?.rit).toBeNull();
    expect(d?.rir).toBeNull();
  });

  test("zero total variance → alpha null", () => {
    const same = [0, 1, 2].map(() => ({
      items: { A: { score: 1, max: 1 }, B: { score: 0, max: 1 } },
    }));
    const res = analyzeItems(same, ["A", "B"]);
    expect(res.test.alpha).toBeNull();
    expect(res.test.sd).toBe(0);
  });

  test("fewer than 2 items → alpha and rir null", () => {
    const res = analyzeItems(rows, ["A"]);
    expect(res.test.k).toBe(1);
    expect(res.test.alpha).toBeNull();
    expect(res.items[0].rir).toBeNull();
  });

  test("a single student → no spread, no correlations", () => {
    const res = analyzeItems(rows.slice(0, 1), ids);
    expect(res.test.sd).toBeNull();
    expect(res.test.alpha).toBeNull();
    expect(res.items[0].p).toBe(1);
    expect(res.items[0].rit).toBeNull();
  });

  test("items with max 0 (dropped) are excluded", () => {
    const dropped = rows.map((r) => ({
      items: { ...r.items, C: { score: 0, max: 0 } },
    }));
    const res = analyzeItems(dropped, ids);
    const c = res.items.find((i) => i.questionId === "C");
    expect(c?.excluded).toBe(true);
    expect(c?.p).toBeNull();
    expect(res.test.k).toBe(2);
    expect(res.test.maxTotal).toBe(3);
  });

  test("missing answers count as 0 points, scores are clamped", () => {
    const res = analyzeItems(
      [
        { items: { A: { score: 5, max: 1 } } },
        { items: { A: { score: -1, max: 1 } } },
        { items: {} },
      ],
      ["A"],
    );
    expect(res.items[0].p).toBeCloseTo(1 / 3, 10);
  });

  test("no students", () => {
    const res = analyzeItems([], ids);
    expect(res.test.mean).toBeNull();
    expect(res.items.every((i) => i.excluded)).toBe(true);
  });
});

describe("pearson and cronbachAlpha", () => {
  test("perfect and degenerate correlations", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 12);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1], [1])).toBeNull();
  });

  test("alpha needs two items and total variance", () => {
    expect(cronbachAlpha([0.3], 1)).toBeNull();
    expect(cronbachAlpha([0.3, 0.3], 0)).toBeNull();
    expect(cronbachAlpha([0.3, 0.3], null)).toBeNull();
  });
});

describe("flags", () => {
  test("difficulty", () => {
    expect(itemFlags({ p: 0.2, rir: 0.5 }).map((f) => f.label)).toEqual([
      "Moeilijk",
    ]);
    expect(itemFlags({ p: 0.95, rir: 0.5 }).map((f) => f.label)).toEqual([
      "Erg makkelijk",
    ]);
    expect(itemFlags({ p: 0.3, rir: 0.2 })).toEqual([]);
    expect(itemFlags({ p: 0.9, rir: null })).toEqual([]);
  });

  test("discrimination", () => {
    expect(itemFlags({ p: 0.5, rir: -0.1 }).map((f) => f.label)).toEqual([
      "Negatief: controleer de vraag en het antwoordmodel",
    ]);
    expect(itemFlags({ p: 0.5, rir: 0.1 }).map((f) => f.label)).toEqual([
      "Onderscheidt weinig",
    ]);
  });

  test("alpha levels", () => {
    expect(alphaLevel(0.85)?.label).toBe("Betrouwbaar");
    expect(alphaLevel(0.8)?.label).toBe("Betrouwbaar");
    expect(alphaLevel(0.7)?.label).toBe("Redelijk");
    expect(alphaLevel(0.6)?.label).toBe("Redelijk");
    expect(alphaLevel(0.4)?.label).toBe(
      "Laag (bij korte toetsen gebruikelijk)",
    );
    expect(alphaLevel(null)).toBeNull();
  });

  test("small groups", () => {
    expect(isSmallSample(9)).toBe(true);
    expect(isSmallSample(10)).toBe(false);
  });
});
