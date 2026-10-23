"use client";

import { AlarmClock, Timer } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAnnounce } from "@/components/a11y/live-announcer";
import {
  INITIAL_TIMER_STATE,
  nextTimerAnnouncements,
  type TimerAnnouncementState,
} from "@/lib/a11y/timer-announcements";
import { cn } from "@/lib/utils";

export interface CountdownTimerProps {
  /** Moment the time is up. */
  deadline: Date | string;
  /**
   * Server clock minus client clock, in ms (`serverNow - Date.now()`), so the
   * countdown follows the server even when the student's laptop clock is off.
   */
  serverOffsetMs?: number;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
  /**
   * Screen-reader announcements at 10, 5 and 1 minute, at the end and when
   * extra time is given. Default true; turn off for a second timer on the
   * same page so nothing is read twice.
   */
  announce?: boolean;
  /**
   * Show only an icon ("Timer verborgen"), e.g. when the student switched
   * the timer off in the display preferences. Announcements continue.
   */
  hidden?: boolean;
  className?: string;
}

const WARNING_MS = 5 * 60 * 1000;
const DANGER_MS = 60 * 1000;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function format(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** The time left as the timer's accessible name: "Nog 1 uur en 1 minuut". */
export function spokenRemaining(totalSeconds: number) {
  if (totalSeconds <= 0) return "De tijd is om";
  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `Nog ${h} uur${m ? ` en ${m === 1 ? "1 minuut" : `${m} minuten`}` : ""}`;
  }
  return minutes === 1 ? "Nog minder dan 1 minuut" : `Nog ${minutes} minuten`;
}

/** Exam countdown: hh:mm:ss / mm:ss, amber under 5 minutes, red under 1 minute. */
export function CountdownTimer({
  deadline,
  serverOffsetMs = 0,
  onExpire,
  announce: announceEnabled = true,
  hidden = false,
  className,
}: CountdownTimerProps) {
  const announce = useAnnounce();
  const deadlineMs = new Date(deadline).getTime();
  // null until mounted: the server cannot know the client's clock.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now() + serverOffsetMs;
      setNow(current);
      const remaining = deadlineMs - current;
      if (remaining <= 0) return;
      // Wake up right after the next whole-second boundary.
      const delay = remaining % 1000 || 1000;
      timeout = setTimeout(tick, delay + 15);
    };
    tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timeout);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [deadlineMs, serverOffsetMs]);

  const remainingMs = now === null ? null : Math.max(0, deadlineMs - now);
  const expired = remainingMs === 0;

  const fireExpire = useEffectEvent(() => onExpire?.());
  useEffect(() => {
    if (expired) fireExpire();
  }, [expired]);

  // Each threshold is announced once per deadline; see timer-announcements.ts.
  const announcementState = useRef<TimerAnnouncementState>(INITIAL_TIMER_STATE);
  const speak = useEffectEvent((ms: number) => {
    const result = nextTimerAnnouncements(
      announcementState.current,
      deadlineMs,
      ms,
    );
    announcementState.current = result.state;
    if (!announceEnabled) return;
    for (const message of result.messages) {
      announce(message.text, {
        politeness: message.politeness,
        dedupeKey: message.dedupeKey,
      });
    }
  });
  useEffect(() => {
    if (remainingMs !== null) speak(remainingMs);
  }, [remainingMs]);

  const totalSeconds =
    remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const tone =
    remainingMs === null
      ? "normal"
      : remainingMs <= DANGER_MS
        ? "danger"
        : remainingMs <= WARNING_MS
          ? "warning"
          : "normal";

  const Icon = tone === "normal" ? Timer : AlarmClock;

  if (hidden) {
    // Neutral on purpose: no colour change that gives the time away.
    return (
      <div
        data-hidden=""
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-xs",
          className,
        )}
      >
        <Timer className="size-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">Timer verborgen</span>
      </div>
    );
  }

  return (
    <div
      role="timer"
      aria-label={
        totalSeconds === null
          ? "Resterende tijd"
          : `Resterende tijd: ${spokenRemaining(totalSeconds)}`
      }
      data-tone={tone}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 font-mono text-sm font-medium tabular-nums shadow-xs transition-colors",
        tone === "normal" && "border-border bg-card text-foreground",
        tone === "warning" &&
          "border-warning/40 bg-warning/12 text-warning-ink",
        tone === "danger" &&
          "border-destructive/40 bg-destructive/10 text-destructive-ink",
        className,
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          tone === "danger" &&
            "motion-safe:animate-pulse motion-safe:[animation-iteration-count:3]",
        )}
        aria-hidden="true"
      />
      <span aria-hidden="true">
        {totalSeconds === null ? "--:--" : format(totalSeconds)}
      </span>
    </div>
  );
}
