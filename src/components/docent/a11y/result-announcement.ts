"use client";

import { useEffect, useRef } from "react";
import { useAnnounce } from "@/components/a11y/live-announcer";

/**
 * Status messages for search and filter results (WCAG 4.1.3): when the
 * teacher changes a search or filter, the visible result count ("12
 * leerlingen gevonden", "Geen toetsen gevonden") is also read aloud.
 *
 * Only a change the user made is announced: never the first load, and
 * never background polling (the key stays the same then).
 */

export type AnnouncementStep = "remember" | "announce" | "skip";

/**
 * What to do when the results for `key` are ready:
 * - "remember": the first result (page load), remember the key silently;
 * - "announce": the search/filter changed since the last announcement;
 * - "skip": same search/filter (e.g. a poll or refetch).
 */
export function nextAnnouncementStep(
  lastKey: string | null,
  key: string,
): AnnouncementStep {
  if (lastKey === null) return "remember";
  return lastKey === key ? "skip" : "announce";
}

/**
 * Announce `message` once the results for a new `key` are `ready`.
 *
 * @param key identifies the search/filter combination (not the data)
 * @param ready true once the results for `key` are on screen (not while
 *   loading or showing placeholder data)
 * @param message what is on screen, e.g. "3 leerlingen gevonden."
 * @param delayMs wait this long (for search boxes that filter while typing)
 */
export function useResultAnnouncement({
  key,
  ready,
  message,
  delayMs = 0,
}: {
  key: string;
  ready: boolean;
  message: string;
  delayMs?: number;
}) {
  const announce = useAnnounce();
  const lastKey = useRef<string | null>(null);
  const latestMessage = useRef(message);
  useEffect(() => {
    latestMessage.current = message;
  });

  useEffect(() => {
    if (!ready) return;
    const step = nextAnnouncementStep(lastKey.current, key);
    if (step === "remember") {
      lastKey.current = key;
      return;
    }
    if (step === "skip") return;
    const timer = setTimeout(() => {
      lastKey.current = key;
      announce(latestMessage.current);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [key, ready, delayMs, announce]);
}
