"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleDot,
  CircleMinus,
  Clock,
  EyeOff,
  Hourglass,
  Lightbulb,
  Loader2,
  PlayCircle,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, use } from "react";
import { HighlightedCode } from "@/components/app/highlighted-code";
import { Markdown } from "@/components/app/markdown";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { TestResultsList } from "@/components/python";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useDocumentTitle } from "@/lib/a11y/use-document-title";
import { QUESTION_TYPE_LABELS } from "@/lib/questions/schema";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import {
  formatGrade,
  formatHintsUsed,
  formatMoment,
  formatNumber,
} from "./format";
import { ModeBadge } from "./mode-badge";
import { ProvisionalScoreNote } from "./monitoring/provisional-score-note";

type Result = RouterOutputs["portal"]["getResult"];
type VisibleResult = Extract<Result, { visible: true }>;
type ResultQuestion = VisibleResult["questions"][number];
type Solutions = RouterOutputs["help"]["solutions"]["solutions"];

type Verdict =
  | "correct"
  | "partial"
  | "wrong"
  | "review"
  | "empty"
  | "pending"
  | "neutralized";

function verdictOf(q: ResultQuestion): Verdict {
  if (q.neutralized) return "neutralized";
  if (!q.answered && !q.reviewed && !q.earned) return "empty";
  if (q.status === "needs_review" && !q.reviewed) return "review";
  if (q.earned == null) return "pending";
  if (q.earned >= q.points - 1e-9) return "correct";
  if (q.earned > 0) return "partial";
  return "wrong";
}

const VERDICT: Record<
  Verdict,
  {
    icon: typeof CheckCircle2;
    label: string;
    /** Tag tone (the counts in the score summary). */
    className: string;
    /** Icon colour in a question row. */
    ink: string;
  }
> = {
  correct: {
    icon: CheckCircle2,
    label: "Goed",
    className: "bg-success/12 text-success-ink",
    ink: "text-success-ink",
  },
  partial: {
    icon: CircleDashed,
    label: "Deels goed",
    className: "bg-warning/15 text-warning-ink",
    ink: "text-warning-ink",
  },
  wrong: {
    icon: XCircle,
    label: "Niet goed",
    className: "bg-destructive/10 text-destructive-ink",
    ink: "text-destructive-ink",
  },
  review: {
    icon: Clock,
    label: "Wordt nagekeken door je docent",
    className: "bg-info/12 text-info-ink",
    ink: "text-info-ink",
  },
  empty: {
    icon: CircleMinus,
    label: "Niet beantwoord",
    className: "bg-muted text-muted-foreground",
    ink: "text-muted-foreground",
  },
  pending: {
    icon: Hourglass,
    label: "Wordt nagekeken",
    className: "bg-info/12 text-info-ink",
    ink: "text-info-ink",
  },
  neutralized: {
    icon: Ban,
    label: "Vervalt",
    className: "bg-muted text-muted-foreground",
    ink: "text-muted-foreground",
  },
};

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border bg-card px-6 py-12 text-center">
      {children}
    </div>
  );
}

function motivation(pct: number) {
  if (pct >= 90) return "Uitstekend gedaan.";
  if (pct >= 75) return "Goed gedaan.";
  if (pct >= 55) return "Netjes. Kijk hieronder wat er nog beter kan.";
  if (pct >= 35) return "Een begin. Kijk hieronder wat er misging.";
  return "Dit ging nog niet goed. Kijk per vraag wat er misging.";
}

