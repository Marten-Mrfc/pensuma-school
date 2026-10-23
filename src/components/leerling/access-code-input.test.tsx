import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ACCESS_CODE_REGEX } from "@/components/docent/assignments/defaults";
import {
  ACCESS_CODE_MAX_LENGTH,
  AccessCodeInput,
  accessCodeSizeClass,
  normalizeTypedAccessCode,
} from "./access-code-input";

function render(value = "") {
  return renderToStaticMarkup(
    <AccessCodeInput id="code" value={value} onValueChange={() => {}} />,
  );
}

describe("access code field (A23)", () => {
  test("takes the longest code a teacher can choose", () => {
    expect(ACCESS_CODE_REGEX.test("A".repeat(ACCESS_CODE_MAX_LENGTH))).toBe(
      true,
    );
    expect(ACCESS_CODE_REGEX.test("A".repeat(ACCESS_CODE_MAX_LENGTH + 1))).toBe(
      false,
    );
    expect(render()).toContain(`maxLength="${ACCESS_CODE_MAX_LENGTH}"`);
    expect(ACCESS_CODE_MAX_LENGTH).toBe(20);
  });

  test("typing is normalised like the server compares it", () => {
    expect(normalizeTypedAccessCode("informatica - h3 ")).toBe(
      "INFORMATICA-H3",
    );
  });

  test("long codes get smaller letters so they fit on a phone", () => {
    expect(accessCodeSizeClass(6)).toContain("text-3xl");
    expect(accessCodeSizeClass(10)).toContain("text-2xl");
    expect(accessCodeSizeClass(14)).toContain("text-xl");
    expect(accessCodeSizeClass(20)).toContain("text-base");
    expect(accessCodeSizeClass(20)).toContain("min-[360px]:text-lg");
    expect(render("INFORMATICA-HAVO-4H2")).toContain("text-base");
    expect(render("")).toContain("text-3xl");
  });

  test("every length fits the narrowest phone (320px: about 210px of text)", () => {
    // Font size (px) and tracking (em) of the classes below 360px.
    const metrics = (cls: string) => {
      const size = cls.match(/^text-(3xl|2xl|xl|lg|base)\b/)?.[1];
      const px = { "3xl": 30, "2xl": 24, xl: 20, lg: 18, base: 16 }[size ?? ""];
      const em = Number(cls.match(/^\S+ tracking-\[([\d.]+)em\]/)?.[1]);
      return { px: px ?? Number.NaN, em };
    };
    for (let n = 3; n <= ACCESS_CODE_MAX_LENGTH; n++) {
      const { px, em } = metrics(accessCodeSizeClass(n));
      // A monospace letter is 0.6em wide, plus the tracking after it.
      expect(n * px * (0.6 + em)).toBeLessThanOrEqual(210);
    }
  });

  test("placeholder meets the large-text contrast minimum (A09)", () => {
    const html = render();
    expect(html).toContain("placeholder:text-muted-foreground");
    expect(html).not.toMatch(/placeholder:text-muted-foreground\/\d+/);
  });
});
