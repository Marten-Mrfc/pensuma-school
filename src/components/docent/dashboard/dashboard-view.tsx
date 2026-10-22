"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Award,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  Clock,
  FileCode2,
  FilePlus2,
  Inbox,
  KeyRound,
  type LucideIcon,
  NotebookPen,
  Radio,
  Send,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { AccessibleChart } from "@/components/a11y/accessible-chart";
import { useCurrentUser } from "@/components/app/current-user";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import {
  formatGrade,
  formatMinutes,
  formatMoment,
  formatNumber,
  greeting,
} from "@/components/docent/assignments/format";
import {
  AssignmentProgress,
  ModeBadge,
} from "@/components/docent/assignments/shared";
import { GradeDistributionChart } from "@/components/docent/review/charts";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";

type Overview = RouterOutputs["dashboard"]["overview"];
type Active = Overview["activeAssignments"][number];

export function DashboardView() {
  const trpc = useTRPC();
  const user = useCurrentUser();
  const query = useQuery(
    trpc.dashboard.overview.queryOptions(undefined, {
      refetchInterval: 10_000,
    }),
  );
  const firstName = user.name.trim().split(/\s+/)[0] ?? "";
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
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        description={
          open.length
            ? `Er ${open.length === 1 ? "loopt nu 1 afname" : `lopen nu ${open.length} afnames`}. Hieronder zie je live hoe ver je leerlingen zijn.`
            : "Er loopt nu geen afname. Plan een toets of kijk werk na."
        }
        actions={
          <Button asChild>
            <Link href={routes.docent.newAssignment()}>
              <CalendarPlus aria-hidden="true" />
              Afname plannen
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open afnames"
          value={d.counts.openAssignments}
          icon={Radio}
          tone="success"
          hint={
            d.counts.plannedAssignments
              ? `${d.counts.plannedAssignments} gepland`
              : "niets gepland"
          }
        />
        <StatCard
          label="Leerlingen"
          value={d.counts.students}
          icon={Users}
          tone="info"
        />
        <StatCard
          label="Gepubliceerde toetsen"
          value={d.counts.publishedTests}
          icon={FileCode2}
          tone="primary"
        />
        <StatCard
          label="Te beoordelen"
          value={d.counts.answersNeedingReview}
          icon={NotebookPen}
          tone={d.counts.answersNeedingReview ? "warning" : "default"}
          hint={
            d.counts.answersNeedingReview
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
            icon={Radio}
            title="Nu bezig"
            href={routes.docent.assignments}
            linkLabel="Alle afnames"
          />
          {open.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-10 text-center">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Radio className="size-5" aria-hidden="true" />
              </span>
              <p className="font-medium">Er is nu geen afname open</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Als een afname open is, zie je hier live hoeveel leerlingen
                bezig zijn en wie al heeft ingeleverd.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href={routes.docent.newAssignment()}>
                  <CalendarPlus aria-hidden="true" />
                  Afname plannen
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {open.map((a) => (
                <LiveCard key={a.id} a={a} />
              ))}
            </div>
          )}

          {planned.length ? (
            <div className="mt-3 flex flex-col gap-3">
              <SectionTitle icon={CalendarClock} title="Gepland" />
              <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
                {planned.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={routes.docent.assignment(a.id)}
                      className="flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info/10 text-info-ink">
                        <CalendarClock className="size-4" aria-hidden="true" />
                      </span>
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
            aria-labelledby={`${uid}-quick`}
          >
            <SectionTitle id={`${uid}-quick`} title="Snel aan de slag" />
            <div className="grid gap-2">
              <QuickAction
                href={routes.docent.tests}
                icon={FilePlus2}
                title="Nieuwe toets"
                description="Maak vragen met code, meerkeuze of open antwoorden."
              />
              <QuickAction
                href={routes.docent.newAssignment()}
                icon={CalendarPlus}
                title="Afname plannen"
                description="Zet een toets klaar voor een klas."
              />
              <QuickAction
                href={routes.docent.classes}
                icon={Upload}
                title="Leerlingen importeren"
                description="Voeg een klas toe vanuit een lijst of Excel."
              />
            </div>
          </section>

          <section
            className="flex flex-col gap-3"
            aria-labelledby={`${uid}-review`}
          >
            <SectionTitle
              id={`${uid}-review`}
              icon={NotebookPen}
              title="Te beoordelen"
            />
            {d.reviewQueue.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border bg-card px-4 py-4 text-sm text-muted-foreground shadow-xs">
                <Inbox className="size-4" aria-hidden="true" />
                Niets na te kijken. Lekker bezig!
              </p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
                {d.reviewQueue.map((r) => (
                  <li key={r.assignmentId}>
                    <Link
                      href={routes.docent.assignmentGrading(r.assignmentId)}
                      className="flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {r.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {r.className}
                        </span>
                      </span>
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning-ink tabular-nums">
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
          <SectionTitle
            id={`${uid}-recent`}
            icon={Send}
            title="Recent ingeleverd"
          />
          {d.recentSubmissions.length === 0 ? (
            <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground shadow-xs">
              Nog niets ingeleverd.
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {d.recentSubmissions.map((s) => (
                <li key={s.attemptId}>
                  <Link
                    href={routes.docent.attempt(s.assignmentId, s.attemptId)}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
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
          <SectionTitle
            id={`${uid}-last`}
            icon={Award}
            title="Laatst gesloten afname"
          />
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
                summary={`${d.lastClosed.passed} van de ${d.lastClosed.submitted} leerlingen hebben een voldoende. Het gemiddelde cijfer is ${formatGrade(d.lastClosed.averageGrade)}.`}
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
                  ariaLabel={`${d.lastClosed.passed} van de ${d.lastClosed.submitted} leerlingen hebben een voldoende.`}
                />
              </AccessibleChart>
              <p className="text-xs text-muted-foreground">
                Aantal leerlingen per cijfer. Rood = lager dan 5.
              </p>
            </div>
          ) : (
            <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground shadow-xs">
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
  icon: Icon,
  title,
  href,
  linkLabel,
}: {
  id?: string;
  icon?: LucideIcon;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2 font-semibold">
        {Icon ? (
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        ) : null}
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
      className="group flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs transition-all outline-none hover:border-primary/40 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <StatusBadge kind="assignment" status="open" />
            <ModeBadge mode={a.mode} />
          </div>
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
          <span className="inline-flex items-center gap-1.5">
            <KeyRound className="size-3.5" aria-hidden="true" />
            <span className="font-mono font-semibold tracking-widest text-foreground">
              {a.accessCode}
            </span>
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden="true" />
          {a.closesAt
            ? `sluit ${formatMoment(a.closesAt)}`
            : "sluit wanneer jij dat doet"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-primary">
          Live overzicht
          <ChevronRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
      <span className="sr-only">
        {formatNumber(a.counts.submitted)} van {formatNumber(a.counts.students)}{" "}
        ingeleverd
      </span>
    </Link>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs transition-all outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight
        className="ml-auto size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
