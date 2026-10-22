import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia?.(QUERY);
  media?.addEventListener("change", onChange);
  // The user preference lives on <html data-motion="reduce"> (PreferencesSync).
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-motion"],
  });
  return () => {
    media?.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/** True when the OS asks for less motion or the user chose it in Pensuma. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const system = window.matchMedia?.(QUERY).matches ?? false;
  return (
    system || document.documentElement.getAttribute("data-motion") === "reduce"
  );
}

/**
 * React hook for JS-driven motion (WAAPI, scrollIntoView, canvas charts) that
 * the CSS reduced-motion floor in globals.css can't reach. Server snapshot:
 * false.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
