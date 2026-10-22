"use client";

import { useRef } from "react";

/**
 * Returns focus to the control that opened a dialog or sheet (WCAG 2.4.3).
 *
 * Radix only restores focus to a `DialogTrigger`. Dialogs opened from a
 * dropdown menu item or a button that sets state have no trigger, so focus
 * would fall back to the page body when they close. Spread the handlers on
 * `DialogContent` / `SheetContent`:
 *
 *   const returnFocus = useDialogReturnFocus();
 *   <DialogContent {...returnFocus}>
 *
 * When the dialog was opened from a menu item, focus goes back to the
 * button that opened the menu (the menu item itself is gone by then).
 */
export function useDialogReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      // Still the element that opened the dialog at this point.
      opener.current = resolveOpener(document.activeElement);
    },
    onCloseAutoFocus: (event: Event) => {
      const el = opener.current;
      opener.current = null;
      if (el?.isConnected) {
        event.preventDefault();
        el.focus();
      }
    },
  };
}

function resolveOpener(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const menu = active.closest('[role="menu"]');
  if (menu) {
    const triggerId = menu.getAttribute("aria-labelledby");
    const trigger = triggerId ? document.getElementById(triggerId) : null;
    return trigger instanceof HTMLElement ? trigger : null;
  }
  return active;
}
