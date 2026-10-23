"use client";

import { useQuery } from "@tanstack/react-query";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  LogOut,
  Presentation,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PinInput,
  PinInputGroup,
  PinInputSlot,
} from "@/components/ui/pin-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prefersReducedMotion } from "@/lib/a11y/use-prefers-reduced-motion";
import { authClient, signOut, useSession } from "@/lib/auth-client";
import {
  homeForRole,
  ROLES,
  ROUTES,
  STUDENT_NUMBER_REGEX,
  STUDENT_PIN_REGEX,
} from "@/lib/auth-shared";
import { clearLocalUserData } from "@/lib/local-data";
import { cn, safeRedirectPath } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { completeSignIn } from "./complete-sign-in";

type LoginKind = "leerling" | "docent";

type AuthError =
  | { message?: string; status?: number; code?: string }
  | null
  | undefined;

function loginErrorMessage(error: AuthError, kind: LoginKind): string {
  const status = error?.status ?? 0;
  const message = error?.message?.trim() ?? "";
  if (status === 429) {
    // Our own lockout message is Dutch; better-auth's generic IP limit is English.
    return message && !/too many requests/i.test(message)
      ? message
      : "Te veel pogingen achter elkaar. Wacht even en probeer het dan opnieuw.";
  }
  if (error?.code === "BANNED_USER" || /banned/i.test(message)) {
    return kind === "leerling"
      ? "Je account is geblokkeerd. Vraag je docent om hulp."
      : "Dit account is geblokkeerd. Neem contact op met een collega-docent.";
  }
  if (status === 0) {
    return "Kan de server niet bereiken. Controleer je internetverbinding en probeer het opnieuw.";
  }
  if (status >= 500) {
    return "Er ging iets mis aan onze kant. Probeer het zo nog eens.";
  }
  return kind === "leerling"
    ? "Je leerlingnummer of pincode klopt niet. Controleer ze en probeer het opnieuw."
    : "Je e-mailadres of wachtwoord klopt niet.";
}

/** Only follow `next` into the area that belongs to the signed-in role. */
function targetFor(role: string, next: string | null) {
  const home = homeForRole(role);
  const candidate = safeRedirectPath(next, home);
  const otherArea =
    role === ROLES.admin ? ROUTES.studentHome : ROUTES.adminHome;
  if (candidate === ROUTES.login || candidate.startsWith(`${otherArea}`))
    return home;
  return candidate;
}

/** Restart a short horizontal shake (skipped when less motion is wanted). */
function shake(el: HTMLElement | null) {
  if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(4px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 400, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" },
  );
}

