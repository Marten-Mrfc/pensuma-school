"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { focusElementById } from "@/lib/a11y/focus";
import {
  PASSWORD_HELP,
  validateTeacherPassword,
} from "@/lib/security/password-policy";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { PasswordChecklist } from "./password-checklist";

type Field = "current" | "next" | "repeat";
type Errors = Partial<Record<Field | "form", string>>;

const SUCCESS_MESSAGE =
  "Je wachtwoord is gewijzigd. Je bent op andere apparaten uitgelogd.";

export interface ChangePasswordFormProps {
  /** For the password checks and the password manager's username. */
  email: string;
  name: string;
  /** Called after a successful change (the gate closes itself). */
  onChanged?: () => void;
  autoFocus?: boolean;
  submitLabel?: string;
  className?: string;
}

/** "Huidig wachtwoord", "Nieuw wachtwoord", "Herhaal nieuw wachtwoord". */
export function ChangePasswordForm({
  email,
  name,
  onChanged,
  autoFocus,
  submitLabel = "Wachtwoord wijzigen",
  className,
}: ChangePasswordFormProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const baseId = useId();
  const ids = {
    current: `${baseId}-current`,
    next: `${baseId}-next`,
    repeat: `${baseId}-repeat`,
    checklist: `${baseId}-checklist`,
  };
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const showErrors = (found: Errors) => {
    setErrors(found);
    const first = (["current", "next", "repeat"] as const).find(
      (f) => found[f],
    );
    if (first) requestAnimationFrame(() => focusElementById(ids[first]));
  };

  const change = useMutation(
    trpc.staff.changeMyPassword.mutationOptions({
      onSuccess: async () => {
        setCurrent("");
        setNext("");
        setRepeat("");
        setErrors({});
        toast.success(SUCCESS_MESSAGE);
        // staff.me, and everything that failed with "Wijzig eerst je
        // tijdelijke wachtwoord." while the gate was open.
        await queryClient.invalidateQueries();
        onChanged?.();
      },
      onError: (error) => {
        const fields = error.data?.zodError?.fieldErrors as
          | Record<string, string[] | undefined>
          | undefined;
        const currentError = fields?.currentPassword?.[0];
        const nextError = fields?.newPassword?.[0];
        if (currentError || nextError) {
          showErrors({ current: currentError, next: nextError });
        } else {
          setErrors({ form: getErrorMessage(error) });
        }
      },
    }),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    if (!current) found.current = "Vul je huidige wachtwoord in.";
    const policy = validateTeacherPassword(next, { email, name });
    if (!policy.ok) found.next = policy.message;
    else if (next === current)
      found.next = "Kies een ander wachtwoord dan je huidige.";
    if (!found.next && repeat !== next)
      found.repeat = "De wachtwoorden zijn niet hetzelfde.";
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }
    setErrors({});
    change.mutate({ currentPassword: current, newPassword: next });
  }

  const busy = change.isPending;

  return (
    <form
      onSubmit={submit}
      noValidate
      className={cn("flex flex-col gap-4", className)}
      aria-busy={busy}
    >
      {/* Lets password managers store the new password for this account. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
        aria-hidden="true"
        tabIndex={-1}
      />
      <FormField
        label="Huidig wachtwoord"
        htmlFor={ids.current}
        error={errors.current}
        required
      >
        <PasswordInput
          id={ids.current}
          name="current-password"
          placeholder=""
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoFocus={autoFocus}
          className={errors.current ? "border-destructive" : undefined}
        />
      </FormField>
      <FormField
        label="Nieuw wachtwoord"
        htmlFor={ids.next}
        error={errors.next}
        description={PASSWORD_HELP}
        required
      >
        <PasswordInput
          id={ids.next}
          name="new-password"
          placeholder=""
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-describedby={ids.checklist}
          className={errors.next ? "border-destructive" : undefined}
        />
      </FormField>
      <FormField
        label="Herhaal nieuw wachtwoord"
        htmlFor={ids.repeat}
        error={errors.repeat}
        required
      >
        <PasswordInput
          id={ids.repeat}
          name="repeat-password"
          placeholder=""
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          className={errors.repeat ? "border-destructive" : undefined}
        />
      </FormField>
      <PasswordChecklist
        id={ids.checklist}
        password={next}
        repeat={repeat}
        context={{ email, name }}
      />
      {errors.form ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
        >
          {errors.form}
        </p>
      ) : null}
      <Button type="submit" className="w-fit" disabled={busy}>
        {busy ? (
          <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
        ) : null}
        {busy ? "Bezig met opslaan…" : submitLabel}
      </Button>
    </form>
  );
}
