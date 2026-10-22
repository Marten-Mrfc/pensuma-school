"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
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
import { ADMIN_MIN_PASSWORD_LENGTH } from "@/lib/auth-shared";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { TemporaryPasswordView } from "./temporary-password-view";

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
  const [mode, setMode] = useState<"generate" | "manual">("generate");
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
      onError: (e) => setErrors({ form: getErrorMessage(e) }),
    }),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Vul de naam van de docent in.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      next.email = "Vul een geldig e-mailadres in.";
    if (mode === "manual" && password.length < ADMIN_MIN_PASSWORD_LENGTH) {
      next.password = `Het wachtwoord moet minstens ${ADMIN_MIN_PASSWORD_LENGTH} tekens hebben.`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
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
        <FormField
          label="Naam"
          htmlFor="teacher-name"
          required
          error={errors.name}
        >
          <Input
            id="teacher-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            autoComplete="off"
          />
        </FormField>
        <FormField
          label="E-mailadres"
          htmlFor="teacher-email"
          required
          error={errors.email}
        >
          <Input
            id="teacher-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            placeholder="naam@school.nl"
          />
        </FormField>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Wachtwoord</legend>
          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            role="radiogroup"
          >
            {(
              [
                [
                  "generate",
                  "Tijdelijk wachtwoord",
                  "Wordt na het opslaan één keer getoond.",
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
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
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
          <FormField
            label="Wachtwoord"
            htmlFor="teacher-password"
            required
            error={errors.password}
          >
            <Input
              id="teacher-password"
              type="password"
              showPasswordToggle
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
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
