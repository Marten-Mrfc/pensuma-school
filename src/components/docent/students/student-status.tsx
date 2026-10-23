"use client";

import { Lock, ShieldAlert } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Pill: Actief / Gedeactiveerd. */
export function StudentStatus({
  banned,
  className,
}: {
  banned: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        banned
          ? "bg-destructive/10 text-destructive-ink ring-destructive/25"
          : "bg-success/10 text-success-ink ring-success/25",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          banned ? "bg-destructive" : "bg-success",
        )}
      />
      {banned ? "Gedeactiveerd" : "Actief"}
    </span>
  );
}

const timeFormat = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

const LOCK_HELP =
  "Te veel verkeerde PIN-codes. Hef de blokkade op of wacht tot de tijd voorbij is.";

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
 * Warning pill “Geblokkeerd tot {HH:mm}” while a student's login is locked
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
            "inline-flex h-6 w-fit shrink-0 cursor-help items-center gap-1.5 rounded-full bg-warning/12 px-2.5 text-xs font-medium whitespace-nowrap text-warning-ink ring-1 ring-warning/30 ring-inset outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Lock className="size-3" aria-hidden="true" />
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
 * Pill “Verwerking beperkt (AVG art. 18)”: the student's data may only be
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
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full bg-warning/12 px-2.5 text-xs font-medium whitespace-nowrap text-warning-ink ring-1 ring-warning/30 ring-inset",
        className,
      )}
    >
      <ShieldAlert className="size-3" aria-hidden="true" />
      {RESTRICTED_LABEL}
    </span>
  );
}
