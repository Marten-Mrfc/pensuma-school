import { describe, expect, test } from "bun:test";
import {
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_QUESTION,
  normalizeTag,
  normalizeTags,
  SUGGESTED_TAGS,
} from "./tags";

describe("normalizeTag", () => {
  test("trims, lower-cases and collapses whitespace", () => {
    expect(normalizeTag("  For-Lus ")).toBe("for-lus");
    expect(normalizeTag("Invoer   en\tUitvoer")).toBe("invoer en uitvoer");
  });

  test("cuts to 30 characters", () => {
    const long = "a".repeat(40);
    expect(normalizeTag(long)).toHaveLength(MAX_TAG_LENGTH);
    expect(normalizeTag(`${"b".repeat(29)} c`)).toBe("b".repeat(29));
  });

  test("returns an empty string for blank input", () => {
    expect(normalizeTag("   ")).toBe("");
  });
});

describe("normalizeTags", () => {
  test("drops empty tags and duplicates, keeps order", () => {
    expect(normalizeTags(["Lijsten", "", "lijsten ", "Strings"])).toEqual([
      "lijsten",
      "strings",
    ]);
  });

  test("keeps at most 10 tags", () => {
    const many = Array.from({ length: 15 }, (_, i) => `tag ${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS_PER_QUESTION);
  });
});

describe("SUGGESTED_TAGS", () => {
  test("are already normalised and unique", () => {
    for (const tag of SUGGESTED_TAGS) expect(normalizeTag(tag)).toBe(tag);
    expect(new Set(SUGGESTED_TAGS).size).toBe(SUGGESTED_TAGS.length);
    expect(SUGGESTED_TAGS).toContain("zoeken en sorteren");
  });
});
