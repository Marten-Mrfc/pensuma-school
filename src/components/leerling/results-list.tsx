"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Award, EyeOff, Hourglass, Timer } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import {
  formatGrade,
  formatMoment,
  formatNumber,
  hiddenResultLabel,
} from "./format";
import { ModeBadge } from "./mode-badge";

type Row = RouterOutputs["portal"]["myResults"][number];

export function ScoreCell({ row }: { row: Row }) {
  if (!row.visible) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <EyeOff className="size-4" aria-hidden="true" />
        {hiddenResultLabel(row)}
      </span>
    );
  }
  if (row.gradingStatus === "pending" || row.score == null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Hourglass className="size-4" aria-hidden="true" />
        Wordt nagekeken
      </span>
    );
  }
  return (
    <span className="flex items-center gap-3 tabular-nums">
      <span className="text-sm text-muted-foreground">
        {formatNumber(row.score)}/{formatNumber(row.maxScore)}
      </span>
      {row.grade != null ? (
        <span className="flex flex-col items-end">
          <span className="rounded-lg bg-primary/10 px-2.5 py-0.5 font-display text-lg font-bold text-primary">
            {formatGrade(row.grade)}
          </span>
          {row.gradingStatus === "needs_review" ? (
            <span className="mt-0.5 text-[0.7rem] text-muted-foreground">
              voorlopig
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

export function ResultsList() {
  const trpc = useTRPC();
  const query = useQuery(trpc.portal.myResults.queryOptions());

  const header = (
    <PageHeader
      title="Resultaten"
      description="Alle toetsen en oefeningen die je hebt ingeleverd. Klik op een toets om te zien hoe het ging."
    />
  );

  if (query.isPending) {
    return (
      <>
        {header}
        <LoadingState variant="list" />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {header}
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </>
    );
  }

  const rows = query.data;
  const grades = rows.map((r) => r.grade).filter((g): g is number => g != null);
  const best = grades.length ? Math.max(...grades) : null;

  return (
    <>
      {header}
      {rows.length ? (
        <>
          {best != null ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-card p-4 shadow-xs">
                <p className="text-sm text-muted-foreground">Ingeleverd</p>
                <p className="font-display text-3xl font-bold tabular-nums">
                  {rows.length}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-xs">
                <p className="text-sm text-muted-foreground">Hoogste cijfer</p>
                <p className="font-display text-3xl font-bold text-primary tabular-nums">
                  {formatGrade(best)}
                </p>
              </div>
            </div>
          ) : null}
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-xs">
            {rows.map((row) => (
              <li key={row.attemptId}>
                <Link
                  href={routes.leerling.result(row.attemptId)}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors outline-none hover:bg-accent/50 focus-visible:bg-accent/60"
                >
                  <div className="flex min-w-0 flex-1 basis-[14rem] flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{row.title}</span>
                      <ModeBadge mode={row.mode} />
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                      <span>{formatMoment(row.submittedAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{row.className}</span>
                      {row.attemptNumber > 1 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>poging {row.attemptNumber}</span>
                        </>
                      ) : null}
                      {row.autoSubmitted ? (
                        <span className="inline-flex items-center gap-1">
                          <Timer className="size-3.5" aria-hidden="true" />
                          automatisch ingeleverd
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <ScoreCell row={row} />
                    <ArrowRight
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyBlock
          icon={Award}
          title="Nog geen resultaten"
          description="Zodra je een toets of oefening inlevert, zie je hier je resultaat."
          action={
            <Button asChild>
              <Link href={routes.leerling.dashboard}>Naar mijn toetsen</Link>
            </Button>
          }
        />
      )}
    </>
  );
}
