import { describe, expect, test } from "bun:test";
import { pairFeatures, similarityLevel, similarityPercent } from "./labels";

describe("similarityLevel", () => {
  test("levels with boundaries", () => {
    expect(similarityLevel(0.95).label).toBe("Zeer hoog");
    expect(similarityLevel(0.9).label).toBe("Zeer hoog");
    expect(similarityLevel(0.85).label).toBe("Hoog");
    expect(similarityLevel(0.8).label).toBe("Hoog");
    expect(similarityLevel(0.7).label).toBe("Opvallend");
    expect(similarityPercent(0.856)).toBe("86%");
  });
});

describe("pairFeatures", () => {
  test("chips", () => {
    expect(
      pairFeatures({
        exact: true,
        identicalStructure: true,
        pasteCount: 0,
        withSolution: false,
      }),
    ).toEqual(["Identiek"]);
    expect(
      pairFeatures({
        exact: false,
        identicalStructure: true,
        pasteCount: 2,
        withSolution: true,
      }),
    ).toEqual([
      "Zelfde opbouw, andere namen",
      "Plakken gelogd (2×)",
      "Lijkt op modeloplossing",
    ]);
    expect(
      pairFeatures({
        exact: false,
        identicalStructure: false,
        pasteCount: 0,
        withSolution: false,
      }),
    ).toEqual([]);
  });
});
