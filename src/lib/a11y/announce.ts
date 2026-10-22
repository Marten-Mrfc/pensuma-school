/**
 * Pure logic behind `useAnnounce()` (src/components/a11y/live-announcer.tsx):
 * which announcements are spoken and which are dropped as repeats.
 */

export type Politeness = "polite" | "assertive";

export interface AnnounceOptions {
  /** `polite` (default) waits for the screen reader; `assertive` interrupts. */
  politeness?: Politeness;
  /**
   * Announcements with the same key within `dedupeMs` are dropped, e.g. so a
   * save indicator that flips back and forth is only read once.
   */
  dedupeKey?: string;
  /** Default 3000 ms. */
  dedupeMs?: number;
}

export const DEFAULT_DEDUPE_MS = 3000;

/** Delay between clearing a live region and setting its new text. */
export const ANNOUNCE_DELAY_MS = 50;

/** dedupeKey → time (ms) it was last announced. */
export type DedupeState = ReadonlyMap<string, number>;

export interface AnnounceDecision {
  /** False when the message is empty or a repeat within the window. */
  speak: boolean;
  /** The state to keep for the next call. */
  state: DedupeState;
}

/**
 * Decide whether an announcement is spoken. Pure: returns the next state
 * instead of mutating. Expired keys are pruned so the map stays small.
 */
export function decideAnnouncement(
  state: DedupeState,
  message: string,
  options: AnnounceOptions,
  now: number,
): AnnounceDecision {
  if (!message.trim()) return { speak: false, state };
  const windowMs = Math.max(0, options.dedupeMs ?? DEFAULT_DEDUPE_MS);
  const key = options.dedupeKey;
  const next = new Map<string, number>();
  for (const [k, at] of state) {
    // Keep keys that may still block a repeat (largest sensible window).
    if (now - at < Math.max(windowMs, DEFAULT_DEDUPE_MS * 10)) next.set(k, at);
  }
  if (key !== undefined) {
    const last = state.get(key);
    if (last !== undefined && now - last < windowMs) {
      return { speak: false, state: next };
    }
    next.set(key, now);
  }
  return { speak: true, state: next };
}
