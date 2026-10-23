'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as React from 'react'

/**
 * Focus return and toaster pass-through for every dialog and sheet.
 *
 * Radix's modal dialog only returns focus to a `<DialogTrigger>` when it
 * closes. Dialogs opened by a plain button that sets state, a menu item, a
 * keyboard shortcut or the page itself have no trigger, so focus fell back to
 * `<body>` and keyboard and screen-reader users had to start again at the
 * skip link (WCAG 2.4.3 Focus Order). `FocusReturningContent` makes "back to
 * the element that opened it" the default for DialogContent,
 * DialogScrollContent, SheetContent and CommandDialog, so callers no longer
 * have to opt in.
 *
 * A caller's own `onCloseAutoFocus` runs first; when it calls
 * `preventDefault()` (the exam's fullscreen overlay, `returnFocusRef` props),
 * nothing here changes where focus goes.
 */

/** The bits of `document` the helpers need (a fake in unit tests). */
export interface FocusDocument {
  readonly activeElement: Element | null
  readonly body: Element | null
  getElementById(id: string): Element | null
}

function isFocusTarget(el: Element | null | undefined, doc: FocusDocument): el is HTMLElement {
  return !!el && el !== doc.body && typeof (el as HTMLElement).focus === 'function'
}

/**
 * The element focus should go back to when a dialog opened from `active`
 * closes: `active` itself, or for an item in a (Radix) dropdown menu the
 * button that opened the menu, because the item is gone by then. Menu content
 * is labelled by its trigger; submenus are followed up to the root menu.
 */
export function resolveFocusOpener(active: Element | null, doc: FocusDocument = document): HTMLElement | null {
  let el: Element | null = active
  for (let depth = 0; el && depth < 5; depth++) {
    const menu = el.closest('[role="menu"]')
    if (!menu) break
    const triggerId = menu.getAttribute('aria-labelledby')
    el = triggerId ? doc.getElementById(triggerId) : null
  }
  return isFocusTarget(el, doc) ? el : null
}

/**
 * `onCloseAutoFocus` default. Runs after the close animation, once the dialog
 * content is gone:
 * 1. a caller that already called `preventDefault()` decided: do nothing;
 * 2. focus is already on an element of the page (e.g. the question a button
 *    in the dialog jumped to): leave it there;
 * 3. otherwise focus the opener, or `fallback` when the opener is gone or
 *    can't take focus (a deleted row's button, a disabled button);
 * 4. with neither, Radix focuses the `<DialogTrigger>` if there is one.
 */
export function restoreFocusOnClose(
  event: Event,
  opener: HTMLElement | null,
  fallback?: HTMLElement | null,
  doc: FocusDocument = document,
): void {
  if (event.defaultPrevented) return
  const active = doc.activeElement
  if (active && active !== doc.body && active.isConnected) {
    event.preventDefault()
    return
  }
  for (const target of [opener, fallback]) {
    if (!target?.isConnected) continue
    target.focus()
    if (doc.activeElement === target) {
      event.preventDefault()
      return
    }
  }
}

/** True for events that start in the Sonner toaster ("Meldingen"). */
export function isFromToaster(target: EventTarget | null | undefined): boolean {
  const closest = (target as Element | null | undefined)?.closest
  return typeof closest === 'function' && !!(target as Element).closest('[data-sonner-toaster]')
}

type OutsideEvent = { target: EventTarget | null; preventDefault(): void }

/**
 * A toast stays usable while a dialog is open (globals.css gives the toaster
 * `pointer-events: auto` under Radix's `pointer-events: none` body): hovering
 * pauses it and its close button works. Clicking it must not count as a
 * click outside the dialog, which would close it and lose what was typed.
 */
function ignoreToaster<E extends OutsideEvent>(handler: ((event: E) => void) | undefined) {
  return (event: E) => {
    if (isFromToaster(event.target)) event.preventDefault()
    handler?.(event)
  }
}

export interface FocusReturningContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * Where focus goes on close when the element that opened the dialog no
   * longer exists or can't take focus (e.g. the row that was just deleted),
   * instead of the page body. A section heading or list container works well
   * (give it `tabIndex={-1}` if it isn't focusable).
   */
  returnFocusFallbackRef?: React.RefObject<HTMLElement | null>
}

/**
 * `DialogPrimitive.Content` with focus return to its opener. Render it as a
 * direct child of `DialogPrimitive.Portal` (or inside the Overlay): it then
 * mounts when the dialog opens.
 */
export const FocusReturningContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  FocusReturningContentProps
>(({ onCloseAutoFocus, onPointerDownOutside, onInteractOutside, returnFocusFallbackRef, ...props }, ref) => {
  // This component mounts when the dialog opens. React has not committed
  // anything during that first render, so the opener still has focus. Later
  // is too late: a child with autoFocus takes focus during the commit, before
  // any effect or Radix's onOpenAutoFocus could look.
  const [opener] = React.useState(() =>
    typeof document === 'undefined' ? null : resolveFocusOpener(document.activeElement),
  )

  return (
    <DialogPrimitive.Content
      ref={ref}
      {...props}
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event)
        restoreFocusOnClose(event, opener, returnFocusFallbackRef?.current)
      }}
      onPointerDownOutside={ignoreToaster(onPointerDownOutside)}
      onInteractOutside={ignoreToaster(onInteractOutside)}
    />
  )
})
FocusReturningContent.displayName = 'FocusReturningContent'