function ScoreHero({ result }: { result: VisibleResult }) {
  const score = result.score ?? 0;
  const pct = result.maxScore ? Math.round((score / result.maxScore) * 100) : 0;
  const reviewCount = result.questions.filter(
    (q) => verdictOf(q) === "review",
  ).length;
  const counts = result.questions.reduce(
    (acc, q) => {
      acc[verdictOf(q)]++;
      return acc;
    },
    {
      correct: 0,
      partial: 0,
      wrong: 0,
      review: 0,
      empty: 0,
      pending: 0,
      neutralized: 0,
    } as Record<Verdict, number>,
  );
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-7">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex shrink-0 flex-col items-center sm:items-start sm:border-r sm:pr-8">
          <span className="font-display text-5xl leading-none font-bold tabular-nums">
            {formatGrade(result.grade)}
          </span>
          <span className="mt-1 text-xs font-medium text-muted-foreground">
            {reviewCount ? "voorlopig cijfer" : "cijfer"}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
          <p className="text-lg font-semibold">{motivation(pct)}</p>
          <p className="text-muted-foreground">
            Je haalde{" "}
            <strong className="font-semibold text-foreground tabular-nums">
              {formatNumber(score)} van de {formatNumber(result.maxScore)}{" "}
              punten
            </strong>{" "}
            ({pct}%).
          </p>
          <ul className="flex flex-wrap justify-center gap-2 sm:justify-start">
            {(
              [
                "correct",
                "partial",
                "wrong",
                "empty",
                "review",
                "neutralized",
              ] as const
            )
              .filter((v) => counts[v])
              .map((v) => {
                const meta = VERDICT[v];
                return (
                  <li
                    key={v}
                    className={cn(
                      "inline-flex h-6 w-fit shrink-0 items-center rounded-sm px-2 text-xs font-medium whitespace-nowrap tabular-nums",
                      meta.className,
                    )}
                  >
                    {counts[v]}{" "}
                    {v === "review"
                      ? "nog na te kijken"
                      : v === "neutralized"
                        ? counts[v] === 1
                          ? "vervallen vraag"
                          : "vervallen vragen"
                        : meta.label.toLowerCase()}
                  </li>
                );
              })}
          </ul>
          {reviewCount ? (
            <p className="text-sm text-info-ink">
              Je docent moet nog{" "}
              {reviewCount === 1 ? "1 vraag" : `${reviewCount} vragen`}{" "}
              nakijken. Je cijfer kan dus nog veranderen.
            </p>
          ) : null}
          {result.provisional ? <ProvisionalScoreNote /> : null}
        </div>
      </div>
    </section>
  );
}