function ErrorMessage({ id, children }: { id: string; children: string }) {
  return (
    <div
      id={id}
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3.5 py-3 text-sm text-destructive-ink"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

function StudentLoginForm({
  next,
  initialNumber,
  focusOnMount,
}: {
  next: string | null;
  initialNumber: string;
  /** Focus the first empty field on first render (initial tab only). */
  focusOnMount: boolean;
}) {
  const ids = {
    number: useId(),
    pin: useId(),
    pinHelp: useId(),
    serverError: useId(),
  };
  const [studentNumber, setStudentNumber] = useState(initialNumber);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    number?: string;
    pin?: string;
  }>({});
  const [pending, setPending] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);

  // Only on first mount, and only for the tab the page opened on: switching
  // tabs with the arrow keys must never move focus (WCAG 3.2.1).
  const [focusInitially] = useState(focusOnMount);
  useLayoutEffect(() => {
    if (!focusInitially) return;
    if (initialNumber) pinRef.current?.focus();
    else numberRef.current?.focus();
  }, [focusInitially, initialNumber]);

  // After a failed sign-in the PIN is cleared and re-enabled: focus it then.
  useEffect(() => {
    if (error && !pending) pinRef.current?.focus();
  }, [error, pending]);

  async function submit(pinValue = pin) {
    if (pending) return;
    const number = studentNumber.trim();
    const errors: { number?: string; pin?: string } = {};
    if (!STUDENT_NUMBER_REGEX.test(number)) {
      errors.number = number
        ? "Een leerlingnummer bestaat alleen uit cijfers (3 tot 12)."
        : "Vul je leerlingnummer in.";
    }
    if (!STUDENT_PIN_REGEX.test(pinValue)) {
      errors.pin = "Je pincode bestaat uit 6 cijfers.";
    }
    setFieldError(errors);
    setError(null);
    if (errors.number) {
      numberRef.current?.focus();
      return;
    }
    if (errors.pin) {
      pinRef.current?.focus();
      return;
    }

    setPending(true);
    const { data, error: authError } = await authClient.signIn.username({
      username: number,
      password: pinValue,
      // Session cookie only: shared lab computers forget the login when the
      // browser closes.
      rememberMe: false,
    });
    if (authError || !data) {
      setPending(false);
      setError(loginErrorMessage(authError, "leerling"));
      setPin("");
      return;
    }
    const role = (data.user as { role?: string | null }).role ?? ROLES.student;
    completeSignIn(data.user.id, targetFor(role, next));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField
        label="Leerlingnummer"
        htmlFor={ids.number}
        error={fieldError.number}
      >
        <Input
          ref={numberRef}
          id={ids.number}
          aria-required
          name="username"
          size="large"
          inputMode="numeric"
          autoComplete="username"
          placeholder="Bijvoorbeeld 17053"
          maxLength={12}
          value={studentNumber}
          onChange={(e) => setStudentNumber(e.target.value.replace(/\D/g, ""))}
          status={fieldError.number ? "error" : undefined}
          className="[&_input]:font-mono [&_input]:tracking-wider [&_input]:placeholder:font-sans [&_input]:placeholder:tracking-normal"
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor={ids.pin} className="text-sm leading-none font-medium">
            Pincode
          </label>
          {/* Constant name + aria-pressed: "Pincode tonen, ingedrukt". */}
          <button
            type="button"
            onClick={() => setShowPin((v) => !v)}
            className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Pincode tonen"
            aria-pressed={showPin}
          >
            {showPin ? (
              <EyeOff className="size-3.5" aria-hidden="true" />
            ) : (
              <Eye className="size-3.5" aria-hidden="true" />
            )}
            Tonen
          </button>
        </div>
        <PinInput
          ref={pinRef}
          id={ids.pin}
          type={showPin ? "text" : "password"}
          name="password"
          maxLength={6}
          value={pin}
          onChange={(value) => {
            setPin(value);
            if (error) setError(null);
            if (fieldError.pin)
              setFieldError((f) => ({ ...f, pin: undefined }));
          }}
          onComplete={(value) => {
            if (STUDENT_NUMBER_REGEX.test(studentNumber.trim()))
              void submit(value);
          }}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="current-password"
          mask={!showPin}
          size="lg"
          status={fieldError.pin || error ? "error" : "default"}
          disabled={pending}
          aria-required
          aria-invalid={fieldError.pin || error ? true : undefined}
          aria-describedby={[ids.pinHelp, error ? ids.serverError : null]
            .filter(Boolean)
            .join(" ")}
          containerClassName="w-full"
        >
          <PinInputGroup className="w-full">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <PinInputSlot
                key={i}
                index={i}
                className="h-12 w-auto flex-1 font-mono text-xl"
              />
            ))}
          </PinInputGroup>
        </PinInput>
        <p
          id={ids.pinHelp}
          className={cn(
            "text-xs",
            fieldError.pin
              ? "font-medium text-destructive"
              : "text-muted-foreground",
          )}
        >
          {fieldError.pin ?? "De 6 cijfers die je van je docent hebt gekregen."}
        </p>
      </div>

      {error ? <ErrorMessage id={ids.serverError}>{error}</ErrorMessage> : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="h-11 text-[0.95rem]"
      >
        {pending ? (
          <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
        ) : null}
        {pending ? "Bezig met inloggen…" : "Inloggen"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Pincode vergeten? Je docent kan je een nieuwe geven.
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Teacher                                                             */
/* ------------------------------------------------------------------ */

function TeacherLoginForm({
  next,
  focusOnMount,
}: {
  next: string | null;
  /** Focus the e-mail field on first render (initial tab only). */
  focusOnMount: boolean;
}) {
  const ids = {
    email: useId(),
    password: useId(),
    serverError: useId(),
  };
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [focusInitially] = useState(focusOnMount);
  useLayoutEffect(() => {
    if (focusInitially) emailRef.current?.focus();
  }, [focusInitially]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [pending, setPending] = useState(false);

  // The submit button was disabled while signing in, which drops focus:
  // after a failed attempt, put it on the password field to try again.
  useEffect(() => {
    if (error && !pending) passwordRef.current?.focus();
  }, [error, pending]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const trimmed = email.trim();
    const errors: { email?: string; password?: string } = {};
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      errors.email = trimmed
        ? "Dit lijkt geen geldig e-mailadres."
        : "Vul je e-mailadres in.";
    }
    if (!password) errors.password = "Vul je wachtwoord in.";
    setFieldError(errors);
    setError(null);
    if (errors.email) {
      emailRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }

    setPending(true);
    const { data, error: authError } = await authClient.signIn.email({
      email: trimmed,
      password,
    });
    if (authError || !data) {
      setPending(false);
      setError(loginErrorMessage(authError, "docent"));
      shake(formRef.current);
      return;
    }
    const role = (data.user as { role?: string | null }).role ?? ROLES.admin;
    completeSignIn(data.user.id, targetFor(role, next));
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      <FormField
        label="E-mailadres"
        htmlFor={ids.email}
        error={fieldError.email}
      >
        <Input
          ref={emailRef}
          id={ids.email}
          aria-required
          name="email"
          type="email"
          size="large"
          autoComplete="email"
          placeholder="naam@school.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          status={fieldError.email ? "error" : undefined}
          aria-describedby={error ? ids.serverError : undefined}
        />
      </FormField>
      <FormField
        label="Wachtwoord"
        htmlFor={ids.password}
        error={fieldError.password}
      >
        <Input
          ref={passwordRef}
          id={ids.password}
          aria-required
          name="password"
          type={showPassword ? "text" : "password"}
          size="large"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          status={fieldError.password ? "error" : undefined}
          suffix={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label="Wachtwoord tonen"
              aria-pressed={showPassword}
              className="grid size-7 place-items-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          }
        />
      </FormField>

      {error ? <ErrorMessage id={ids.serverError}>{error}</ErrorMessage> : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="h-11 text-[0.95rem]"
      >
        {pending ? (
          <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
        ) : null}
        {pending ? "Bezig met inloggen…" : "Inloggen"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Wachtwoord vergeten? Een collega-docent kan het opnieuw instellen.
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Banners                                                             */
/* ------------------------------------------------------------------ */

function SetupBanner() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.setup.status.queryOptions());
  if (!data?.needsSetup) return null;
  return (
    <Link
      href={ROUTES.setup}
      className="mb-6 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/[0.06] px-4 py-3 text-sm outline-none transition-colors hover:bg-primary/[0.11] focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex flex-col">
        <span className="font-semibold text-foreground">
          Pensuma is nog niet ingesteld
        </span>
        <span className="text-muted-foreground">
          Maak eerst het eerste docentaccount aan.
        </span>
      </span>
      <ArrowRight
        className="ml-auto size-4 shrink-0 text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}

function SignedInNotice({ next }: { next: string | null }) {
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  if (!session) return null;
  const user = session.user as typeof session.user & { role?: string | null };
  const role = user.role ?? ROLES.student;

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm shadow-xs">
      <p>
        Je bent al ingelogd als{" "}
        <span className="font-semibold">{user.name}</span>.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => window.location.assign(targetFor(role, next))}
        >
          Verder
          <ArrowRight aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await signOut();
            // Shared school computers: leave nothing of the previous user
            // (preference mirror, answer backups) in this browser.
            clearLocalUserData();
            window.location.reload();
          }}
        >
          <LogOut aria-hidden="true" />
          Uitloggen
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  // Login cards link to /inloggen?nummer=17053 (QR code): prefill the number.
  const nummer = searchParams.get("nummer")?.trim() ?? "";
  const initialNumber = STUDENT_NUMBER_REGEX.test(nummer) ? nummer : "";
  const initialTab: LoginKind =
    searchParams.get("rol") === "docent" || next?.startsWith(ROUTES.adminHome)
      ? "docent"
      : "leerling";
  const [tab, setTab] = useState<LoginKind>(initialTab);
  // Initial focus belongs to the tab the page opened on; once the user
  // switches tabs, nothing moves focus automatically any more.
  const [focusTab, setFocusTab] = useState<LoginKind | null>(initialTab);

  return (
    <div>
      <SetupBanner />
      <SignedInNotice next={next} />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setFocusTab(null);
          setTab(v as LoginKind);
        }}
        className="gap-6"
      >
        <TabsList
          className="grid h-11 w-full grid-cols-2 rounded-xl p-1"
          aria-label="Ik ben een…"
        >
          <TabsTrigger
            value="leerling"
            size="lg"
            className="h-9 gap-2 rounded-lg"
          >
            <GraduationCap className="size-4" aria-hidden="true" />
            Leerling
          </TabsTrigger>
          <TabsTrigger
            value="docent"
            size="lg"
            className="h-9 gap-2 rounded-lg"
          >
            <Presentation className="size-4" aria-hidden="true" />
            Docent
          </TabsTrigger>
        </TabsList>
        <TabsContent value="leerling">
          <StudentLoginForm
            next={next}
            initialNumber={initialNumber}
            focusOnMount={focusTab === "leerling"}
          />
        </TabsContent>
        <TabsContent value="docent">
          <TeacherLoginForm next={next} focusOnMount={focusTab === "docent"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
