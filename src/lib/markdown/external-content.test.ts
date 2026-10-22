import { describe, expect, test } from "bun:test";
import { isAllowedImageSrc, isHttpUrl } from "./external-content";

describe("isAllowedImageSrc", () => {
  test("allows same-origin absolute paths", () => {
    expect(isAllowedImageSrc("/logo.png")).toBe(true);
    expect(isAllowedImageSrc("/uploads/vraag-3/diagram.svg")).toBe(true);
  });

  test("allows base64 data URLs of image types", () => {
    for (const type of ["png", "jpeg", "gif", "webp", "svg+xml"]) {
      expect(isAllowedImageSrc(`data:image/${type};base64,iVBORw0KGgo=`)).toBe(
        true,
      );
    }
  });

  test("blocks external and protocol-relative URLs", () => {
    for (const src of [
      "https://evil.example/p.png",
      "http://evil.example/p.png",
      "//evil.example/p.png",
      "/\\evil.example/p.png",
      "ftp://x/y.png",
    ]) {
      expect(isAllowedImageSrc(src)).toBe(false);
    }
  });

  test("blocks other data URLs, relative paths and junk", () => {
    for (const src of [
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/png,rawdata",
      "data:image/bmp;base64,Qk0=",
      "javascript:alert(1)",
      "logo.png",
      "./logo.png",
      "",
      "   ",
      null,
      undefined,
    ]) {
      expect(isAllowedImageSrc(src)).toBe(false);
    }
  });
});

describe("isHttpUrl", () => {
  test("only http(s)", () => {
    expect(isHttpUrl("https://example.org")).toBe(true);
    expect(isHttpUrl("HTTP://example.org")).toBe(true);
    expect(isHttpUrl("/intern")).toBe(false);
    expect(isHttpUrl("mailto:a@b.nl")).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
  });
});
