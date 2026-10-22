import { describe, expect, test } from "bun:test";
import { parseIdsParam } from "./parse-ids-param";

describe("parseIdsParam", () => {
  test("splits on commas and trims", () => {
    expect(parseIdsParam(" a , b,c ")).toEqual(["a", "b", "c"]);
  });

  test("removes duplicates and empty parts", () => {
    expect(parseIdsParam("a,,b,a, ,")).toEqual(["a", "b"]);
  });

  test("accepts repeated parameters", () => {
    expect(parseIdsParam(["a,b", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  test("empty input → undefined", () => {
    expect(parseIdsParam(undefined)).toBeUndefined();
    expect(parseIdsParam("")).toBeUndefined();
    expect(parseIdsParam(" , ,")).toBeUndefined();
    expect(parseIdsParam([])).toBeUndefined();
  });

  test("keeps at most 1000 ids", () => {
    const many = Array.from({ length: 1200 }, (_, i) => `id${i}`).join(",");
    expect(parseIdsParam(many)).toHaveLength(1000);
  });
});
