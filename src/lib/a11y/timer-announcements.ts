/**
 * Pure logic for the screen-reader announcements of the exam countdown
 * (CountdownTimer): 10, 5 and 1 minute warnings, "De tijd is om." and extra
 * time given by the teacher (WCAG 2.2.1 Timing Adjustable).
 */

import type { Politeness } from "./announce";

/** Warning moments in minutes, largest first. */
export const TIMER_THRESHOLDS_MIN = [10, 5, 1] as const;

/** Extra time below this is treated as a clock correction, not announced. */
export const EXTENSION_MIN_MS = 60_000;

/**
 * Dedupe key of the "time is up" announcement. The exam runner announces its
 * own, more specific message with the same key ("De tijd is om. Je
 * antwoorden worden ingeleverd."), so only one of the two is spoken instead
 * of the second one cutting off the first.
 */
export const TIME_UP_DEDUPE_KEY = "time-up";

export interface TimerAnnouncement {
  text: string;
  politeness: Politeness;
  /** Passed to `announce()`; only set for the time-up message. */
  dedupeKey?: string;
}

export interface TimerAnnouncementState {
  /** The deadline the state belongs to; null before the first tick. */
  deadlineMs: number | null;
  /** Thresholds (minutes) already announced or passed for this deadline. */
  announced: ReadonlySet<number>;
  expired: boolean;
}

export const INITIAL_TIMER_STATE: TimerAnnouncementState = {
  deadlineMs: null,
  announced: new Set(),
  expired: false,
};

function thresholdText(minutes: number): string {
  return minutes === 1
    ? "Let op: je hebt nog 1 minuut."
    : `Let op: je hebt nog ${minutes} minuten.`;
}

/** "12 minuten", "1 uur en 5 minuten", "minder dan 1 minuut". */
export function spokenDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return "minder dan 1 minuut";
  const minutes = Math.round(totalSeconds / 60);
  const minuteText = (m: number) => (m === 1 ? "1 minuut" : `${m} minuten`);
  if (minutes < 60) return minuteText(minutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} uur en ${minuteText(m)}` : `${h} uur`;
}

function passedThresholds(remainingMs: number): number[] {
  return TIMER_THRESHOLDS_MIN.filter((t) => remainingMs <= t * 60_000);
}

/**
 * Given the previous state, the current deadline and the remaining time,
 * return what to announce now and the next state. Thresholds that were
 * already passed when the timer first rendered are never announced; when
 * several are crossed at once only the smallest is spoken.
 */
export function nextTimerAnnouncements(
  state: TimerAnnouncementState,
  deadlineMs: number,
  remainingMs: number,
): { messages: TimerAnnouncement[]; state: TimerAnnouncementState } {
  const remaining = Math.max(0, remainingMs);

  // First tick: silently mark everything that has already happened.
  if (state.deadlineMs === null) {
    return {
      messages: [],
      state: {
        deadlineMs,
        announced: new Set(passedThresholds(remaining)),
        expired: remaining <= 0,
      },
    };
  }

  const messages: TimerAnnouncement[] = [];
  let announced = new Set(state.announced);
  let expired = state.expired;

  if (deadlineMs !== state.deadlineMs) {
    const extended = deadlineMs - state.deadlineMs >= EXTENSION_MIN_MS;
    if (extended && remaining > 0) {
      messages.push({
        text: `Je docent heeft je extra tijd gegeven. Je hebt nu nog ${spokenDuration(Math.ceil(remaining / 1000))}.`,
        politeness: "polite",
      });
      // Thresholds that lie in the future again may be announced again.
      announced = new Set(
        [...announced].filter((t) => remaining <= t * 60_000),
      );
      expired = false;
    }
  }

  if (remaining <= 0) {
    if (!expired) {
      messages.push({
        text: "De tijd is om.",
        politeness: "assertive",
        dedupeKey: TIME_UP_DEDUPE_KEY,
      });
      expired = true;
    }
    announced = new Set(TIMER_THRESHOLDS_MIN);
  } else {
    const crossed = passedThresholds(remaining).filter(
      (t) => !announced.has(t),
    );
    if (crossed.length > 0) {
      const smallest = Math.min(...crossed);
      messages.push({ text: thresholdText(smallest), politeness: "polite" });
      for (const t of crossed) announced.add(t);
    }
  }

  return { messages, state: { deadlineMs, announced, expired } };
}
