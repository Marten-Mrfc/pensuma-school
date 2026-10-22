import { describe, expect, test } from "bun:test";
import { buildTitle } from "./use-document-title";

describe("buildTitle", () => {
  test("joins the parts and appends Pensuma", () => {
    expect(buildTitle(["Vraag 3 van 12", "Python basis"])).toBe(
      "Vraag 3 van 12 · Python basis · Pensuma",
    );
  });

  test("skips empty parts", () => {
    expect(buildTitle(["Resultaat", null, undefined, "", false])).toBe(
      "Resultaat · Pensuma",
    );
  });

  test("no parts gives just the app name", () => {
    expect(buildTitle([])).toBe("Pensuma");
  });
});
