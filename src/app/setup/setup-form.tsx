"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleCheckBig,
  Loader2,
  LockKeyhole,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { ErrorState } from "@/components/app/states";
import { PasswordChecklist } from "@/components/docent/account/password-checklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { focusElementById } from "@/lib/a11y/focus";
import { authClient } from "@/lib/auth-client";
import { ROUTES } from "@/lib/auth-shared";
import {
  PASSWORD_HELP,
  validateTeacherPassword,
} from "@/lib/security/password-policy";
import { useTRPC } from "@/trpc/react";

type Field = "name" | "email" | "password" | "repeat" | "setupToken";
type Errors = Partial<Record<Field, string>>;
const FIELD_ORDER: readonly Field[] = [
  "setupToken",
  "name",
  "email",
  "password",
  "repeat",
];

const TOKEN_MESSAGES = new Set([
  "De installatiecode klopt niet.",
  "De installatie is vergrendeld. Zet SETUP_TOKEN in de serveromgeving.",
]);

export function SetupForm() {
  const trpc = useTRPC();
  const status = useQuery(trpc.setup.status.queryOptions());
  const baseId = useId();
  const ids: Record<Field | "checklist", string> = {
    name: `${baseId}-name`,
    email: `${baseId}-email`,
    password: `${baseId}-password`,
    repeat: `${baseId}-repeat`,
    setupToken: `${baseId}-token`,
    checklist: `${baseId}-checklist`,
  };

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  function showErrors(found: Errors) {
    setErrors(found);
    const first = FIELD_ORDER.find((f) => found[f]);
    if (first) requestAnimationFrame(() => focusElementById(ids[first]));
  }

  const create = useMutation(
    trpc.setup.createFirstAdmin.mutationOptions({
      onSuccess: async () => {
        setSigningIn(true);
        const { error } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (error) {
          toast.success("Je account is aangemaakt. Log nu in.");
          window.location.assign(`${ROUTES.login}?rol=docent`);
          return;
        }
        toast.success("Welkom bij Pensuma!");
        window.location.assign(ROUTES.adminHome);
      },
      onError: (error) => {
        const message = getErrorMessage(error);
        if (TOKEN_MESSAGES.has(error.message)) {
          showErrors({ setupToken: error.message });
          return;
        }
        const fields = error.data?.zodError?.fieldErrors as
          | Record<string, string[] | undefined>
          | undefined;
        const found: Errors = {
          name: fields?.name?.[0],
          email: fields?.email?.[0],
          password: fields?.password?.[0],
        };
        if (found.name || found.email || found.password) {
          showErrors(found);
          return;
        }
        setFormError(message);
      },
    }),
  );

  if (status.isPending) {
    return (
      <div
        className="flex flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
        aria-busy="true"
      >
        <span className="sr-only">Laden…</span>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (status.isError) {
    return (
      <ErrorState
        title="De status kon niet worden opgehaald"
        error={status.error}
        onRetry={() => void status.refetch()}
      />
    );
  }

  if (!status.data.needsSetup && !create.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-10 text-center shadow-sm sm:px-10">
        <span className="grid size-12 place-items-center rounded-2xl bg-success/12 text-success-ink ring-1 ring-success/25">
          <CircleCheckBig className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display-wide text-2xl font-bold">
            Pensuma is al ingesteld
          </h1>
          <p className="text-muted-foreground">
            Er bestaat al een docentaccount. Log in, of vraag een collega om een
            account voor je aan te maken.
          </p>
        </div>
        <Button asChild size="lg" className="mt-2">
          <Link href={`${ROUTES.login}?rol=docent`}>
            Naar inloggen
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  const tokenRequired = status.data.tokenRequired;
  const busy = create.isPending || signingIn || create.isSuccess;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    if (tokenRequired && !setupToken.trim())
      found.setupToken = "Vul de installatiecode in.";
    if (name.trim().length < 2) found.name = "Vul je naam in.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      found.email = "Vul een geldig e-mailadres in.";
    const policy = validateTeacherPassword(password, {
      email: email.trim(),
      name: name.trim(),
    });
    if (!policy.ok) found.password = policy.message;
    else if (password !== repeat)
      found.repeat = "De wachtwoorden zijn niet hetzelfde.";
    setFormError(null);
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }
    setErrors({});
    create.mutate({
      name: name.trim(),
      email: email.trim(),
      password,
      setupToken: tokenRequired ? setupToken.trim() : undefined,
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-muted/30 px-6 py-6 sm:px-8">
        <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Eerste keer
        </p>
        <h1 className="font-display-wide text-[1.7rem] leading-tight font-bold">
          Welkom bij Pensuma
        </h1>
        <p className="mt-2 text-muted-foreground">
          Maak het eerste docentaccount aan. Daarmee beheer je straks klassen,
          leerlingen, toetsen en andere docenten.
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        noValidate
        aria-busy={busy}
        className="flex flex-col gap-5 px-6 py-6 sm:px-8 sm:py-7"
      >
        {tokenRequired ? (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <LockKeyhole
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              Deze installatie is beveiligd
            </p>
            <FormField
              label="Installatiecode"
              htmlFor={ids.setupToken}
              error={errors.setupToken}
              description="Je vindt deze code in de omgevingsvariabele SETUP_TOKEN van de server."
              required
            >
              <Input
                id={ids.setupToken}
                type="password"
                size="large"
                autoComplete="off"
                spellCheck={false}
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                status={errors.setupToken ? "error" : undefined}
                autoFocus
              />
            </FormField>
          </div>
        ) : null}
        <FormField label="Naam" htmlFor={ids.name} error={errors.name} required>
          <Input
            id={ids.name}
            size="large"
            autoComplete="name"
            placeholder="Bijvoorbeeld Marieke de Vries"
            value={name}
            onChange={(e) => setName(e.target.value)}
            status={errors.name ? "error" : undefined}
            autoFocus={!tokenRequired}
          />
        </FormField>
        <FormField
          label="E-mailadres"
          htmlFor={ids.email}
          error={errors.email}
          description="Hiermee log je straks in."
          required
        >
          <Input
            id={ids.email}
            type="email"
            size="large"
            autoComplete="email"
            placeholder="naam@school.nl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            status={errors.email ? "error" : undefined}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Wachtwoord"
            htmlFor={ids.password}
            error={errors.password}
            required
          >
            <PasswordInput
              id={ids.password}
              size="lg"
              placeholder=""
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={ids.checklist}
              className={errors.password ? "border-destructive" : undefined}
            />
          </FormField>
          <FormField
            label="Herhaal wachtwoord"
            htmlFor={ids.repeat}
            error={errors.repeat}
            required
          >
            <PasswordInput
              id={ids.repeat}
              size="lg"
              placeholder=""
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className={errors.repeat ? "border-destructive" : undefined}
            />
          </FormField>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {PASSWORD_HELP}
          </p>
          <PasswordChecklist
            id={ids.checklist}
            password={password}
            repeat={repeat}
            context={{ email: email.trim(), name: name.trim() }}
          />
        </div>

        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3.5 py-3 text-sm text-destructive-ink"
          >
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{formError}</span>
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={busy}
          className="mt-1 h-11 text-[0.95rem]"
        >
          {busy ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : null}
          {signingIn || create.isSuccess
            ? "Je wordt ingelogd…"
            : create.isPending
              ? "Account aanmaken…"
              : "Account aanmaken en beginnen"}
          {!busy ? <ArrowRight aria-hidden="true" /> : null}
        </Button>
      </form>
    </div>
  );
}
