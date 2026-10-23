import { type CSSProperties, useCallback, useState } from "react";

/**
 * CSS variable with the width of a table's sticky first column. The scroll
 * container uses it as `scroll-padding-left`, so the browser scrolls a
 * focused cell (or column header) out from under the opaque sticky column
 * instead of leaving it hidden there (WCAG 2.4.11 Focus Not Obscured).
 */
export const STICKY_COLUMN_VAR = "--sticky-col";

/** Tailwind class for the scroll container (fallback before measuring). */
export const STICKY_SCROLL_PADDING_CLASS =
  "scroll-pl-[var(--sticky-col,12rem)]";

/** The variable's value: the measured width, else the column's minimum. */
export function stickyColumnPadding(width: number | null | undefined): string {
  return width && Number.isFinite(width) && width > 0
    ? `${Math.ceil(width)}px`
    : "12rem";
}

/** Inline style that sets the variable for everything inside. */
export function stickyColumnStyle(
  width: number | null | undefined,
): CSSProperties {
  return { [STICKY_COLUMN_VAR]: stickyColumnPadding(width) } as CSSProperties;
}

/**
 * Measures the sticky column: pass `ref` to its header cell. Long names make
 * the column wider than its minimum, so a fixed padding would not do.
 */
export function useStickyColumnWidth() {
  const [width, setWidth] = useState<number | null>(null);
  // A callback ref (with cleanup): the column only exists once there are rows.
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