function ChoiceReview({
  choice,
}: {
  choice: NonNullable<ResultQuestion["choice"]>;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {choice.options.map((o) => {
        if (o.correct === null) {
          // The right answers are hidden: only show what was chosen.
          return (
            <li
              key={o.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3",
                o.selected ? "border-foreground/30 bg-muted/60" : "bg-card",
              )}
            >
              <span className="mt-0.5 shrink-0">
                {o.selected ? (
                  <CircleDot
                    className="size-5 text-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="block size-5 rounded-full border-2 border-border"
                    aria-hidden="true"
                  />
                )}
              </span>
              <div className="min-w-0 flex-1 text-sm [&_p]:my-0">
                <Markdown>{o.text}</Markdown>
              </div>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {o.selected ? "Jouw keuze" : ""}
              </span>
            </li>
          );
        }
        const tone = o.correct
          ? "border-success/40 bg-success/8"
          : o.selected
            ? "border-destructive/40 bg-destructive/6"
            : "border-border bg-card";
        return (
          <li
            key={o.id}
            className={cn("flex items-start gap-3 rounded-lg border p-3", tone)}
          >
            <span className="mt-0.5 shrink-0">
              {o.correct ? (
                <CheckCircle2
                  className="size-5 text-success-ink"
                  aria-hidden="true"
                />
              ) : o.selected ? (
                <XCircle
                  className="size-5 text-destructive-ink"
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="block size-5 rounded-full border-2 border-border"
                  aria-hidden="true"
                />
              )}
            </span>
            <div className="min-w-0 flex-1 text-sm [&_p]:my-0">
              <Markdown>{o.text}</Markdown>
            </div>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {o.selected && o.correct
                ? "Jouw keuze · goed"
                : o.selected
                  ? "Jouw keuze"
                  : o.correct
                    ? "Goed antwoord"
                    : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RubricReview({
  rubric,
}: {
  rubric: NonNullable<ResultQuestion["rubric"]>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">Beoordelingscriteria</h4>
      <ul className="flex flex-col gap-1.5">
        {rubric.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm"
          >
            <span
              className={cn(
                "mt-1 shrink-0",
                item.achieved ? "text-success-ink" : "text-destructive-ink",
              )}
            >
              {item.achieved ? (
                <Check
                  className="size-4"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              ) : (
                <X className="size-4" strokeWidth={2.5} aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1 leading-6">{item.label}</span>
            <span
              className={cn(
                "shrink-0 text-xs font-medium leading-6",
                item.achieved ? "text-success-ink" : "text-muted-foreground",
              )}
            >
              {item.achieved ? "behaald" : "niet behaald"} ·{" "}
              {formatNumber(item.points)} pt
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SolutionReview({
  solution,
}: {
  solution: NonNullable<Solutions[string]>;
}) {
  return (
    <Collapsible className="group/solution rounded-lg border">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left text-sm font-medium outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring">
        Modeloplossing bekijken
        <ChevronDown
          className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]/solution:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">
        <p className="text-sm text-muted-foreground">
          Er zijn vaak meerdere goede oplossingen. Vergelijk het idee, niet elke
          letter.
        </p>
        {solution.solution ? (
          <HighlightedCode
            code={solution.solution}
            language="python"
            showLineNumbers
          />
        ) : null}
        {solution.modelAnswer ? (
          <p className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {solution.modelAnswer}
          </p>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function QuestionReview({
  q,
  solution,
}: {
  q: ResultQuestion;
  solution: Solutions[string] | undefined;
}) {
  const verdict = verdictOf(q);
  const response = q.response;
  return (
    <div className="flex flex-col gap-5 pt-1">
      {q.neutralized ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {q.neutralized === "drop"
            ? "Deze vraag telt niet mee."
            : "Deze vraag telt niet mee: iedereen krijgt er alle punten voor."}
        </p>
      ) : null}
      {q.prompt.trim() ? (
        <details className="group rounded-lg border bg-muted/30 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground select-none">
            Opdracht bekijken
          </summary>
          <div className="mt-3 text-sm">
            <Markdown>{q.prompt}</Markdown>
          </div>
        </details>
      ) : null}

      {q.type === "code" ? (
        <>
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold">Jouw code</h4>
            {response && "code" in response && response.code.trim() ? (
              <HighlightedCode
                code={response.code}
                language="python"
                showLineNumbers
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Je hebt hier geen code ingeleverd.
              </p>
            )}
          </div>
          {q.codeResult ? (
            q.codeResult.status === "internal_error" ? (
              <p className="rounded-lg bg-info/10 p-3 text-sm text-info-ink">
                Deze vraag kon niet automatisch worden nagekeken. Je docent
                kijkt hem na.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold">Testresultaten</h4>
                <TestResultsList result={q.codeResult} headingLevel={5} />
              </div>
            )
          ) : null}
        </>
      ) : null}

      {q.type === "multiple_choice" && q.choice ? (
        <ChoiceReview choice={q.choice} />
      ) : null}

      {q.type === "open" ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Jouw antwoord</h4>
          {response && "text" in response && response.text.trim() ? (
            <p className="rounded-lg border bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap">
              {response.text}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Je hebt deze vraag niet beantwoord.
            </p>
          )}
          {verdict === "review" ? (
            <p className="text-sm text-info-ink">
              Je docent kijkt deze vraag nog na.
            </p>
          ) : null}
          {q.rubric ? <RubricReview rubric={q.rubric} /> : null}
        </div>
      ) : null}

      {q.feedback?.trim() ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
          <h4 className="text-sm font-semibold">Feedback van je docent</h4>
          <div className="text-sm">
            <Markdown>{q.feedback}</Markdown>
          </div>
        </div>
      ) : null}

      {solution ? <SolutionReview solution={solution} /> : null}
    </div>
  );
}

/**
 * Focus indicator of a question row. The card clips its content
 * (overflow-hidden, for the rounded corners), which hides the trigger's own
 * ring, so the card draws an outline while its trigger has keyboard focus:
 * an element's own outline is not clipped by its overflow, and outlines
 * stay visible in forced-colors mode (box-shadow rings do not). Only the
 * row's own trigger counts, not buttons inside the opened review.
 */
export const QUESTION_ITEM_FOCUS_CLASS =
  "has-[>[data-slot=accordion-header]>[data-slot=accordion-trigger]:focus-visible]:outline-2 has-[>[data-slot=accordion-header]>[data-slot=accordion-trigger]:focus-visible]:outline-offset-2 has-[>[data-slot=accordion-header]>[data-slot=accordion-trigger]:focus-visible]:outline-ring";

export function QuestionAccordion({
  questions,
  solutions,
}: {
  questions: ResultQuestion[];
  solutions: Solutions;
}) {
  return (
    <Accordion
      type="multiple"
      variant="separated"
      className="flex flex-col gap-2 space-y-0"
    >
      {questions.map((q) => {
        const verdict = verdictOf(q);
        const meta = VERDICT[verdict];
        const Icon = meta.icon;
        return (
          <AccordionItem
            key={q.id}
            value={q.id}
            className={cn(
              "overflow-hidden rounded-xl border bg-card",
              QUESTION_ITEM_FOCUS_CLASS,
            )}
          >
            <AccordionHeader>
              <AccordionTrigger className="items-center gap-3 px-4 py-3.5 hover:no-underline focus-visible:ring-0">
                <span className={cn("shrink-0", meta.ink)}>
                  <Icon className="size-5" aria-hidden="true" />
                  <span className="sr-only">{meta.label}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
                    Vraag {q.position} · {QUESTION_TYPE_LABELS[q.type]}
                    {q.neutralized ? (
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 text-foreground">
                        Vervalt
                      </span>
                    ) : null}
                    {q.hints ? (
                      <span className="inline-flex items-center gap-1 text-warning-ink">
                        <Lightbulb className="size-3" aria-hidden="true" />
                        {formatHintsUsed(q.hints.used, q.hints.penaltyPoints)}
                      </span>
                    ) : null}
                  </span>
                  <span className="max-w-full truncate font-semibold">
                    {q.title}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {q.earned == null ? "–" : formatNumber(q.earned)}
                  <span className="font-normal text-muted-foreground">
                    /{formatNumber(q.points)}
                  </span>
                </span>
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionContent className="px-4 pb-5">
              <QuestionReview q={q} solution={solutions[q.id]} />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function ResultContent({ attemptId }: { attemptId: string }) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.portal.getResult.queryOptions(
      { attemptId },
      {
        refetchInterval: (q) => {
          const d = q.state.data;
          return d?.visible && d.gradingStatus === "pending" ? 2000 : false;
        },
      },
    ),
  );

  const solutionsQuery = useQuery(
    trpc.help.solutions.queryOptions(
      { attemptId },
      {
        enabled:
          !!query.data?.visible &&
          query.data.gradingStatus !== "pending" &&
          query.data.mode === "practice",
      },
    ),
  );
  useDocumentTitle([query.data?.title, "Resultaat"]);

  const header = (title: string, extra?: ReactNode) => (
    <PageHeader
      title={title}
      backHref={routes.leerling.results}
      backLabel="Resultaten"
      badge={extra}
    />
  );

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <>
        {header("Resultaat")}
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </>
    );
  }
  const r = query.data;

  const retry = r.canRetry ? (
    <Button asChild>
      <Link href={routes.leerling.assignment(r.assignmentId)}>
        <RotateCcw aria-hidden="true" />
        Opnieuw proberen
      </Link>
    </Button>
  ) : null;

  const subtitle = (
    <span>
      {r.submittedAt
        ? `Ingeleverd ${formatMoment(r.submittedAt)}`
        : "Nog niet ingeleverd"}
      {r.autoSubmitted ? " · automatisch ingeleverd toen de tijd om was" : ""}
      {r.maxAttempts > 1
        ? ` · poging ${r.attemptNumber} van ${r.maxAttempts}`
        : ""}
    </span>
  );

  if (r.attemptStatus !== "submitted") {
    return (
      <>
        {header(r.title, <ModeBadge mode={r.mode} />)}
        <Centered>
          <h2 className="font-display text-2xl font-bold">Je bent nog bezig</h2>
          <p className="text-muted-foreground">
            Deze toets is nog niet ingeleverd.
          </p>
          <Button asChild size="lg">
            <Link href={routes.leerling.assignment(r.assignmentId)}>
              <PlayCircle aria-hidden="true" />
              Verdergaan
            </Link>
          </Button>
        </Centered>
      </>
    );
  }

  if (!r.visible) {
    return (
      <>
        {header(r.title, <ModeBadge mode={r.mode} />)}
        <Centered>
          <h2 className="font-display text-2xl font-bold">
            Je werk is ingeleverd
          </h2>
          <p className="text-muted-foreground">{r.message}</p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button asChild variant="outline">
              <Link href={routes.leerling.dashboard}>Naar mijn toetsen</Link>
            </Button>
            {retry}
          </div>
        </Centered>
      </>
    );
  }

  if (r.gradingStatus === "pending") {
    const { done, total } = r.gradingProgress;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
      <>
        {header(r.title, <ModeBadge mode={r.mode} />)}
        <Centered>
          <Loader2
            className="size-10 animate-spin text-primary"
            aria-hidden="true"
          />
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Je antwoorden worden nagekeken…
          </h2>
          <p className="text-muted-foreground">
            Je code wordt getest met alle testgevallen, ook de verborgen. Dit
            duurt meestal minder dan een halve minuut.
          </p>
          <div
            className="flex w-full max-w-xs flex-col gap-1.5"
            aria-live="polite"
          >
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
              aria-label="Voortgang van het nakijken"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700"
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {done} van {total} vragen nagekeken
            </span>
          </div>
        </Centered>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={r.title}
        backHref={routes.leerling.results}
        backLabel="Resultaten"
        badge={<ModeBadge mode={r.mode} />}
        description={subtitle}
        actions={retry}
      />
      <ScoreHero result={r} />
      {r.answersHiddenMessage ? (
        <p className="flex items-start gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {r.answersHiddenMessage}
        </p>
      ) : null}
      {solutionsQuery.data?.message ? (
        <p className="flex items-start gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <BookOpenCheck
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          {solutionsQuery.data.message}
        </p>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Per vraag
        </h2>
        <QuestionAccordion
          questions={r.questions}
          solutions={solutionsQuery.data?.solutions ?? {}}
        />
      </section>
    </>
  );
}

export function ResultPage({
  params,
}: {
  params: Promise<{ pogingId: string }>;
}) {
  const { pogingId } = use(params);
  return <ResultContent attemptId={pogingId} />;
}
