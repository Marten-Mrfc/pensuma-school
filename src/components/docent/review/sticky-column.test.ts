import { describe, expect, test } from "bun:test";
import {
  revealFocusedCell,
  STICKY_COLUMN_VAR,
  STICKY_SCROLL_PADDING_CLASS,
  stickyColumnPadding,
  stickyColumnStyle,
} from "./sticky-column";

describe("sticky first column: scroll padding (A05)", () => {
  test("the scroll container pads by the column's measured width", () => {
    expect(stickyColumnPadding(192)).toBe("192px");
    // Rounded up, so a sub-pixel width never leaves a sliver covered.
    expect(stickyColumnPadding(231.2)).toBe("232px");
  });

  test("before measuring, the column's minimum width (min-w-48)", () => {
    expect(stickyColumnPadding(null)).toBe("12rem");
    expect(stickyColumnPadding(undefined)).toBe("12rem");
    expect(stickyColumnPadding(0)).toBe("12rem");
    expect(stickyColumnPadding(Number.NaN)).toBe("12rem");
  });

  test("the style sets the variable the padding class reads", () => {
    expect(stickyColumnStyle(200) as Record<string, string>).toEqual({
      [STICKY_COLUMN_VAR]: "200px",
    });
    expect(STICKY_SCROLL_PADDING_CLASS).toBe(
      `scroll-pl-[var(${STICKY_COLUMN_VAR},12rem)]`,
    );
  });
});

describe("revealFocusedCell: partly visible cells scroll fully into view", () => {
  function target(opts: {
    inCell?: boolean;
    sticky?: boolean;
    keyboard?: boolean;
  }) {
    const calls: ScrollIntoViewOptions[] = [];
    return {
      calls,
      el: {
        closest: (selector: string) =>
          selector === "td, th"
            ? (opts.inCell ?? true) || null
            : selector === "[data-sticky-col]"
              ? opts.sticky || null
              : null,
        matches: (selector: string) =>
          selector === ":focus-visible" && (opts.keyboard ?? true),
        scrollIntoView: (o: ScrollIntoViewOptions) => calls.push(o),
      },
    };
  }

  test("a score link or column header reached with the keyboard", () => {
    const t = target({});
    revealFocusedCell({ target: t.el });
    expect(t.calls).toEqual([{ block: "nearest", inline: "nearest" }]);
  });

  test("not for the sticky name column, mouse focus or the region itself", () => {
    for (const opts of [
      { sticky: true },
      { keyboard: false },
      { inCell: false },
    ]) {
      const t = target(opts);
      revealFocusedCell({ target: t.el });
      expect(t.calls).toEqual([]);
    }
    expect(() => revealFocusedCell({ target: null })).not.toThrow();
  });
});
