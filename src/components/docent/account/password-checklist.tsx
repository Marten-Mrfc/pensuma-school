"use client";

import { Check } from "lucide-react";
import {
  checkPassword,
  type PasswordContext,
} from "@/lib/security/password-policy";
import { cn } from "@/lib/utils";

function Requirement({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 transition-colors",
        ok ? "text-success-ink" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
          ok
            ? "border-transparent bg-success text-success-foreground"
            : "border-border",
        )}
        aria-hidden="true"
      >
        {ok ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
      </span>
      {children}
      <span className="sr-only">
        {ok ? " (in orde)" : " (nog niet in orde)"}
      </span>
    </li>
  );
}

export interface PasswordChecklistProps {
  /** id for aria-describedby on the password field. */
  id?: string;
  password: string;
  /** When given, also shows "Beide wachtwoorden zijn gelijk". */
  repeat?: string;
  context?: PasswordContext;
  className?: string;
}

/**
 * Live checklist of the teacher password policy. Not a live region: it is
 * linked to the field with aria-describedby, and the form reports the
 * first broken rule on submit.
 */
export function PasswordChecklist({
  id,
  password,
  repeat,
  context,
  className,
}: PasswordChecklistProps) {
  const checks = checkPassword(password, context);
  const started = password.length > 0;
  return (
    <ul
      id={id}
      className={cn("flex flex-col gap-1.5 text-sm", className)}
      aria-label="Eisen voor je wachtwoord"
    >
      <Requirement ok={checks.longEnough && checks.notTooLong}>
        Minstens 12 tekens
      </Requirement>
      <Requirement ok={started && checks.notGuessable}>
        Niet makkelijk te raden
      </Requirement>
      <Requirement ok={started && checks.notPersonal}>
        Zonder je naam, e-mailadres of ‘Pensuma’
      </Requirement>
      {repeat !== undefined ? (
        <Requirement ok={started && password === repeat}>
          Beide wachtwoorden zijn gelijk
        </Requirement>
      ) : null}
    </ul>
  );
}
