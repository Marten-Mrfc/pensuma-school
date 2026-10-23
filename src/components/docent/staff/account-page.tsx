"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  Loader2,
  LogOut,
  MonitorSmartphone,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/react";
import { focusInvalidField } from "../a11y/invalid-field-focus";
import { ChangePasswordForm } from "../account/change-password-form";
import { formatDate, plural } from "../students/format";

/** Refresh the cached session cookie so the shell shows the new name. */
async function refreshSession() {
  try {
    await authClient.getSession({ query: { disableCookieCache: true } });
  } catch {
    // Not critical: the cookie cache expires within a minute anyway.
  }
}

/** /docent/account: profile, password, sessions. */
export function AccountPage() {
  const trpc = useTRPC();
  const query = useQuery(trpc.staff.me.queryOptions());

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader title="Mijn account" />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </>
    );
  }

  const me = query.data;
  return (
    <>
      <PageHeader
        title="Mijn account"
        description={`Ingelogd als ${me.email} · account sinds ${formatDate(me.createdAt)}`}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfilePanel name={me.name} email={me.email} />
        <PasswordPanel name={me.name} email={me.email} />
        <SessionsPanel activeSessions={me.activeSessions} />
      </div>
    </>
  );
}

function Panel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-xl border bg-card p-5 text-card-foreground shadow-xs sm:p-6">
      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&>svg]:size-[18px]">
          {icon}
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="font-semibold">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function ProfilePanel({
  name: initialName,
  email,
}: {
  name: string;
  email: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const [name, setName] = useState(initialName);
  /** Validation error of the name field. */
  const [error, setError] = useState<string>();
  /** Server error: shown (and announced) below the fields. */
  const [formError, setFormError] = useState<string>();
  const nameId = useId();
  const emailId = useId();

  const update = useMutation(
    trpc.staff.updateMe.mutationOptions({
      onSuccess: async () => {
        await refreshSession();
        await queryClient.invalidateQueries({ queryKey: trpc.staff.pathKey() });
        router.refresh();
        toast.success("Je naam is opgeslagen");
      },
      onError: (e) => setFormError(getErrorMessage(e)),
    }),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (name.trim().length < 2) {
      const message = "Vul je naam in (minstens 2 tekens).";
      setError(message);
      focusInvalidField(nameId, message, announce);
      return;
    }
    setError(undefined);
    update.mutate({ name: name.trim() });
  }

  return (
    <Panel
      title="Profiel"
      description="Je naam is zichtbaar voor andere docenten."
      icon={<UserRound />}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormField label="Naam" htmlFor={nameId} error={error}>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </FormField>
        <FormField
          label="E-mailadres"
          htmlFor={emailId}
          description="Wil je een ander e-mailadres? Laat een andere docent een nieuw account voor je maken."
        >
          <Input id={emailId} value={email} readOnly disabled />
        </FormField>
        {formError ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
          >
            {formError}
          </p>
        ) : null}
        <Button
          type="submit"
          className="w-fit"
          disabled={update.isPending || name.trim() === initialName}
          aria-busy={update.isPending}
        >
          {update.isPending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : null}
          Opslaan
        </Button>
      </form>
    </Panel>
  );
}

function PasswordPanel({ name, email }: { name: string; email: string }) {
  return (
    <Panel
      title="Wachtwoord wijzigen"
      description="Na het wijzigen word je op al je andere apparaten uitgelogd."
      icon={<KeyRound />}
    >
      <ChangePasswordForm email={email} name={name} />
    </Panel>
  );
}

function SessionsPanel({ activeSessions }: { activeSessions: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const signOutOthers = useMutation(
    trpc.staff.signOutOtherSessions.mutationOptions(),
  );
  const others = Math.max(0, activeSessions - 1);

  return (
    <Panel
      title="Apparaten"
      description="Ben je ergens vergeten uit te loggen, bijvoorbeeld op een computer in het lokaal?"
      icon={<MonitorSmartphone />}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          {others === 0
            ? "Je bent alleen op dit apparaat ingelogd."
            : `Je bent ook nog op ${plural(others, "ander apparaat", "andere apparaten")} ingelogd.`}
        </p>
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="w-fit" disabled={others === 0}>
              <LogOut aria-hidden="true" />
              Uitloggen op andere apparaten
            </Button>
          }
          title="Uitloggen op andere apparaten?"
          description="Je blijft op dit apparaat ingelogd. Overal anders moet je opnieuw inloggen."
          confirmLabel="Uitloggen"
          onConfirm={async () => {
            await signOutOthers.mutateAsync();
            await queryClient.invalidateQueries({
              queryKey: trpc.staff.me.queryKey(),
            });
            toast.success("Je bent op alle andere apparaten uitgelogd");
          }}
        />
      </div>
    </Panel>
  );
}
