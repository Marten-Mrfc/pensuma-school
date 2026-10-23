"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, PlayCircle, RotateCcw } from "lucide-react";
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
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { AccessCodeInput } from "./access-code-input";
import {
  formatMinutes,
  formatMoment,
  formatNumber,
  formatTimeLeft,
} from "./format";
import { ModeBadge } from "./mode-badge";
import { MonitoringNotice } from "./monitoring/monitoring-notice";

type AssignmentInfo = RouterOutputs["portal"]["getAssignment"];

/** One fact on the start screen: label, value and an optional note. */
function Fact({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

/** Keeps a count on the same line as its question type. */
const NBSP = "\u00a0";

/** "9 programmeren · 2 meerkeuze · 1 open" */
function typeBreakdown(types: AssignmentInfo["questionTypes"]) {
  const parts: string[] = [];
  if (types.code) parts.push(`${types.code}${NBSP}programmeren`);
  if (types.multiple_choice)
    parts.push(`${types.multiple_choice}${NBSP}meerkeuze`);
  if (types.open) parts.push(`${types.open}${NBSP}open`);
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
          ? "Je kunt deze toets maar één keer maken."
          : `Je hebt al je ${info.maxAttempts} pogingen gebruikt.`;
    }
    return (
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
        {info.lastSubmittedAttemptId ? (
          <Button asChild variant="outline" className="w-full">
            <Link href={routes.leerling.result(info.lastSubmittedAttemptId)}>
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
      className="flex flex-col gap-5 rounded-xl border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold">
          {resuming ? "Ga verder waar je was" : "Voor je begint"}
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
          <label htmlFor={codeId} className="text-sm font-medium">
            Toegangscode
          </label>
          <AccessCodeInput
            inputRef={codeRef}
            id={codeId}
            value={code}
            onValueChange={(next) => {
              setCode(next);
              setError(null);
            }}
            invalid={!!error}
            describedBy={error ? `${hintId} ${errorId}` : hintId}
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
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="font-display text-base font-semibold">
        {exam ? "Goed om te weten" : "Zo werkt het"}
      </h2>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6 marker:text-muted-foreground">
        {s.blockPaste ? (
          <li className="font-medium text-warning-ink">
            <span>Let op: </span>plakken in de code-editor is uitgeschakeld. Typ
            je code zelf. Pogingen om te plakken worden geregistreerd, maar niet
            wát je plakt.
          </li>
        ) : null}
        {info.timeLimitMinutes ? (
          <li>
            De tijd loopt door, ook als je het venster sluit. Is de tijd om, dan
            wordt je werk automatisch ingeleverd.
          </li>
        ) : null}
        <li>
          Je antwoorden worden automatisch opgeslagen. Je kunt tussendoor gerust
          van vraag wisselen.
        </li>
        {info.questionTypes.code ? (
          <li>
            {s.allowCodeRun && s.allowSelfTest
              ? "Je kunt je code uitvoeren en testen met de voorbeeldtests. Bij het nakijken gebruiken we ook nog verborgen tests."
              : s.allowCodeRun
                ? "Je kunt je code uitvoeren. Bij het nakijken wordt je code getest."
                : s.allowSelfTest
                  ? "Je kunt je code testen met de voorbeeldtests. Uitvoeren is uitgeschakeld."
                  : "Uitvoeren en testen zijn bij deze toets uitgeschakeld."}
          </li>
        ) : null}
        {info.hasHints ? (
          <li>
            Bij sommige vragen kun je een hint bekijken. Een hint kan punten
            kosten.
          </li>
        ) : null}
        {!exam ? (
          <li>
            Dit is een oefening: fouten maken mag. Na het inleveren zie je
            meteen wat goed ging
            {info.maxAttempts > 1 ? " en kun je het opnieuw proberen." : "."}
          </li>
        ) : null}
      </ul>
      <MonitoringNotice
        className="rounded-none border-0 border-t bg-transparent px-0 pt-4 pb-0"
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
  // Only set when verlengde tijd makes the limit longer.
  const personalMinutes =
    info.timeLimitMinutes &&
    info.extraTimePercent > 0 &&
    (info.personalTimeMinutes ?? 0) > info.timeLimitMinutes
      ? info.personalTimeMinutes
      : null;

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
        <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 rounded-xl border bg-card p-4 sm:grid-cols-4 lg:col-start-1 lg:grid-cols-2 2xl:grid-cols-4">
          <Fact
            label="Vragen"
            value={info.questionCount}
            hint={typeBreakdown(info.questionTypes)}
          />
          <Fact label="Punten" value={formatNumber(info.totalPoints)} />
          <Fact
            label="Tijdslimiet"
            value={
              info.timeLimitMinutes
                ? `${personalMinutes ?? info.timeLimitMinutes} min`
                : "Geen"
            }
            hint={personalMinutes ? "incl. verlengde tijd" : undefined}
          />
          <Fact
            label="Sluit"
            value={
              info.closesAt ? formatMoment(info.closesAt) : "Geen sluitingstijd"
            }
            hint={
              info.maxAttempts > 1
                ? `${info.attemptsUsed} van ${info.maxAttempts} pogingen gebruikt`
                : undefined
            }
          />
        </dl>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <StartPanel info={info} />
        </aside>

        {info.description.trim() ? (
          <section className="min-w-0 rounded-xl border bg-card p-5 sm:p-6 lg:col-start-1">
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
