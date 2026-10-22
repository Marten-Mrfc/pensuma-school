"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CircleCheckBig,
  Eye,
  EyeOff,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { ErrorState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { ADMIN_MIN_PASSWORD_LENGTH, ROUTES } from "@/lib/auth-shared";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

type Errors = Partial<Record<"name" | "email" | "password" | "repeat", string>>;

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
          "grid size-4 place-items-center rounded-full border transition-colors",
          ok
            ? "border-transparent bg-success text-success-foreground"
            : "border-border",
        )}
        aria-hidden="true"
      >
        {ok ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
      </span>
      {children}
      <span className="sr-only">{ok ? "(in orde)" : "(nog niet in orde)"}</span>
    </li>
  );
}

function PasswordToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
      aria-pressed={shown}
      className="grid size-7 place-items-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {shown ? (
        <EyeOff className="size-4" aria-hidden="true" />
      ) : (
        <Eye className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}

export function SetupForm() {
  const trpc = useTRPC();
  const status = useQuery(trpc.setup.status.queryOptions());

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

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
      onError: (error) => setFormError(getErrorMessage(error)),
    }),
  );

  if (status.isPending) {
    return (
      <div
        className="flex flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
        aria-busy="true"
      >
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

  const longEnough = password.length >= ADMIN_MIN_PASSWORD_LENGTH;
  const matches = password.length > 0 && password === repeat;
  const busy = create.isPending || signingIn || create.isSuccess;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (name.trim().length < 2) next.name = "Vul je naam in.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      next.email = "Vul een geldig e-mailadres in.";
    if (!longEnough)
      next.password = `Je wachtwoord moet minstens ${ADMIN_MIN_PASSWORD_LENGTH} tekens hebben.`;
    if (!next.password && password !== repeat)
      next.repeat = "De wachtwoorden zijn niet hetzelfde.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;
    create.mutate({ name: name.trim(), email: email.trim(), password });
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
        className="flex flex-col gap-5 px-6 py-6 sm:px-8 sm:py-7"
      >
        <FormField label="Naam" htmlFor="name" error={errors.name} required>
          <Input
            id="name"
            size="large"
            autoComplete="name"
            placeholder="Bijvoorbeeld Marieke de Vries"
            value={name}
            onChange={(e) => setName(e.target.value)}
            status={errors.name ? "error" : undefined}
            autoFocus
          />
        </FormField>
        <FormField
          label="E-mailadres"
          htmlFor="email"
          error={errors.email}
          description="Hiermee log je straks in."
          required
        >
          <Input
            id="email"
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
            htmlFor="password"
            error={errors.password}
            required
          >
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              size="large"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              status={errors.password ? "error" : undefined}
              suffix={
                <PasswordToggle
                  shown={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
              }
            />
          </FormField>
          <FormField
            label="Herhaal wachtwoord"
            htmlFor="repeat"
            error={errors.repeat}
            required
          >
            <Input
              id="repeat"
              type={showPassword ? "text" : "password"}
              size="large"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              status={errors.repeat ? "error" : undefined}
            />
          </FormField>
        </div>
        <ul
          className="flex flex-col gap-1.5 text-sm"
          aria-label="Eisen voor je wachtwoord"
        >
          <Requirement
            ok={longEnough}
          >{`Minstens ${ADMIN_MIN_PASSWORD_LENGTH} tekens`}</Requirement>
          <Requirement ok={matches}>Beide wachtwoorden zijn gelijk</Requirement>
        </ul>

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
