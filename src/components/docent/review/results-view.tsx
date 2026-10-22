"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Award,
  CheckCircle2,
  Download,
  EyeOff,
  Gauge,
  Loader2,
  MessageSquareText,
  NotebookPen,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { getErrorMessage } from "@/components/app/get-error-message";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { AssignmentNav } from "@/components/docent/assignments/assignment-nav";
import {
  formatGrade,
  formatNumber,
  formatPercent,
} from "@/components/docent/assignments/format";
import { ModeBadge } from "@/components/docent/assignments/shared";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { downloadTextFile } from "@/lib/export/download";
import { QUESTION_TYPE_LABELS } from "@/lib/questions/schema";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { GradeDistributionChart, QuestionAverageChart } from "./charts";

type Results = RouterOutputs["review"]["results"];
type Row = Results["rows"][number];
type Cell = NonNullable<Row["perQuestion"][string]>;
type SortKey = "name" | "number" | "total" | "grade" | `q:${string}`;

/** Background/text classes for a score cell (0 → red … full marks → green). */
export function scoreTone(
  cell: Pick<Cell, "score" | "maxScore" | "status" | "manualScore">,
) {
  if (cell.status === "needs_review" && cell.manualScore == null) {
    return "bg-warning/15 text-warning-ink ring-1 ring-inset ring-warning/40";
  }
  const pct = cell.maxScore ? cell.score / cell.maxScore : 0;
  if (pct >= 0.999) return "bg-success/20 text-success-ink";
  if (pct >= 0.5) return "bg-success/8 text-foreground";
  if (pct > 0) return "bg-warning/12 text-warning-ink";
  return "bg-destructive/10 text-destructive-ink";
}

