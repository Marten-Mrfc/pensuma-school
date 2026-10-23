"use client";

import { type KeyboardEvent, useRef } from "react";

/**
 * Keyboard model of a radio group built from buttons with role="radio"
 * (card-style options, segmented controls). The role promises the native
 * radio behaviour, so the group must deliver it (WCAG 4.1.2):
 *  - one Tab stop: the checked option (the first when none is checked);
 *  - arrow keys move to the next/previous option, wrap at the ends and
 *    select it; Home and End go to the first and last option.
 */

/** The option index a key moves to, or null for keys the group ignores. */
export function rovingRadioTarget(
  key: string,
  index: number,
  count: number,
): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** tabIndex of an option: only the checked one (or the first) is a Tab stop. */
export function rovingTabIndex(index: number, checkedIndex: number): 0 | -1 {
  const stop = checkedIndex >= 0 ? checkedIndex : 0;
  return index === stop ? 0 : -1;
}

export interface RovingRadioItemProps {
  ref: (el: HTMLElement | null) => void;
  tabIndex: 0 | -1;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Props for each option of a role="radiogroup":
 *
 *   const radios = useRovingRadioGroup({ count, checkedIndex, onSelect });
 *   <button role="radio" aria-checked={…} {...radios.itemProps(i)} />
 *
 * `onSelect(index)` must do the same as clicking that option.
 */
export function useRovingRadioGroup({
  count,
  checkedIndex,
  onSelect,
}: {
  count: number;
  checkedIndex: number;
  onSelect: (index: number) => void;
}) {
  const items = useRef<(HTMLElement | null)[]>([]);

  function itemProps(index: number): RovingRadioItemProps {
    return {
      ref: (el) => {
        items.current[index] = el;
      },
      tabIndex: rovingTabIndex(index, checkedIndex),
      onKeyDown: (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const target = rovingRadioTarget(e.key, index, count);
        if (target === null) return;
        e.preventDefault();
        onSelect(target);
        items.current[target]?.focus();
      },
    };
  }

  return { itemProps };
}
