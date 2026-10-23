"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  ClipboardPaste,
  Clock3,
  Code2,
  FileQuestion,
  KeyRound,
  Lightbulb,
  Loader2,
  PlayCircle,
  RotateCcw,
  Save,
  Sparkles,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  use,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useCurrentUser } from "@/components/app/current-user";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Markdown } from "@/components/app/markdown";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/lib/a11y/use-document-title";
import { claimLocalData, removeAttemptBackups } from "@/lib/local-data";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import {
  formatMinutes,
  formatMoment,
  formatNumber,
  formatTimeLeft,
  pluralize,
} from "./format";
import { ModeBadge } from "./mode-badge";
import { MonitoringNotice } from "./monitoring/monitoring-notice";

type AssignmentInfo = RouterOutputs["portal"]["getAssignment"];

function FactTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Clock3;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-3.5 shadow-xs sm:p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary max-sm:hidden">
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="font-display text-lg leading-tight font-semibold">
          {value}
        </span>
        {hint ? (
          <span className="mt-0.5 text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

function Rule({
  icon: Icon,
  tone = "default",
  children,
}: {
  icon: typeof Clock3;
  tone?: "default" | "warning";
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
          tone === "warning"
            ? "bg-warning/15 text-warning-ink"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="text-sm leading-6">{children}</span>
    </li>
  );
}

function typeBreakdown(types: AssignmentInfo["questionTypes"]) {
  const parts: string[] = [];
  if (types.code) parts.push(`${types.code} programmeren`);
  if (types.multiple_choice) parts.push(`${types.multiple_choice} meerkeuze`);
  if (types.open) parts.push(`${types.open} open`);
  return parts.join(" · ");
}

async function enterFullscreen(): Promise<boolean> {
  if (typeof document === "undefined" || document.fullscreenElement)
    return false;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    // Keep Escape inside the page while in fullscreen (where supported).
    (
      navigator as Navigator & {
        keyboard?: { lock?: (keys: string[]) => Promise<void> };
      }
    ).keyboard
      ?.lock?.(["Escape"])
      .catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** "Zodra je start, loopt de tijd: …" including verlengde tijd. */
function timeLimitText(info: AssignmentInfo): string | null {
  if (!info.timeLimitMinutes) return null;
  const personal = info.personalTimeMinutes ?? info.timeLimitMinutes;
  if (info.extraTimePercent > 0 && personal > info.timeLimitMinutes) {
    return `Zodra je start, loopt de tijd: je hebt ${personal} minuten (${info.timeLimitMinutes} minuten + ${info.extraTimePercent}% verlengde tijd).`;
  }
  return `Zodra je start, loopt de tijd: je hebt ${formatMinutes(info.timeLimitMinutes)}.`;
}

function StartPanel({ info }: { info: AssignmentInfo }) {
  const trpc = useTRPC();
  const router = useRouter();
  const codeId = useId();
  const hintId = `${codeId}-hint`;
  const errorId = `${codeId}-error`;
  const codeRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const start = useMutation(trpc.portal.startAttempt.mutationOptions());
  const [navigating, setNavigating] = useState(false);

  const resuming = !!info.inProgressAttemptId;
  const exam = info.mode === "exam";
  const needsCode = info.needsAccessCode && !resuming;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (needsCode && !code.trim()) {
      setError("Vul de toegangscode in die je docent laat zien.");
      codeRef.current?.focus();
      return;
    }
    // Must run inside the click/submit gesture, before any await.
    const fullscreenPromise = info.settings.requireFullscreen
      ? enterFullscreen()
      : null;
    try {
      const result = await start.mutateAsync({
        assignmentId: info.id,
        accessCode: needsCode ? code : undefined,
      });
      setNavigating(true);
      router.push(routes.leerling.attempt(result.attemptId));
    } catch (err) {
      if ((await fullscreenPromise) && document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
      setError(
        getErrorMessage(err, "Starten lukte niet. Probeer het opnieuw."),
      );
      if (needsCode) codeRef.current?.focus();
    }
  };

  const busy = start.isPending || navigating;

  if (!resuming && !info.canStart) {
    let title = "Deze toets is gesloten";
    let text: ReactNode = "Je kunt deze toets niet meer maken.";
    if (info.status === "planned") {
      title = "Nog even geduld";
      text = info.opensAt
        ? `Deze toets opent ${formatMoment(info.opensAt)}.`
        : "Deze toets is nog niet geopend.";
    } else if (
      info.status === "open" &&
      info.attemptsUsed >= info.maxAttempts
    ) {
      title =
        info.maxAttempts === 1
          ? "Je hebt deze toets al gemaakt"
          : "Alle pogingen gebruikt";
      text =
        info.maxAttempts === 1
          ? "Goed gedaan! Je kunt deze toets maar één keer maken."
          : `Je hebt al je ${info.maxAttempts} pogingen gebruikt.`;
    }
    return (
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
        {info.lastSubmittedAttemptId ? (
          <Button asChild variant="outline" className="w-full">
            <Link href={routes.leerling.result(info.lastSubmittedAttemptId)}>
              <Trophy aria-hidden="true" />
              Bekijk je resultaat
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-sm ring-1 ring-primary/10 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold">
          {resuming
            ? "Ga verder waar je was"
            : exam
              ? "Klaar om te beginnen?"
              : "Zin om te oefenen?"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {resuming
            ? info.inProgressDeadlineAt
              ? `Je bent al begonnen. Je hebt ${formatTimeLeft(info.inProgressDeadlineAt)} (tot ${formatMoment(info.inProgressDeadlineAt)}).`
              : "Je bent al begonnen. Je antwoorden zijn bewaard."
            : info.timeLimitMinutes
              ? timeLimitText(info)
              : exam
                ? "Neem rustig de tijd. Je antwoorden worden automatisch opgeslagen."
                : "Je kunt je code zo vaak uitvoeren en testen als je wilt."}
        </p>
      </div>

      {needsCode ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={codeId}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <KeyRound
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Toegangscode
          </label>
          <input
            ref={codeRef}
            id={codeId}
            name="toegangscode"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/\s+/g, ""));
              setError(null);
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder="ABC123"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            className={cn(
              "h-16 w-full rounded-xl border-2 border-input bg-background px-4 text-center font-mono text-3xl font-semibold tracking-[0.35em] uppercase shadow-xs transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/35 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring",
              error &&
                "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25",
            )}
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            Je docent laat de code op het bord zien.
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive-ink"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : resuming ? (
          <PlayCircle aria-hidden="true" />
        ) : info.attemptsUsed > 0 ? (
          <RotateCcw aria-hidden="true" />
        ) : null}
        {resuming
          ? "Verdergaan"
          : info.attemptsUsed > 0
            ? "Opnieuw proberen"
            : "Start toets"}
        {!busy && !resuming && info.attemptsUsed === 0 ? (
          <ArrowRight aria-hidden="true" />
        ) : null}
      </Button>
      {info.settings.requireFullscreen ? (
        <p className="-mt-2 text-center text-xs text-muted-foreground">
          De toets opent in volledig scherm.
        </p>
      ) : null}
      {info.lastSubmittedAttemptId && !resuming ? (
        <Button asChild variant="ghost" size="sm" className="-mt-2 self-center">
          <Link href={routes.leerling.result(info.lastSubmittedAttemptId)}>
            Bekijk je vorige resultaat
          </Link>
        </Button>
      ) : null}
    </form>
  );
}

function RulesCard({ info }: { info: AssignmentInfo }) {
  const s = info.settings;
  const exam = info.mode === "exam";
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        {exam ? "Goed om te weten" : "Zo werkt het"}
      </h2>
      <ul className="flex flex-col gap-3">
        {s.blockPaste ? (
          <Rule icon={ClipboardPaste} tone="warning">
            Plakken in de code-editor is uitgeschakeld. Typ je code zelf.
            Pogingen om te plakken worden geregistreerd, maar niet wát je plakt.
          </Rule>
        ) : null}
        {info.timeLimitMinutes ? (
          <Rule icon={Clock3}>
            De tijd loopt door, ook als je het venster sluit. Is de tijd om, dan
            wordt je werk automatisch ingeleverd.
          </Rule>
        ) : null}
        <Rule icon={Save}>
          Je antwoorden worden automatisch opgeslagen. Je kunt tussendoor gerust
          van vraag wisselen.
        </Rule>
        {info.questionTypes.code ? (
          <Rule icon={Code2}>
            {s.allowCodeRun && s.allowSelfTest
              ? "Je kunt je code uitvoeren en testen met de voorbeeldtests. Bij het nakijken gebruiken we ook nog verborgen tests."
              : s.allowCodeRun
                ? "Je kunt je code uitvoeren. Bij het nakijken wordt je code getest."
                : s.allowSelfTest
                  ? "Je kunt je code testen met de voorbeeldtests. Uitvoeren is uitgeschakeld."
                  : "Uitvoeren en testen zijn bij deze toets uitgeschakeld."}
          </Rule>
        ) : null}
        {info.hasHints ? (
          <Rule icon={Lightbulb}>
            Bij sommige vragen kun je een hint bekijken. Een hint kan punten
            kosten.
          </Rule>
        ) : null}
        {!exam ? (
          <Rule icon={Sparkles}>
            Dit is een oefening: fouten maken mag! Na het inleveren zie je
            meteen wat goed ging
            {info.maxAttempts > 1 ? " en kun je het opnieuw proberen." : "."}
          </Rule>
        ) : null}
      </ul>
      <MonitoringNotice
        settings={{
          logFocusEvents: s.logFocusEvents,
          requireFullscreen: s.requireFullscreen,
          blockPaste: s.blockPaste,
        }}
      />
    </section>
  );
}

function StartScreenContent({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.portal.getAssignment.queryOptions({ id }));
  useDocumentTitle([query.data?.title, "Toets starten"]);
  const user = useCurrentUser();
  const lastSubmittedId = query.data?.lastSubmittedAttemptId ?? null;
  // Shared school computers: drop another student's local data, and the
  // answer backup of an attempt that has been handed in.
  useEffect(() => {
    claimLocalData(user.id);
  }, [user.id]);
  useEffect(() => {
    if (lastSubmittedId) removeAttemptBackups([lastSubmittedId]);
  }, [lastSubmittedId]);

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <>
        <PageHeader
          title="Toets"
          backHref={routes.leerling.dashboard}
          backLabel="Mijn toetsen"
        />
        <ErrorState
          title="Deze toets kon niet worden geladen"
          error={query.error}
          onRetry={() => query.refetch()}
        />
      </>
    );
  }
  const info = query.data;

  return (
    <>
      <PageHeader
        title={info.title}
        backHref={routes.leerling.dashboard}
        backLabel="Mijn toetsen"
        badge={
          <>
            <ModeBadge mode={info.mode} />
            <StatusBadge kind="assignment" status={info.status} />
          </>
        }
        description={info.className}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 lg:col-start-1 lg:grid-cols-2 2xl:grid-cols-4">
          <FactTile
            icon={FileQuestion}
            label="Vragen"
            value={info.questionCount}
            hint={typeBreakdown(info.questionTypes)}
          />
          <FactTile
            icon={Trophy}
            label="Punten"
            value={formatNumber(info.totalPoints)}
          />
          <FactTile
            icon={Clock3}
            label="Tijdslimiet"
            value={
              info.timeLimitMinutes
                ? info.extraTimePercent > 0 &&
                  (info.personalTimeMinutes ?? 0) > info.timeLimitMinutes
                  ? `${info.personalTimeMinutes} min (incl. verlengde tijd)`
                  : `${info.timeLimitMinutes} min`
                : "Geen"
            }
          />
          <FactTile
            icon={CalendarClock}
            label="Sluit"
            value={
              info.closesAt ? formatMoment(info.closesAt) : "Geen deadline"
            }
            hint={
              info.maxAttempts > 1
                ? `${pluralize(info.maxAttempts, "poging", "pogingen")}, ${info.attemptsUsed} gebruikt`
                : undefined
            }
          />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <StartPanel info={info} />
        </aside>

        {info.description.trim() ? (
          <section className="min-w-0 rounded-2xl border bg-card p-5 shadow-xs sm:p-6 lg:col-start-1">
            <Markdown>{info.description}</Markdown>
          </section>
        ) : null}

        <div className="min-w-0 lg:col-start-1">
          <RulesCard info={info} />
        </div>
      </div>
    </>
  );
}

export function StartScreen({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  const { afnameId } = use(params);
  return <StartScreenContent id={afnameId} />;
}
