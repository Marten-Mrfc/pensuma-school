import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PREFERENCES,
  isDefaultPreferences,
  mergePreferences,
  parsePreferences,
  preferenceAttributes,
  preferencesPatchSchema,
  preferencesStorageKey,
} from "./preferences";

describe("parsePreferences", () => {
  test("missing or non-object values give the defaults", () => {
    for (const value of [undefined, null, 42, "x", [], {}]) {
      expect(parsePreferences(value)).toEqual({ ...DEFAULT_PREFERENCES });
    }
  });

  test("defaults match the spec", () => {
    expect(parsePreferences({})).toEqual({
      textSize: "100",
      codeFontSize: "m",
      readableFont: false,
      wideSpacing: false,
      moreContrast: false,
      reduceMotion: "system",
      showTimer: true,
    });
  });

  test("a partial value keeps the rest at the defaults", () => {
    expect(
      parsePreferences({ codeFontSize: "xl", readableFont: true }),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      codeFontSize: "xl",
      readableFont: true,
    });
  });

  test("an invalid field falls back on its own and unknown keys are dropped", () => {
    const parsed = parsePreferences({
      textSize: "300",
      wideSpacing: true,
      showTimer: "nee",
      evil: "<script>",
    });
    expect(parsed).toEqual({ ...DEFAULT_PREFERENCES, wideSpacing: true });
    expect("evil" in parsed).toBe(false);
  });
});

describe("mergePreferences", () => {
  test("applies a patch on top of the stored value", () => {
    const merged = mergePreferences(
      { textSize: "125", moreContrast: true },
      { moreContrast: false, reduceMotion: "on" },
    );
    expect(merged).toEqual({
      ...DEFAULT_PREFERENCES,
      textSize: "125",
      moreContrast: false,
      reduceMotion: "on",
    });
  });

  test("isDefaultPreferences", () => {
    expect(isDefaultPreferences(parsePreferences({}))).toBe(true);
    expect(isDefaultPreferences(parsePreferences({ showTimer: false }))).toBe(
      false,
    );
  });
});

describe("preferencesPatchSchema", () => {
  test("accepts a partial, valid patch", () => {
    expect(preferencesPatchSchema.parse({ codeFontSize: "l" })).toEqual({
      codeFontSize: "l",
    });
    expect(preferencesPatchSchema.parse({})).toEqual({});
  });

  test("rejects unknown keys and invalid values", () => {
    expect(preferencesPatchSchema.safeParse({ admin: true }).success).toBe(
      false,
    );
    expect(preferencesPatchSchema.safeParse({ textSize: "200" }).success).toBe(
      false,
    );
  });
});

describe("preferenceAttributes", () => {
  test("defaults set no data attributes and the base sizes", () => {
    expect(preferenceAttributes(parsePreferences({}))).toEqual({
      dataset: {
        font: undefined,
        spacing: undefined,
        contrast: undefined,
        motion: undefined,
      },
      style: { "--code-font-size": "14px", "--app-font-scale": "1" },
    });
  });

  test("maps every preference", () => {
    const attrs = preferenceAttributes(
      parsePreferences({
        textSize: "125",
        codeFontSize: "xl",
        readableFont: true,
        wideSpacing: true,
        moreContrast: true,
        reduceMotion: "on",
      }),
    );
    expect(attrs.dataset).toEqual({
      font: "readable",
      spacing: "wide",
      contrast: "more",
      motion: "reduce",
    });
    expect(attrs.style).toEqual({
      "--code-font-size": "20px",
      "--app-font-scale": "1.25",
    });
  });

  test("code font sizes are 13/14/17/20 px and text 112 is 1.125", () => {
    const px = (["s", "m", "l", "xl"] as const).map(
      (codeFontSize) =>
        preferenceAttributes(parsePreferences({ codeFontSize })).style[
          "--code-font-size"
        ],
    );
    expect(px).toEqual(["13px", "14px", "17px", "20px"]);
    expect(
      preferenceAttributes(parsePreferences({ textSize: "112" })).style[
        "--app-font-scale"
      ],
    ).toBe("1.125");
  });
});

test("storage key is namespaced per account", () => {
  expect(preferencesStorageKey("u1")).toBe("pensuma:prefs:u1");
});
