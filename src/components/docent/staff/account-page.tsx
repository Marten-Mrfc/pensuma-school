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
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { ADMIN_MIN_PASSWORD_LENGTH } from "@/lib/auth-shared";
import { useTRPC } from "@/trpc/react";
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
        <PasswordPanel />
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
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string>();

  const update = useMutation(
    trpc.staff.updateMe.mutationOptions({
      onSuccess: async () => {
        await refreshSession();
        await queryClient.invalidateQueries({ queryKey: trpc.staff.pathKey() });
        router.refresh();
        toast.success("Je naam is opgeslagen");
      },
      onError: (e) => setError(getErrorMessage(e)),
    }),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Vul je naam in.");
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
        <FormField label="Naam" htmlFor="me-name" error={error}>
          <Input
            id="me-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </FormField>
        <FormField
          label="E-mailadres"
          htmlFor="me-email"
          description="Wil je een ander e-mailadres? Laat een andere docent een nieuw account voor je maken."
        >
          <Input id="me-email" value={email} readOnly disabled />
        </FormField>
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

function PasswordPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<{
    current?: string;
    next?: string;
    repeat?: string;
    form?: string;
  }>({});
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: typeof errors = {};
    if (!current) v.current = "Vul je huidige wachtwoord in.";
    if (next.length < ADMIN_MIN_PASSWORD_LENGTH) {
      v.next = `Je nieuwe wachtwoord moet minstens ${ADMIN_MIN_PASSWORD_LENGTH} tekens hebben.`;
    } else if (next === current)
      v.next = "Kies een ander wachtwoord dan je huidige.";
    if (repeat !== next) v.repeat = "De wachtwoorden zijn niet hetzelfde.";
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      const code = (error as { code?: string }).code ?? "";
      if (
        code === "INVALID_PASSWORD" ||
        /invalid password/i.test(error.message ?? "")
      ) {
        setErrors({ current: "Je huidige wachtwoord klopt niet." });
      } else if (code === "PASSWORD_TOO_LONG") {
        setErrors({
          next: "Je nieuwe wachtwoord is te lang (maximaal 128 tekens).",
        });
      } else {
        setErrors({
          form: "Wachtwoord wijzigen lukte niet. Probeer het opnieuw.",
        });
      }
      return;
    }
    setCurrent("");
    setNext("");
    setRepeat("");
    await queryClient.invalidateQueries({ queryKey: trpc.staff.me.queryKey() });
    toast.success("Je wachtwoord is gewijzigd", {
      description: "Je bent op je andere apparaten uitgelogd.",
    });
  }

  return (
    <Panel
      title="Wachtwoord wijzigen"
      description="Na het wijzigen word je op al je andere apparaten uitgelogd."
      icon={<KeyRound />}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {/* Hidden username helps password managers. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          className="hidden"
          readOnly
        />
        <FormField
          label="Huidig wachtwoord"
          htmlFor="pw-current"
          error={errors.current}
        >
          <Input
            id="pw-current"
            type="password"
            showPasswordToggle
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </FormField>
        <FormField
          label="Nieuw wachtwoord"
          htmlFor="pw-new"
          error={errors.next}
          description={`Minstens ${ADMIN_MIN_PASSWORD_LENGTH} tekens. Een zin van een paar woorden werkt goed.`}
        >
          <Input
            id="pw-new"
            type="password"
            showPasswordToggle
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
        </FormField>
        <FormField
          label="Herhaal nieuw wachtwoord"
          htmlFor="pw-repeat"
          error={errors.repeat}
        >
          <Input
            id="pw-repeat"
            type="password"
            showPasswordToggle
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
          />
        </FormField>
        {errors.form ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
          >
            {errors.form}
          </p>
        ) : null}
        <Button
          type="submit"
          className="w-fit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : null}
          Wachtwoord wijzigen
        </Button>
      </form>
    </Panel>
  );
}

function SessionsPanel({ activeSessions }: { activeSessions: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
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
            const { error } = await authClient.revokeOtherSessions();
            if (error)
              throw new Error("Uitloggen op andere apparaten lukte niet.");
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
