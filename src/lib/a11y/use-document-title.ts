import { useLayoutEffect, useState } from "react";

const APP_NAME = "Pensuma";

/**
 * "Vraag 3 van 12 · Python basis · Pensuma". Empty parts are skipped; with no
 * parts the title is just "Pensuma".
 */
export function buildTitle(
  parts: readonly (string | null | undefined | false)[],
): string {
  return [...parts.filter(Boolean), APP_NAME].join(" · ");
}

/* ------------------------------------------------------------------------ */
/* Shared state: every mounted hook registers its title; the one that       */
/* rendered last (the innermost / most recent) wins.                        */
/* ------------------------------------------------------------------------ */

let nextOrder = 0;
const activeTitles = new Map<number, string>();
let observer: MutationObserver | null = null;

function winningTitle(): string | undefined {
  let best = -1;
  let title: string | undefined;
  for (const [order, value] of activeTitles) {
    if (order > best) {
      best = order;
      title = value;
    }
  }
  return title;
}

function applyTitle() {
  const title = winningTitle();
  if (title !== undefined && document.title !== title) document.title = title;
}

function startObserving() {
  if (observer || typeof MutationObserver === "undefined") return;
  // Next applies the route's metadata <title> after our effect on client
  // navigation (and again when streamed metadata resolves). Re-apply the
  // dynamic title whenever <title> changes while a hook is mounted.
  observer = new MutationObserver(applyTitle);
  observer.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function stopObserving() {
  observer?.disconnect();
  observer = null;
}

/**
 * Sets `document.title` for client-rendered pages whose title depends on data
 * (WCAG 2.4.2). Static pages export `metadata.title` instead.
 *
 * While mounted the title is kept: if Next later writes the route's metadata
 * title, it is applied again. The title is deliberately not restored on
 * unmount; the registration is removed in a layout-effect cleanup, before
 * Next's title for the next page is observed, so the old title never comes
 * back. Hidden routes (<Activity>) unregister and register again when they
 * become visible.
 */
export function useDocumentTitle(
  parts: readonly (string | null | undefined | false)[],
): void {
  const title = buildTitle(parts);
  // Parents render before children, so a nested hook gets a higher number.
  const [order] = useState(() => ++nextOrder);

  useLayoutEffect(() => {
    activeTitles.set(order, title);
    applyTitle();
    startObserving();
  }, [order, title]);

  useLayoutEffect(
    () => () => {
      activeTitles.delete(order);
      if (activeTitles.size === 0) stopObserving();
      // Another hook is still mounted (e.g. a parent): its title returns once
      // this commit is done.
      else queueMicrotask(applyTitle);
    },
    [order],
  );
}
