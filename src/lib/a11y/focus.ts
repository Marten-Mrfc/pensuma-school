/**
 * Focus helpers.
 *
 * Page-level element ids must come from React's `useId()`, never from a fixed
 * string: with cacheComponents, Next keeps up to three recently visited routes
 * hidden in the DOM (<Activity>), so a static id can exist twice and
 * `getElementById` would return the hidden copy. Only the shells' `inhoud`
 * (skip-link target) is static.
 */

const NATIVELY_FOCUSABLE =
  "a[href], area[href], button, input, select, textarea, iframe, summary, [contenteditable=''], [contenteditable='true']";

function isFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute("tabindex")) return true;
  return el.matches(NATIVELY_FOCUSABLE);
}

/**
 * Focus the element with this id. Elements that are not focusable (headings,
 * containers) get `tabIndex = -1` first, so they receive programmatic focus
 * without becoming a tab stop. Returns false when the element doesn't exist.
 */
export function focusElementById(
  id: string,
  options: { preventScroll?: boolean } = {},
): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(id);
  if (!el) return false;
  if (!isFocusable(el)) el.tabIndex = -1;
  el.focus({ preventScroll: options.preventScroll ?? false });
  return document.activeElement === el;
}

/**
 * The element to return focus to after a dialog closes: the preferred element
 * when it is still in the document, else the fallback (when connected).
 */
export function getFocusReturnTarget(
  preferred: HTMLElement | null | undefined,
  fallback: HTMLElement | null | undefined,
): HTMLElement | null {
  if (preferred?.isConnected) return preferred;
  if (fallback?.isConnected) return fallback;
  return null;
}
