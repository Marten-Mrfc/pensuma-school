"use client";

import { AlarmClock, Timer } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
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

function spokenRemaining(totalSeconds: number) {
  if (totalSeconds <= 0) return "De tijd is om";
  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `Nog ${h} uur${m ? ` en ${m} minuten` : ""}`;
  }
  return minutes === 1 ? "Nog minder dan 1 minuut" : `Nog ${minutes} minuten`;
}

/** Exam countdown: hh:mm:ss / mm:ss, amber under 5 minutes, red under 1 minute. */
export function CountdownTimer({
  deadline,
  serverOffsetMs = 0,
  onExpire,
  className,
}: CountdownTimerProps) {
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

  const totalSeconds = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const tone =
    remainingMs === null
      ? "normal"
      : remainingMs <= DANGER_MS
        ? "danger"
        : remainingMs <= WARNING_MS
          ? "warning"
          : "normal";

  // Only changes at the thresholds, so screen readers hear it at the right moments.
  const announcement =
    remainingMs === null
      ? ""
      : expired
        ? "De tijd is om."
        : remainingMs <= DANGER_MS
          ? "Let op: nog minder dan 1 minuut."
          : remainingMs <= WARNING_MS
            ? "Let op: nog minder dan 5 minuten."
            : "";

  const Icon = tone === "normal" ? Timer : AlarmClock;

  return (
    <div
      role="timer"
      aria-label={
        totalSeconds === null ? "Resterende tijd" : `Resterende tijd: ${spokenRemaining(totalSeconds)}`
      }
      data-tone={tone}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 font-mono text-sm font-medium tabular-nums shadow-xs transition-colors",
        tone === "normal" && "border-border bg-card text-foreground",
        tone === "warning" && "border-warning/40 bg-warning/12 text-warning-ink",
        tone === "danger" &&
          "border-destructive/40 bg-destructive/10 text-destructive-ink motion-safe:animate-pulse",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">{totalSeconds === null ? "--:--" : format(totalSeconds)}</span>
      <span className="sr-only" aria-live="assertive">
        {announcement}
      </span>
    </div>
  );
}
