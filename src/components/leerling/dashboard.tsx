"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Award,
  CalendarClock,
  CalendarDays,
  CircleCheckBig,
  Clock3,
  FileQuestion,
  Hourglass,
  KeyRound,
  ListChecks,
  PartyPopper,
  PlayCircle,
  RotateCcw,
  SquareTerminal,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect } from "react";
import { useCurrentUser } from "@/components/app/current-user";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { claimLocalData, pruneAttemptBackups } from "@/lib/local-data";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import {
  backupKeepKey,
  finishedEmptyCopy,
  keepKeyIds,
} from "./dashboard-logic";
import {
  formatGrade,
  formatLongDate,
  formatMinutes,
  formatMoment,
  formatNumber,
  formatTimeLeft,
  hiddenResultLabel,
  pluralize,
} from "./format";
import { ModeBadge } from "./mode-badge";
import { ROW_LINK_CLASS, ROW_LIST_CLASS } from "./row-list";

type DashboardItem = RouterOutputs["portal"]["dashboard"]["open"][number];

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        {title}
        {count ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary tabular-nums">
            {count}
          </span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

function Fact({
  icon: Icon,
  children,
}: {
  icon: typeof Clock3;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon
        className="size-4 shrink-0 text-muted-foreground/80"
        aria-hidden="true"
      />
      <span className="truncate">{children}</span>
    </li>
  );
}

function ScorePill({ item }: { item: DashboardItem }) {
  const last = item.lastAttempt;
  if (!last) return null;
  if (!last.resultsVisible) {
    return (
      <span className="text-sm text-muted-foreground">
        {hiddenResultLabel(last)}
      </span>
    );
  }
  if (last.gradingStatus === "pending" || last.score == null) {
    return (
      <span className="text-sm text-muted-foreground">Wordt nagekeken…</span>
    );
  }
  return (
    <span className="text-sm text-muted-foreground">
      Laatste score{" "}
      <strong className="font-semibold text-foreground tabular-nums">
        {formatNumber(last.score)}/{formatNumber(last.maxScore)}
      </strong>
      {last.grade != null ? (
        <>
          {" "}
          · cijfer{" "}
          <strong className="font-semibold text-foreground tabular-nums">
            {formatGrade(last.grade)}
          </strong>
        </>
      ) : null}
    </span>
  );
}

function OpenCard({ item }: { item: DashboardItem }) {
  const inProgress = item.inProgress;
  const retry = !inProgress && item.attemptsUsed > 0;
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-md",
        inProgress && "border-warning/40 ring-1 ring-warning/20",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 h-1",
          inProgress
            ? "bg-warning"
            : item.mode === "exam"
              ? "bg-primary"
              : "bg-info",
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <ModeBadge mode={item.mode} />
        <span className="text-xs font-medium text-muted-foreground">
          {item.className}
        </span>
        {inProgress ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-warning/12 px-2.5 py-0.5 text-xs font-medium text-warning-ink">
            <Hourglass className="size-3.5" aria-hidden="true" />
            Bezig
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl leading-snug font-semibold tracking-tight text-balance">
          {item.title}
        </h3>
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <Fact icon={FileQuestion}>
          {pluralize(item.questionCount, "vraag", "vragen")} ·{" "}
          {formatNumber(item.totalPoints)}{" "}
          {item.totalPoints === 1 ? "punt" : "punten"}
        </Fact>
        <Fact icon={Clock3}>
          {item.timeLimitMinutes
            ? formatMinutes(item.timeLimitMinutes)
            : "Geen tijdslimiet"}
        </Fact>
        <Fact icon={CalendarClock}>
          {item.closesAt
            ? `Sluit ${formatMoment(item.closesAt)}`
            : "Geen sluitingstijd"}
        </Fact>
        {item.needsAccessCode ? (
          <Fact icon={KeyRound}>Toegangscode nodig</Fact>
        ) : item.maxAttempts > 1 ? (
          <Fact icon={RotateCcw}>
            Poging{" "}
            {Math.min(
              item.attemptsUsed + (inProgress ? 0 : 1),
              item.maxAttempts,
            )}{" "}
            van {item.maxAttempts}
          </Fact>
        ) : null}
      </ul>

      {inProgress?.deadlineAt ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-ink">
          Je bent al begonnen. Je hebt {formatTimeLeft(inProgress.deadlineAt)}{" "}
          (tot {formatMoment(inProgress.deadlineAt)}).
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
        <ScorePill item={item} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {retry && item.lastAttempt ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={routes.leerling.result(item.lastAttempt.attemptId)}>
                Bekijk resultaat
              </Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href={routes.leerling.assignment(item.id)}>
              {inProgress ? (
                <>
                  <PlayCircle aria-hidden="true" />
                  Verdergaan
                </>
              ) : retry ? (
                <>
                  <RotateCcw aria-hidden="true" />
                  Opnieuw proberen
                </>
              ) : (
                <>
                  Starten
                  <ArrowRight aria-hidden="true" />
                </>
              )}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function UpcomingRow({ item }: { item: DashboardItem }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info/10 text-info-ink max-sm:hidden">
        <CalendarDays className="size-5" aria-hidden="true" />
      </span>
      <div className="flex min-w-[min(100%,14rem)] flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{item.title}</span>
        <span className="text-sm text-muted-foreground">
          {item.className} · {pluralize(item.questionCount, "vraag", "vragen")}
          {item.timeLimitMinutes
            ? ` · ${formatMinutes(item.timeLimitMinutes)}`
            : ""}
        </span>
      </div>
      <div className="flex items-center gap-3 max-sm:w-full max-sm:justify-between">
        <ModeBadge mode={item.mode} />
        <span className="text-sm font-medium whitespace-nowrap">
          Opent {formatMoment(item.opensAt)}
        </span>
      </div>
    </li>
  );
}

function FinishedRow({ item }: { item: DashboardItem }) {
  const last = item.lastAttempt;
  const content = (
    <>
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          last
            ? "bg-success/12 text-success-ink"
            : "bg-muted text-muted-foreground",
        )}
      >
        {last ? (
          <CircleCheckBig className="size-5" aria-hidden="true" />
        ) : (
          <FileQuestion className="size-5" aria-hidden="true" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 basis-[12rem] flex-col gap-0.5">
        <span className="truncate font-medium">{item.title}</span>
        <span className="text-sm text-muted-foreground">
          {last?.submittedAt
            ? `Ingeleverd ${formatMoment(last.submittedAt)}`
            : item.status === "closed"
              ? "Niet gemaakt"
              : "Geen pogingen meer"}
          {" · "}
          {item.className}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {last ? (
          last.resultsVisible &&
          last.score != null &&
          last.gradingStatus !== "pending" ? (
            <span className="flex items-baseline gap-2 tabular-nums">
              <span className="text-sm text-muted-foreground">
                {formatNumber(last.score)}/{formatNumber(last.maxScore)}
              </span>
              {last.grade != null ? (
                <span className="rounded-lg bg-primary/10 px-2 py-0.5 font-display text-lg font-bold text-primary">
                  {formatGrade(last.grade)}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {last.resultsVisible
                ? "Wordt nagekeken…"
                : hiddenResultLabel(last)}
            </span>
          )
        ) : null}
        {last ? (
          <ArrowRight
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </>
  );
  return (
    <li>
      {last ? (
        <Link
          href={routes.leerling.result(last.attemptId)}
          className={ROW_LINK_CLASS}
        >
          {content}
        </Link>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
          {content}
        </div>
      )}
    </li>
  );
}

/** Empty "Afgerond" section (see finishedEmptyCopy). */
export function FinishedEmpty({ open }: { open: readonly DashboardItem[] }) {
  const copy = finishedEmptyCopy(open);
  return (
    <EmptyBlock
      icon={Award}
      title={copy.title}
      description={copy.description}
      action={
        copy.linkToResults ? (
          <Button asChild variant="outline">
            <Link href={routes.leerling.results}>
              <ListChecks aria-hidden="true" />
              Naar Resultaten
            </Link>
          </Button>
        ) : undefined
      }
    />
  );
}

export function StudentDashboard() {
  const user = useCurrentUser();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.portal.dashboard.queryOptions(undefined, { refetchInterval: 30_000 }),
  );

  // Shared school computers: drop another student's local data, and the
  // answer backups of attempts that are no longer running (handed in,
  // deleted). Only with data fetched since this page opened: cached data
  // could miss an attempt started a moment ago.
  useEffect(() => {
    claimLocalData(user.id);
  }, [user.id]);
  const keepKey = backupKeepKey(query);
  useEffect(() => {
    if (keepKey == null) return;
    pruneAttemptBackups(keepKeyIds(keepKey));
  }, [keepKey]);

  const greeting = (
    <header className="flex flex-col gap-1.5">
      <p
        className="text-sm font-medium text-muted-foreground first-letter:uppercase"
        suppressHydrationWarning
      >
        {formatLongDate(new Date())}
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Hoi {firstName(user.name)}! <span aria-hidden="true">👋</span>
      </h1>
      {query.data ? (
        <p className="text-muted-foreground">
          {query.data.open.length === 0
            ? "Er staat op dit moment geen toets voor je open."
            : query.data.open.some((i) => i.inProgress)
              ? "Je bent nog met een toets bezig. Ga verder waar je gebleven was."
              : query.data.open.length === 1
                ? "Er staat één toets voor je klaar. Succes!"
                : `Er staan ${query.data.open.length} toetsen voor je klaar. Succes!`}
        </p>
      ) : null}
    </header>
  );

  if (query.isPending) {
    return (
      <>
        {greeting}
        <LoadingState variant="list" />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {greeting}
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </>
    );
  }

  const { open, upcoming, finished } = query.data;

  return (
    <>
      {greeting}

      <Section title="Open toetsen" count={open.length}>
        {open.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {open.map((item) => (
              <OpenCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyBlock
            icon={PartyPopper}
            title="Alles is af!"
            description="Er staat nu niets voor je klaar. Zin om alvast te oefenen met Python?"
            action={
              <Button asChild variant="outline">
                <Link href={routes.leerling.practice}>
                  <SquareTerminal aria-hidden="true" />
                  Naar Oefenen
                </Link>
              </Button>
            }
          />
        )}
      </Section>

      {upcoming.length ? (
        <Section title="Binnenkort" count={upcoming.length}>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-xs">
            {upcoming.map((item) => (
              <UpcomingRow key={item.id} item={item} />
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Afgerond">
        {finished.length ? (
          <ul className={ROW_LIST_CLASS}>
            {finished.map((item) => (
              <FinishedRow key={item.id} item={item} />
            ))}
          </ul>
        ) : (
          <FinishedEmpty open={open} />
        )}
      </Section>
    </>
  );
}
