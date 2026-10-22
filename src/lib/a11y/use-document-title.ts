import { useEffect } from "react";

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

/**
 * Sets `document.title` for client-rendered pages whose title depends on data
 * (WCAG 2.4.2). Static pages export `metadata.title` instead.
 *
 * The title is deliberately not restored on unmount: Next sets the next
 * page's metadata title during navigation, and a cleanup that runs after it
 * would put the old title back. Hidden routes (<Activity>) re-run the effect
 * when they become visible again.
 */
export function useDocumentTitle(
  parts: readonly (string | null | undefined | false)[],
): void {
  const title = buildTitle(parts);
  useEffect(() => {
    document.title = title;
  }, [title]);
}
