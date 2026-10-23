"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Shared classes for the small status tags on the student screens. */
const TAG =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap";

/** "Actief" as plain text (the normal state); a tag only for "Gedeactiveerd". */
export function StudentStatus({
  banned,
  className,
}: {
  banned: boolean;
  className?: string;
}) {
  if (!banned)
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        Actief
      </span>
    );
  return (
    <span
      className={cn(TAG, "bg-destructive/10 text-destructive-ink", className)}
    >
      Gedeactiveerd
    </span>
  );
}

const timeFormat = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

const LOCK_HELP =
  "Te veel verkeerde pincodes. Hef de blokkade op of wacht tot de tijd voorbij is.";

/** Is the login lock still active? */
export function isLoginLocked(
  lockedUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lockedUntil) return false;
  const until =
    lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);
  return !Number.isNaN(until.getTime()) && until > now;
}

/**
 * Warning tag “Geblokkeerd tot {HH:mm}” while a student's login is locked
 * after too many wrong PINs. Focusable, so the explanation (tooltip) also
 * works with the keyboard; screen readers get it as part of the name.
 */
export function LoginLockBadge({
  lockedUntil,
  className,
}: {
  lockedUntil: Date | string | null | undefined;
  className?: string;
}) {
  if (!lockedUntil || !isLoginLocked(lockedUntil)) return null;
  const until =
    lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);
  const time = timeFormat.format(until);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            TAG,
            "cursor-help bg-warning/15 text-warning-ink outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          Geblokkeerd tot {time}
          <span className="sr-only">. {LOCK_HELP}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{LOCK_HELP}</TooltipContent>
    </Tooltip>
  );
}

/** Badge text for a student whose processing is restricted (AVG art. 18). */
export const RESTRICTED_LABEL = "Verwerking beperkt (AVG art. 18)";

/**
 * Tag “Verwerking beperkt (AVG art. 18)”: the student's data may only be
 * stored (privacy.setRestriction). Renders nothing when not restricted.
 */
export function RestrictedBadge({
  restricted,
  className,
}: {
  restricted: boolean | null | undefined;
  className?: string;
}) {
  if (!restricted) return null;
  return (
    <span className={cn(TAG, "bg-warning/15 text-warning-ink", className)}>
      {RESTRICTED_LABEL}
    </span>
  );
}
