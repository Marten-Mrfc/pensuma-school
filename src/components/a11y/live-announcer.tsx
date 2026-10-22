"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  ANNOUNCE_DELAY_MS,
  type AnnounceOptions,
  type DedupeState,
  decideAnnouncement,
} from "@/lib/a11y/announce";

export type { AnnounceOptions, Politeness } from "@/lib/a11y/announce";

export type Announce = (message: string, options?: AnnounceOptions) => void;

const AnnounceContext = createContext<Announce | null>(null);

let warnedMissingProvider = false;
const noopAnnounce: Announce = () => {
  if (process.env.NODE_ENV !== "production" && !warnedMissingProvider) {
    warnedMissingProvider = true;
    console.warn(
      "useAnnounce(): geen <LiveAnnouncerProvider> gevonden; meldingen worden niet voorgelezen.",
    );
  }
};

/**
 * Two persistent, visually hidden live regions (polite + assertive), mounted
 * once in the root layout. They exist and are empty at page load, which is
 * what screen readers need to pick up later changes reliably.
 */
export function LiveAnnouncerProvider({ children }: { children: ReactNode }) {
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);
  const dedupe = useRef<DedupeState>(new Map());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);

  const announce = useCallback<Announce>((message, options = {}) => {
    const decision = decideAnnouncement(
      dedupe.current,
      message,
      options,
      Date.now(),
    );
    dedupe.current = decision.state;
    if (!decision.speak) return;
    const region =
      options.politeness === "assertive"
        ? assertiveRef.current
        : politeRef.current;
    if (!region) return;
    // Clear first, so the same text is read again when repeated.
    region.textContent = "";
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      region.textContent = message;
    }, ANNOUNCE_DELAY_MS);
    timers.current.add(timer);
  }, []);

  const value = useMemo(() => announce, [announce]);

  return (
    <AnnounceContext value={value}>
      {children}
      {/* biome-ignore lint/a11y/useSemanticElements: an explicit status live region is the most robust across screen readers */}
      <div
        ref={politeRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="live-polite"
      />
      <div
        ref={assertiveRef}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-testid="live-assertive"
      />
    </AnnounceContext>
  );
}

/**
 * `announce(message, { politeness, dedupeKey, dedupeMs })` reads a message
 * aloud through the shared live regions. Without a provider it does nothing.
 */
export function useAnnounce(): Announce {
  return use(AnnounceContext) ?? noopAnnounce;
}