export function ResultsView({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  const { afnameId } = use(params);
  const trpc = useTRPC();
  const results = useQuery(
    trpc.review.results.queryOptions(
      { assignmentId: afnameId },
      { refetchInterval: 20_000 },
    ),
  );

  if (results.isPending) return <LoadingState />;
  if (results.isError)
    return (
      <ErrorState error={results.error} onRetry={() => results.refetch()} />
    );
  return <ResultsContent data={results.data} />;
}

function ResultsContent({ data }: { data: Results }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const a = data.assignment;
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "name",
    dir: 1,
  });
  const [confirmRegrade, setConfirmRegrade] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.review.pathKey() });
  const exportCsv = useMutation(
    trpc.review.exportCsv.mutationOptions({
      onSuccess: (res) => {
        downloadTextFile(res.filename, res.csv);
        toast.success("Export gedownload", { description: res.filename });
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    }),
  );
  const release = useMutation(
    trpc.assignment.setResultsReleased.mutationOptions({
      onSuccess: async (res) => {
        await invalidate();
        await queryClient.invalidateQueries({
          queryKey: trpc.assignment.pathKey(),
        });
        toast.success(
          res.released ? "Resultaten vrijgegeven" : "Vrijgave ingetrokken",
          {
            description: res.released
              ? "Leerlingen zien nu hun score en feedback."
              : "Leerlingen zien hun score niet meer.",
          },
        );
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    }),
  );
  const regrade = useMutation(trpc.review.regradeAssignment.mutationOptions());

  const canRelease =
    a.showResults === "manual" ||
    (a.showResults === "after_close" && a.effectiveStatus !== "closed");

  const questionIndex = new Map(data.questions.map((q, i) => [q.id, i]));
  const sorted = [...data.rows].sort((x, y) => {
    const dir = sort.dir;
    const val = (r: Row): string | number | null => {
      if (sort.key === "name") return r.student.name;
      if (sort.key === "number") return r.student.studentNumber ?? "";
      if (!r.attempt || r.attempt.status !== "submitted") return null;
      if (sort.key === "total") return r.attempt.score;
      if (sort.key === "grade") return r.attempt.grade;
      const cell = r.perQuestion[sort.key.slice(2)];
      return cell ? (cell.maxScore ? cell.score / cell.maxScore : 0) : null;
    };
    const vx = val(x);
    const vy = val(y);
    if (vx == null && vy == null)
      return x.student.name.localeCompare(y.student.name, "nl");
    if (vx == null) return 1;
    if (vy == null) return -1;
    const c =
      typeof vx === "number" && typeof vy === "number"
        ? vx - vy
        : String(vx).localeCompare(String(vy), "nl");
    return c * dir || x.student.name.localeCompare(y.student.name, "nl");
  });

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 1 ? -1 : 1 }
        : { key, dir: key === "name" || key === "number" ? 1 : -1 },
    );

  const statsByQuestion = new Map(
    data.stats.perQuestion.map((s) => [s.questionId, s]),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={routes.docent.assignments}
        backLabel="Afnames"
        title={a.title}
        badge={
          <>
            <StatusBadge kind="assignment" status={a.effectiveStatus} />
            <ModeBadge mode={a.mode} />
          </>
        }
        description={`${a.className} · ${a.testTitle} · ${data.questions.length} vragen · ${formatNumber(a.totalPoints)} punten`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirmRegrade(true)}
              disabled={data.stats.submitted === 0}
            >
              <RefreshCw aria-hidden="true" />
              Opnieuw nakijken
            </Button>
            {canRelease ? (
              <Button
                variant={a.resultsReleased ? "outline" : "default"}
                disabled={release.isPending}
                onClick={() =>
                  release.mutate({ id: a.id, released: !a.resultsReleased })
                }
              >
                {a.resultsReleased ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Send aria-hidden="true" />
                )}
                {a.resultsReleased
                  ? "Vrijgave intrekken"
                  : "Resultaten vrijgeven"}
              </Button>
            ) : null}
            <Button
              onClick={() => exportCsv.mutate({ assignmentId: a.id })}
              disabled={exportCsv.isPending}
            >
              {exportCsv.isPending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Download aria-hidden="true" />
              )}
              Exporteren
            </Button>
          </>
        }
      />
      <AssignmentNav
        assignmentId={a.id}
        active="results"
        needsReview={data.stats.needsReview}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Gemiddeld cijfer"
          value={formatGrade(data.stats.averageGrade)}
          icon={Award}
          tone="primary"
          hint={
            data.stats.averagePercentage != null
              ? `${formatPercent(data.stats.averagePercentage)} van de punten`
              : "Nog geen inleveringen"
          }
        />
        <StatCard
          label="Voldoendes"
          value={
            data.stats.submitted
              ? `${data.stats.passed}/${data.stats.submitted}`
              : "–"
          }
          icon={CheckCircle2}
          tone="success"
          hint="cijfer 5,5 of hoger"
        />
        <StatCard
          label="Ingeleverd"
          value={`${data.stats.submitted}/${data.stats.students}`}
          icon={Users}
          hint={
            data.stats.inProgress
              ? `${data.stats.inProgress} nog bezig · ${data.stats.notStarted} niet begonnen`
              : `${data.stats.notStarted} niet begonnen`
          }
        />
        <StatCard
          label="Nog nakijken"
          value={data.stats.needsReview}
          icon={NotebookPen}
          tone={data.stats.needsReview ? "warning" : "default"}
          hint={
            data.stats.needsReview ? (
              <Link
                href={routes.docent.assignmentGrading(a.id)}
                className="font-medium text-primary hover:underline"
              >
                Naar nakijken →
              </Link>
            ) : (
              "alles is beoordeeld"
            )
          }
        />
      </div>

      {data.rows.length === 0 ? (
        <EmptyBlock icon={Users} title="Deze klas heeft nog geen leerlingen" />
      ) : (
        <section className="flex flex-col gap-3" aria-labelledby="matrix-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="matrix-title" className="font-semibold">
                Scores per vraag
              </h2>
              <p className="text-sm text-muted-foreground">
                Klik op een score om de poging te bekijken en na te kijken. Klik
                op een kolomkop om te sorteren.
              </p>
            </div>
            <Legend />
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th
                    scope="col"
                    className="sticky left-0 z-20 min-w-48 border-b bg-card px-4 py-2 text-left font-medium"
                  >
                    <SortButton
                      active={sort.key === "name"}
                      dir={sort.dir}
                      onClick={() => toggleSort("name")}
                    >
                      Leerling
                    </SortButton>
                  </th>
                  {data.questions.map((q, i) => (
                    <th
                      key={q.id}
                      scope="col"
                      className="min-w-14 border-b bg-muted/30 px-1 py-2 text-center font-medium"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <SortButton
                              active={sort.key === `q:${q.id}`}
                              dir={sort.dir}
                              onClick={() => toggleSort(`q:${q.id}`)}
                              className="justify-center"
                            >
                              V{i + 1}
                            </SortButton>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span className="font-medium">{q.title}</span>
                          <span className="block text-xs opacity-80">
                            {QUESTION_TYPE_LABELS[q.type]} ·{" "}
                            {formatNumber(q.points)} pt
                          </span>
                        </TooltipContent>
                      </Tooltip>
                      <span className="block text-[10px] font-normal tabular-nums opacity-70">
                        {formatNumber(q.points)} pt
                      </span>
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="min-w-20 border-b border-l px-3 py-2 text-right font-medium"
                  >
                    <SortButton
                      active={sort.key === "total"}
                      dir={sort.dir}
                      onClick={() => toggleSort("total")}
                      className="justify-end"
                    >
                      Totaal
                    </SortButton>
                  </th>
                  <th
                    scope="col"
                    className="min-w-20 border-b px-3 py-2 text-right font-medium"
                  >
                    <SortButton
                      active={sort.key === "grade"}
                      dir={sort.dir}
                      onClick={() => toggleSort("grade")}
                      className="justify-end"
                    >
                      Cijfer
                    </SortButton>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <ResultRow
                    key={row.student.id}
                    row={row}
                    data={data}
                    onOpen={(href) => router.push(href)}
                  />
                ))}
              </tbody>
              {data.stats.submitted > 0 ? (
                <tfoot>
                  <tr className="text-xs text-muted-foreground">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-medium"
                    >
                      Gemiddeld
                    </th>
                    {data.questions.map((q) => {
                      const s = statsByQuestion.get(q.id);
                      return (
                        <td
                          key={q.id}
                          className="bg-muted/30 px-1 py-2.5 text-center font-medium tabular-nums"
                        >
                          {formatPercent(s?.averagePercentage)}
                        </td>
                      );
                    })}
                    <td className="border-l px-3 py-2.5 text-right font-medium tabular-nums">
                      {formatNumber(data.stats.averageScore)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-foreground tabular-nums">
                      {formatGrade(data.stats.averageGrade)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          <span className="sr-only">{questionIndex.size} vragen</span>
        </section>
      )}

      {data.stats.submitted > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="flex flex-col gap-2 rounded-xl border bg-card p-5 shadow-xs">
            <h2 className="flex items-center gap-2 font-semibold">
              <Gauge
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              Gemiddelde score per vraag
            </h2>
            <p className="text-xs text-muted-foreground">
              Percentage van de punten, gemiddeld over {data.stats.submitted}{" "}
              ingeleverde pogingen. Rood = minder dan 50%.
            </p>
            <QuestionAverageChart
              items={data.questions.map((q, i) => ({
                label: `V${i + 1}`,
                title: q.title,
                percentage:
                  statsByQuestion.get(q.id)?.averagePercentage ?? null,
              }))}
            />
          </section>
          <section className="flex flex-col gap-2 rounded-xl border bg-card p-5 shadow-xs">
            <h2 className="flex items-center gap-2 font-semibold">
              <Award
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              Cijferverdeling
            </h2>
            <p className="text-xs text-muted-foreground">
              Aantal leerlingen per cijfer (1 + 9 × score/max). Rood = lager dan
              5.
            </p>
            <GradeDistributionChart bins={data.stats.distribution} />
          </section>
        </div>
      ) : null}

      {data.stats.submitted > 0 ? <QuestionStatsTable data={data} /> : null}

      <ConfirmDialog
        open={confirmRegrade}
        onOpenChange={setConfirmRegrade}
        title="Alles opnieuw nakijken?"
        description={`Alle ${data.stats.submitted} ingeleverde pogingen worden opnieuw automatisch nagekeken met de huidige testgevallen. Handmatige scores en feedback blijven staan. Dit kan even duren.`}
        confirmLabel="Opnieuw nakijken"
        onConfirm={async () => {
          const res = await regrade.mutateAsync({ assignmentId: a.id });
          await invalidate();
          await queryClient.invalidateQueries({
            queryKey: trpc.assignment.pathKey(),
          });
          if (res.failed) {
            toast.warning(
              `${res.graded} pogingen nagekeken, ${res.failed} mislukt`,
              {
                description:
                  "Probeer het later nog eens voor de mislukte pogingen.",
              },
            );
          } else {
            toast.success(
              `${res.graded} ${res.graded === 1 ? "poging" : "pogingen"} opnieuw nagekeken`,
            );
          }
        }}
      />
    </div>
  );
}

function ResultRow({
  row,
  data,
  onOpen,
}: {
  row: Row;
  data: Results;
  onOpen: (href: string) => void;
}) {
  const at = row.attempt;
  const attemptHref = at
    ? routes.docent.attempt(data.assignment.id, at.id)
    : null;
  return (
    <tr className="group">
      <th
        scope="row"
        className="sticky left-0 z-10 border-b bg-card px-4 py-2 text-left font-normal group-hover:bg-muted/40"
      >
        {attemptHref ? (
          <Link
            href={attemptHref}
            className="flex flex-col rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="font-medium text-foreground hover:text-primary">
              {row.student.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {row.student.studentNumber}
              {row.attemptCount > 1
                ? ` · poging ${at?.attemptNumber} van ${row.attemptCount}`
                : ""}
            </span>
          </Link>
        ) : (
          <span className="flex flex-col">
            <span className="font-medium text-muted-foreground">
              {row.student.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {row.student.studentNumber}
            </span>
          </span>
        )}
      </th>
      {!at || at.status !== "submitted" ? (
        <td
          colSpan={data.questions.length}
          className="border-b bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
        >
          {at ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full bg-warning"
                aria-hidden="true"
              />
              Nog bezig met de toets
            </span>
          ) : (
            "Niet begonnen"
          )}
        </td>
      ) : (
        data.questions.map((q) => {
          const cell = row.perQuestion[q.id];
          if (!cell) {
            return (
              <td
                key={q.id}
                className="border-b p-1 text-center text-xs text-muted-foreground"
              >
                –
              </td>
            );
          }
          const href = `${attemptHref}#vraag-${q.id}`;
          const review =
            cell.status === "needs_review" && cell.manualScore == null;
          return (
            <td key={q.id} className="border-b p-1 text-center">
              <button
                type="button"
                onClick={() => onOpen(href)}
                title={`${q.title}: ${formatNumber(cell.score)} van ${formatNumber(cell.maxScore)}${review ? " (nog nakijken)" : ""}${cell.manualScore != null ? " · handmatig aangepast" : ""}`}
                className={cn(
                  "relative inline-flex h-8 w-full min-w-11 items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-all outline-none hover:brightness-95 hover:ring-2 hover:ring-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  scoreTone(cell),
                  !cell.answered && !review && "font-normal opacity-70",
                )}
              >
                {review ? "?" : formatNumber(cell.score, 1)}
                {cell.manualScore != null ? (
                  <span
                    className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                ) : null}
                {cell.hasFeedback ? (
                  <MessageSquareText
                    className="absolute bottom-0.5 left-0.5 size-2.5 opacity-60"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            </td>
          );
        })
      )}
      <td className="border-b border-l px-3 py-2 text-right font-semibold tabular-nums">
        {at?.status === "submitted" ? (
          <span>
            {formatNumber(at.score)}
            <span className="font-normal text-muted-foreground">
              /{formatNumber(at.maxScore)}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </td>
      <td className="border-b px-3 py-2 text-right tabular-nums">
        {at?.status === "submitted" && at.grade != null ? (
          <span
            className={cn(
              "inline-flex min-w-11 justify-center rounded-md px-2 py-1 text-sm font-bold",
              at.grade >= 5.5
                ? "bg-success/12 text-success-ink"
                : "bg-destructive/10 text-destructive-ink",
              at.provisional && "ring-1 ring-warning/50 ring-inset",
            )}
            title={
              at.provisional
                ? "Voorlopig: er moet nog iets worden nagekeken"
                : undefined
            }
          >
            {formatGrade(at.grade)}
            {at.provisional ? "*" : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </td>
    </tr>
  );
}

function SortButton({
  active,
  dir,
  onClick,
  className,
  children,
}: {
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const Icon = dir === 1 ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-sm whitespace-nowrap outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active && "text-foreground",
        className,
      )}
    >
      {children}
      {active ? (
        <Icon
          className="size-3"
          aria-label={dir === 1 ? "oplopend" : "aflopend"}
        />
      ) : null}
    </button>
  );
}

function Legend() {
  const items = [
    { cls: "bg-success/20", label: "Alles goed" },
    {
      cls: "bg-success/8 ring-1 ring-inset ring-border",
      label: "Meer dan de helft",
    },
    { cls: "bg-warning/12", label: "Deels" },
    { cls: "bg-destructive/10", label: "0 punten" },
    {
      cls: "bg-warning/15 ring-1 ring-inset ring-warning/40",
      label: "? Nog nakijken",
    },
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded-sm", i.cls)} aria-hidden="true" />
          {i.label}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
        Handmatig aangepast
      </li>
      <li>* = voorlopig cijfer</li>
    </ul>
  );
}

function QuestionStatsTable({ data }: { data: Results }) {
  const stats = new Map(data.stats.perQuestion.map((s) => [s.questionId, s]));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="question-stats">
      <h2 id="question-stats" className="font-semibold">
        Per vraag
      </h2>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Vraag
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2.5 font-medium sm:table-cell"
              >
                Soort
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Gemiddeld
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2.5 text-right font-medium sm:table-cell"
              >
                Alles goed
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2.5 text-right font-medium md:table-cell"
              >
                Beantwoord
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Nakijken
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.questions.map((q, i) => {
              const s = stats.get(q.id);
              const pct = s?.averagePercentage ?? null;
              return (
                <tr key={q.id}>
                  <td className="px-4 py-2.5">
                    <span className="mr-2 text-xs font-semibold text-muted-foreground tabular-nums">
                      V{i + 1}
                    </span>
                    <span className="font-medium">{q.title}</span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">
                    {QUESTION_TYPE_LABELS[q.type]}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:inline-block">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            pct != null && pct < 0.5
                              ? "bg-destructive"
                              : "bg-primary",
                          )}
                          style={{ width: `${Math.round((pct ?? 0) * 100)}%` }}
                        />
                      </span>
                      {formatNumber(s?.averageScore)} / {formatNumber(q.points)}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                    {formatPercent(s?.fullMarksPercentage)}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">
                    {s?.answered ?? 0}/{data.stats.submitted}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {s?.needsReview ? (
                      <Link
                        href={`${routes.docent.assignmentGrading(data.assignment.id)}?vraag=${q.id}`}
                        className="font-medium text-warning-ink hover:underline"
                      >
                        {s.needsReview}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
