/**
 * Privacy rule for teacher-authored Markdown: students' browsers must not
 * contact third parties just by opening a question (AVG; no tracking pixels,
 * no IP leaks). Only images served by Pensuma itself or embedded as data URLs
 * are loaded; everything else becomes a click-to-open link.
 */

const DATA_IMAGE =
  /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i;

/**
 * True for same-origin paths ("/uploads/x.png", not "//host/x.png") and
 * base64 data URLs of common image types.
 */
export function isAllowedImageSrc(src: string | null | undefined): boolean {
  if (typeof src !== "string") return false;
  const value = src.trim();
  if (!value) return false;
  if (value.startsWith("/")) {
    // "//host" is protocol-relative, "/\host" is treated like it by browsers.
    return !value.startsWith("//") && !value.startsWith("/\\");
  }
  return DATA_IMAGE.test(value);
}

/** True for absolute http(s) URLs, the only external links we render. */
export function isHttpUrl(href: string | null | undefined): boolean {
  return typeof href === "string" && /^https?:\/\//i.test(href.trim());
}
