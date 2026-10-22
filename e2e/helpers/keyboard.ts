/** Keyboard-only navigation helpers and live-region recording. */
import { expect, type Page } from "@playwright/test";

export type FocusInfo = {
  tag: string;
  role: string | null;
  name: string;
  href: string | null;
  inEditor: boolean;
  inDialog: boolean;
};

/** Describe document.activeElement. */
export async function focused(page: Page): Promise<FocusInfo> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return {
        tag: "body",
        role: null,
        name: "",
        href: null,
        inEditor: false,
        inDialog: false,
      };
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    const labelText = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
      : "";
    const forLabel = (el as HTMLInputElement).labels?.[0]?.textContent ?? "";
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      name: (
        el.getAttribute("aria-label") ||
        labelText ||
        forLabel ||
        el.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim(),
      href: el.getAttribute("href"),
      inEditor: !!el.closest(".cm-editor"),
      inDialog: !!el.closest('[role="dialog"], [role="alertdialog"]'),
    };
  });
}

/** Press Tab until `match` accepts the focused element (fails after `max`). */
export async function tabTo(
  page: Page,
  match: (f: FocusInfo) => boolean,
  opts: { max?: number; shift?: boolean } = {},
): Promise<FocusInfo> {
  const max = opts.max ?? 60;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(opts.shift ? "Shift+Tab" : "Tab");
    const f = await focused(page);
    if (match(f)) return f;
  }
  throw new Error(`tabTo: no matching element within ${max} Tab presses`);
}

/**
 * Record every text the shared live regions (data-testid live-polite /
 * live-assertive) show from now on. Read it back with `liveLog(page)`.
 */
export async function recordLiveRegions(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __live?: { polite: string[]; assertive: string[] };
    };
    w.__live = { polite: [], assertive: [] };
    for (const kind of ["polite", "assertive"] as const) {
      const region = document.querySelector(`[data-testid="live-${kind}"]`);
      if (!region) continue;
      new MutationObserver(() => {
        const text = region.textContent?.trim();
        if (text) w.__live?.[kind].push(text);
      }).observe(region, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  });
}

export async function liveLog(
  page: Page,
): Promise<{ polite: string[]; assertive: string[] }> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __live?: { polite: string[]; assertive: string[] };
    };
    return w.__live ?? { polite: [], assertive: [] };
  });
}

/** The focus indicator of the focused element is visible (not "none"). */
export async function expectVisibleFocusIndicator(page: Page) {
  const style = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      outlineStyle: cs.outlineStyle,
      outlineWidth: Number.parseFloat(cs.outlineWidth),
      boxShadow: cs.boxShadow,
    };
  });
  expect(style).not.toBeNull();
  const hasOutline =
    style?.outlineStyle !== "none" && (style?.outlineWidth ?? 0) >= 1;
  const hasRing = !!style?.boxShadow && style.boxShadow !== "none";
  expect(hasOutline || hasRing, JSON.stringify(style)).toBe(true);
}
