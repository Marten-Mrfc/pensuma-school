"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useId, useState } from "react";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { focusElementById } from "@/lib/a11y/focus";
import { ADMIN_MIN_PASSWORD_LENGTH } from "@/lib/auth-shared";
import {
  PASSWORD_HELP,
  validateTeacherPassword,
} from "@/lib/security/password-policy";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { PasswordChecklist } from "../account/password-checklist";
import { TemporaryPasswordView } from "./temporary-password-view";

type Mode = "generate" | "manual";
const MODES: readonly Mode[] = ["generate", "manual"];

export interface AddTeacherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "Docent toevoegen": shows the generated temporary password once. */
export function AddTeacherDialog({
  open,
  onOpenChange,
}: AddTeacherDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? <AddTeacherForm onOpenChange={onOpenChange} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddTeacherForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<Mode>("generate");
  const baseId = useId();
  const ids = {
    name: `${baseId}-name`,
    email: `${baseId}-email`,
    password: `${baseId}-password`,
    checklist: `${baseId}-checklist`,
    legend: `${baseId}-legend`,
    mode: (m: Mode) => `${baseId}-mode-${m}`,
  };
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    form?: string;
  }>({});
  const [result, setResult] = useState<{
    name: string;
    email: string;
    password: string | null;
  } | null>(null);

  const create = useMutation(
    trpc.staff.create.mutationOptions({
      onSuccess: async (res) => {
        await queryClient.invalidateQueries({ queryKey: trpc.staff.pathKey() });
        setResult({
          name: res.user.name,
          email: res.user.email,
          password: res.temporaryPassword,
        });
      },
      onError: (e) => {
        const fields = e.data?.zodError?.fieldErrors as
          | Record<string, string[] | undefined>
          | undefined;
        const found = {
          name: fields?.name?.[0],
          email: fields?.email?.[0],
          password: fields?.password?.[0],
        };
        if (found.name || found.email || found.password) showErrors(found);
        else setErrors({ form: getErrorMessage(e) });
      },
    }),
  );

  function showErrors(found: typeof errors) {
    setErrors(found);
    const first = (["name", "email", "password"] as const).find(
      (f) => found[f],
    );
    if (first) requestAnimationFrame(() => focusElementById(ids[first]));
  }

  function onModeKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const nextMode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    setMode(nextMode);
    focusElementById(ids.mode(nextMode));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Vul de naam van de docent in.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "Vul een geldig e-mailadres in.";
    if (mode === "manual") {
      const policy = validateTeacherPassword(password, {
        email: email.trim(),
        name: name.trim(),
      });
      if (!policy.ok) next.password = policy.message;
    }
    if (Object.keys(next).length > 0) {
      showErrors(next);
      return;
    }
    setErrors({});
    create.mutate({
      name: name.trim(),
      email: email.trim(),
      password: mode === "manual" ? password : undefined,
    });
  }

  if (result) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Docent toegevoegd</DialogTitle>
          <DialogDescription>
            {result.name} kan nu inloggen met{" "}
            <span className="font-medium text-foreground">{result.email}</span>
            {result.password
              ? " en dit tijdelijke wachtwoord."
              : " en het wachtwoord dat je hebt gekozen."}
          </DialogDescription>
        </DialogHeader>
        {result.password ? (
          <TemporaryPasswordView
            email={result.email}
            password={result.password}
          />
        ) : null}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Klaar</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>Docent toevoegen</DialogTitle>
        <DialogDescription>
          Een docent kan klassen, leerlingen, toetsen en afnames beheren en
          andere docenten toevoegen.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <FormField label="Naam" htmlFor={ids.name} required error={errors.name}>
          <Input
            id={ids.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            autoComplete="off"
          />
        </FormField>
        <FormField
          label="E-mailadres"
          htmlFor={ids.email}
          required
          error={errors.email}
        >
          <Input
            id={ids.email}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            placeholder="naam@school.nl"
          />
        </FormField>

        <fieldset className="flex flex-col gap-2">
          <legend id={ids.legend} className="mb-2 text-sm font-medium">
            Wachtwoord
          </legend>
          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            role="radiogroup"
            aria-labelledby={ids.legend}
          >
            {(
              [
                [
                  "generate",
                  "Tijdelijk wachtwoord",
                  "Wordt één keer getoond. De docent kiest bij de eerste keer inloggen een eigen wachtwoord.",
                ],
                [
                  "manual",
                  "Zelf kiezen",
                  `Minstens ${ADMIN_MIN_PASSWORD_LENGTH} tekens.`,
                ],
              ] as const
            ).map(([value, label, hint]) => (
              // biome-ignore lint/a11y/useSemanticElements: card-style radio
              <button
                key={value}
                id={ids.mode(value)}
                type="button"
                role="radio"
                aria-checked={mode === value}
                tabIndex={mode === value ? 0 : -1}
                onClick={() => setMode(value)}
                onKeyDown={onModeKeyDown}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
                  mode === value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-muted/50",
                )}
              >
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {mode === "manual" ? (
          <>
            <FormField
              label="Wachtwoord"
              htmlFor={ids.password}
              required
              error={errors.password}
              description={PASSWORD_HELP}
            >
              <Input
                id={ids.password}
                type="password"
                showPasswordToggle
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-describedby={ids.checklist}
              />
            </FormField>
            <PasswordChecklist
              id={ids.checklist}
              password={password}
              context={{ email: email.trim(), name: name.trim() }}
            />
          </>
        ) : null}

        {errors.form ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
          >
            {errors.form}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={create.isPending}
          onClick={() => onOpenChange(false)}
        >
          Annuleren
        </Button>
        <Button
          type="submit"
          disabled={create.isPending}
          aria-busy={create.isPending}
        >
          {create.isPending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : null}
          Docent toevoegen
        </Button>
      </DialogFooter>
    </form>
  );
}
