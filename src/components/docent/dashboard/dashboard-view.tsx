"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { AccessibleChart } from "@/components/a11y/accessible-chart";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import {
  formatGrade,
  formatMinutes,
  formatMoment,
  formatNumber,
} from "@/components/docent/assignments/format";
import {
  AssignmentProgress,
  ModeBadge,
} from "@/components/docent/assignments/shared";
import { GradeDistributionChart } from "@/components/docent/review/charts";
import { passedSentence } from "@/components/docent/review/copy";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";

type Overview = RouterOutputs["dashboard"]["overview"];
type Active = Overview["activeAssignments"][number];

/**
 * Row links in the dashboard lists. The focus indicator is an inset ring (the
 * rounded list clips anything drawn outside a row), with the tint as a
 * second cue. In forced-colors mode box shadows are not painted and the
 * global focus outline is used instead: pull it inside the row as well.
 */
export const LIST_ROW_LINK =
  "flex items-center gap-3 px-4 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset forced-colors:focus-visible:-outline-offset-2!";

const dayFormat = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "Vrijdag 23 oktober": today's date as the dashboard title. */
function formatToday(value: Date | string): string {
  const text = dayFormat.format(
    typeof value === "string" ? new Date(value) : value,
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function DashboardView() {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.dashboard.overview.queryOptions(undefined, {
      refetchInterval: 10_000,
    }),
  );
  const uid = useId();

  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const d = query.data;
  const open = d.activeAssignments.filter((a) => a.effectiveStatus === "open");
  const planned = d.activeAssignments.filter(
    (a) => a.effectiveStatus === "planned",
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={formatToday(d.serverTime)}
        description={
          open.length === 0
            ? "Er loopt nu geen afname."
            : open.length === 1
              ? "Er loopt nu 1 afname."
              : `Er lopen nu ${open.length} afnames.`
        }
        actions={
          <Button asChild>
            <Link href={routes.docent.newAssignment()}>Afname plannen</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open afnames"
          value={d.counts.openAssignments}
          hint={
            d.counts.plannedAssignments
              ? `${d.counts.plannedAssignments} gepland`
              : "niets gepland"
          }
        />
        <StatCard label="Leerlingen" value={d.counts.students} />
        <StatCard
          label="Gepubliceerde toetsen"
          value={d.counts.publishedTests}
        />
        <StatCard
          label="Te beoordelen"
          value={d.counts.answersNeedingReview}
          tone={d.counts.answersNeedingReview ? "warning" : "default"}
          hint={
            d.counts.answersNeedingReview === 1
              ? "antwoord wacht op jou"
              : d.counts.answersNeedingReview
                ? "antwoorden wachten op jou"
                : "alles is nagekeken"
          }
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section
          className="flex min-w-0 flex-col gap-3"
          aria-labelledby={`${uid}-now`}
        >
          <SectionTitle
            id={`${uid}-now`}
            title="Nu bezig"
            href={routes.docent.assignments}
            linkLabel="Alle afnames"
          />
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Er staat nu geen afname open.{" "}
              <Link
                href={routes.docent.newAssignment()}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Afname plannen
              </Link>
            </p>
          ) : (
            <div
              className={cn("grid gap-3", open.length > 1 && "md:grid-cols-2")}
            >
              {open.map((a) => (
                <LiveCard key={a.id} a={a} />
              ))}
            </div>
          )}

          {planned.length ? (
            <div className="mt-3 flex flex-col gap-3">
              <SectionTitle title="Gepland" />
              <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
                {planned.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={routes.docent.assignment(a.id)}
                      className={cn(LIST_ROW_LINK, "py-3")}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {a.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.className} ·{" "}
                          {a.opensAt
                            ? `opent ${formatMoment(a.opensAt)}`
                            : "jij opent hem zelf"}
                        </span>
                      </span>
                      <ModeBadge
                        mode={a.mode}
                        className="hidden sm:inline-flex"
                      />
                      <ChevronRight
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <div className="flex flex-col gap-6">
          <section
            className="flex flex-col gap-3"
            aria-labelledby={`${uid}-review`}
          >
            <SectionTitle id={`${uid}-review`} title="Te beoordelen" />
            {d.reviewQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Niets na te kijken.
              </p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
                {d.reviewQueue.map((r) => (
                  <li key={r.assignmentId}>
                    <Link
                      href={routes.docent.assignmentGrading(r.assignmentId)}
                      className={cn(LIST_ROW_LINK, "py-3")}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {r.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {r.className}
                        </span>
                      </span>
                      <span className="rounded-sm bg-warning/15 px-1.5 py-0.5 text-xs font-semibold text-warning-ink tabular-nums">
                        {r.count}
                      </span>
                      <ChevronRight
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section
          className="flex min-w-0 flex-col gap-3"
          aria-labelledby={`${uid}-recent`}
        >
          <SectionTitle id={`${uid}-recent`} title="Recent ingeleverd" />
          {d.recentSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nog niets ingeleverd.
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {d.recentSubmissions.map((s) => (
                <li key={s.attemptId}>
                  <Link
                    href={routes.docent.attempt(s.assignmentId, s.attemptId)}
                    className={cn(LIST_ROW_LINK, "py-2.5")}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {s.studentName
                        .split(/\s+/)
                        .map((p) => p[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {s.studentName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {s.assignmentTitle} · {s.className}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      {s.gradingStatus === "graded" && s.grade != null ? (
                        <span
                          className={cn(
                            "text-sm font-bold tabular-nums",
                            s.grade >= 5.5
                              ? "text-success-ink"
                              : "text-destructive-ink",
                          )}
                        >
                          {formatGrade(s.grade)}
                          {s.grade < 5.5 ? (
                            <span className="sr-only"> (onvoldoende)</span>
                          ) : null}
                        </span>
                      ) : (
                        <StatusBadge
                          kind="grading"
                          status={s.gradingStatus}
                          className="h-5 px-2 text-[11px]"
                        />
                      )}
                      {s.submittedAt ? (
                        <RelativeTime
                          date={s.submittedAt}
                          locale="nl"
                          formatStyle="short"
                          className="text-[11px] text-muted-foreground"
                        />
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="flex min-w-0 flex-col gap-3"
          aria-labelledby={`${uid}-last`}
        >
          <SectionTitle id={`${uid}-last`} title="Laatst gesloten afname" />
          {d.lastClosed ? (
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <Link
                    href={routes.docent.assignmentResults(d.lastClosed.id)}
                    className="truncate font-semibold hover:text-primary"
                  >
                    {d.lastClosed.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {d.lastClosed.className}
                    {d.lastClosed.closedAt
                      ? ` · gesloten ${formatMoment(d.lastClosed.closedAt)}`
                      : ""}
                  </span>
                </div>
                <div className="flex gap-4 text-right">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      Gemiddeld
                    </span>
                    <span className="font-display text-xl font-bold tabular-nums">
                      {formatGrade(d.lastClosed.averageGrade)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      Voldoende
                    </span>
                    <span className="font-display text-xl font-bold tabular-nums">
                      {d.lastClosed.passed}/{d.lastClosed.submitted}
                    </span>
                  </div>
                </div>
              </div>
              <AccessibleChart
                title={`Cijferverdeling · ${d.lastClosed.title}`}
                summary={`${passedSentence(d.lastClosed.passed, d.lastClosed.submitted)} Het gemiddelde cijfer is ${formatGrade(d.lastClosed.averageGrade)}.`}
                columns={[
                  { key: "cijfer", header: "Cijfer" },
                  { key: "aantal", header: "Aantal leerlingen" },
                ]}
                rows={d.lastClosed.distribution.map((b) => ({
                  cijfer: b.label,
                  aantal: b.count,
                }))}
              >
                <GradeDistributionChart
                  bins={d.lastClosed.distribution}
                  height={200}
                  ariaLabel={passedSentence(
                    d.lastClosed.passed,
                    d.lastClosed.submitted,
                  )}
                />
              </AccessibleChart>
              <p className="text-xs text-muted-foreground">
                Aantal leerlingen per cijfer. Rood = lager dan 5.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Zodra een afname gesloten is, zie je hier de cijferverdeling.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionTitle({
  id,
  title,
  href,
  linkLabel,
}: {
  id?: string;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {href ? (
        <Link
          href={href}
          className="text-sm font-medium text-primary hover:underline"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

function LiveCard({ a }: { a: Active }) {
  const pct = a.counts.students
    ? Math.round((a.counts.submitted / a.counts.students) * 100)
    : 0;
  return (
    <Link
      href={routes.docent.assignment(a.id)}
      className="group flex flex-col gap-4 rounded-xl border bg-card p-5 transition-colors outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <ModeBadge mode={a.mode} />
          <span className="mt-1 truncate font-semibold group-hover:text-primary">
            {a.title}
          </span>
          <span className="text-xs text-muted-foreground">
            {a.className}
            {a.timeLimitMinutes
              ? ` · ${formatMinutes(a.timeLimitMinutes)}`
              : ""}
          </span>
        </div>
        <span className="font-display text-2xl font-bold tabular-nums">
          {pct}%
        </span>
      </div>
      <AssignmentProgress counts={a.counts} size="lg" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {a.accessCode ? (
          <span>
            Toegangscode{" "}
            <span className="font-mono font-semibold tracking-widest text-foreground">
              {a.accessCode}
            </span>
          </span>
        ) : null}
        <span>
          {a.closesAt
            ? `sluit ${formatMoment(a.closesAt)}`
            : "sluit wanneer jij dat doet"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-primary">
          Live overzicht
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </span>
      </div>
      <span className="sr-only">
        {formatNumber(a.counts.submitted)} van {formatNumber(a.counts.students)}{" "}
        ingeleverd
      </span>
    </Link>
  );
}
