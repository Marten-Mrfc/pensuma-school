"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
  EyeOff,
  PartyPopper,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useEffectEvent, useId, useState } from "react";
import { CodeEditor } from "@/components/app/code-editor";
import { HighlightedCode } from "@/components/app/highlighted-code";
import { Markdown } from "@/components/app/markdown";
import { PageHeader } from "@/components/app/page-header";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { AssignmentNav } from "@/components/docent/assignments/assignment-nav";
import { formatNumber } from "@/components/docent/assignments/format";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { type CodeGradingResult, QUESTION_TYPE_LABELS } from "@/lib/questions/schema";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { CodeResultView } from "./code-result-view";
import { ScoreBox } from "./score-box";

type Queue = RouterOutputs["review"]["gradingQueue"];
type QueueQuestion = Queue["questions"][number];
type QueueItem = Queue["items"][number];

export function GradingView({ params }: { params: Promise<{ afnameId: string }> }) {
  const { afnameId } = use(params);
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const assignment = useQuery(trpc.assignment.get.queryOptions({ id: afnameId }));
  const overview = useQuery(
    trpc.review.gradingQueue.queryOptions({ assignmentId: afnameId, includeGraded: true }, { refetchInterval: 30_000 }),
  );

  if (overview.isPending || assignment.isPending) return <LoadingState />;
  if (assignment.isError) return <ErrorState error={assignment.error} onRetry={() => assignment.refetch()} />;
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;

  const questions = overview.data.questions;
  const requested = searchParams.get("vraag");
  const questionId =
    questions.find((q) => q.id === requested)?.id ??
    questions.find((q) => q.needsReview > 0)?.id ??
    questions[0]?.id ??
    null;
  const totalOpen = questions.reduce((s, q) => s + q.needsReview, 0);
  const a = assignment.data;

  const selectQuestion = (id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("vraag", id);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={routes.docent.assignments}
        backLabel="Afnames"
        title={`Nakijken · ${a.title}`}
        description={`${a.class.name} · beoordeel de open vragen per vraag, leerling voor leerling.`}
      />
      <AssignmentNav assignmentId={a.id} active="grading" needsReview={totalOpen} />

      {questions.length === 0 || !questionId ? (
        <EmptyBlock
          icon={ClipboardCheck}
          title="Er is niets handmatig na te kijken"
          description="Deze toets heeft geen open vragen en alle code is automatisch nagekeken. Wil je toch iets aanpassen? Open een poging via de resultaten."
          action={
            <Button asChild variant="outline">
              <Link href={routes.docent.assignmentResults(a.id)}>Naar resultaten</Link>
            </Button>
          }
        />
      ) : (
        <>
          <QuestionPicker questions={questions} active={questionId} onSelect={selectQuestion} />
          <QuestionGrader key={questionId} assignmentId={a.id} question={questions.find((q) => q.id === questionId) as QueueQuestion} />
        </>
      )}
    </div>
  );
}

function QuestionPicker({
  questions,
  active,
  onSelect,
}: {
  questions: QueueQuestion[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Vragen om na te kijken">
      {questions.map((q) => {
        const done = q.needsReview === 0;
        return (
          <button
            key={q.id}
            type="button"
            role="tab"
            aria-selected={q.id === active}
            onClick={() => onSelect(q.id)}
            className={cn(
              "flex min-w-52 shrink-0 flex-col gap-1 rounded-xl border bg-card p-3 text-left shadow-xs transition-all outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
              q.id === active && "border-primary ring-1 ring-primary",
            )}
          >
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold tabular-nums">V{q.number}</span>
              {QUESTION_TYPE_LABELS[q.type]}
            </span>
            <span className="truncate text-sm font-medium">{q.title}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                done ? "text-success-ink" : "text-warning-ink",
              )}
            >
              {done ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : null}
              {done ? "Alles beoordeeld" : `${q.needsReview} te beoordelen`}
              <span className="font-normal text-muted-foreground"> · {q.total} antwoorden</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || !!el.closest(".cm-editor");
}

function QuestionGrader({ assignmentId, question }: { assignmentId: string; question: QueueQuestion }) {
  const trpc = useTRPC();
  const id = useId();
  const [hideNames, setHideNames] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(question.needsReview > 0);
  const [showContext, setShowContext] = useState(true);
  const query = useQuery(
    trpc.review.gradingQueue.queryOptions({ assignmentId, questionId: question.id, includeGraded: true }),
  );

  // A stable order for this question + filter, so saved answers don't jump away.
  const filterKey = `${question.id}:${onlyOpen}`;
  const [snapshot, setSnapshot] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const [index, setIndex] = useState(0);
  const items = query.data?.items ?? [];
  const filteredIds = items.filter((i) => !onlyOpen || i.needsReview).map((i) => i.answerId);
  if (query.data && snapshot.key !== filterKey) {
    setSnapshot({ key: filterKey, ids: filteredIds });
    setIndex(0);
  }
  const byId = new Map(items.map((i) => [i.answerId, i]));
  const snapSet = new Set(snapshot.ids);
  const order = [...snapshot.ids.filter((x) => byId.has(x)), ...filteredIds.filter((x) => !snapSet.has(x))];
  const current = order[index] ? byId.get(order[index]) : undefined;
  const reviewedCount = order.filter((x) => !byId.get(x)?.needsReview).length;

  const goNext = () => setIndex((i) => Math.min(i + 1, order.length));
  const goPrev = () => setIndex((i) => Math.max(i - 1, 0));
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
    if (e.key.toLowerCase() === "j") goNext();
    if (e.key.toLowerCase() === "k") goPrev();
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (query.isPending) return <LoadingState variant="list" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const label = (item: QueueItem) =>
    hideNames ? `Leerling ${order.indexOf(item.answerId) + 1}` : item.student.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">
              {order.length === 0
                ? "Geen antwoorden in deze selectie"
                : index >= order.length
                  ? "Klaar met deze selectie"
                  : `Antwoord ${index + 1} van ${order.length}`}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {reviewedCount}/{order.length} beoordeeld
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-[width] duration-500"
              style={{ width: `${order.length ? (reviewedCount / order.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 md:pl-6">
          <label htmlFor={`${id}-hide`} className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch id={`${id}-hide`} checked={hideNames} onCheckedChange={setHideNames} />
            Namen verbergen
          </label>
          <label htmlFor={`${id}-open`} className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch id={`${id}-open`} checked={onlyOpen} onCheckedChange={setOnlyOpen} />
            Alleen nog te beoordelen
          </label>
        </div>
      </div>

      {order.length === 0 ? (
        <EmptyBlock
          icon={CheckCircle2}
          title={onlyOpen ? "Alles van deze vraag is beoordeeld" : "Nog geen antwoorden op deze vraag"}
          description={onlyOpen ? "Zet ‘Alleen nog te beoordelen’ uit om je beoordelingen terug te zien." : undefined}
        />
      ) : !current ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center shadow-xs">
          <span className="grid size-12 place-items-center rounded-2xl bg-success/12 text-success-ink">
            <PartyPopper className="size-6" aria-hidden="true" />
          </span>
          <h3 className="text-lg font-semibold">Klaar met deze vraag!</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Je hebt {reviewedCount} van de {order.length} antwoorden beoordeeld. Kies hierboven een andere vraag of bekijk
            de resultaten.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => setIndex(0)}>
              Terug naar het begin
            </Button>
            <Button asChild>
              <Link href={routes.docent.assignmentResults(assignmentId)}>Naar resultaten</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <article className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
                  <UserRound className="size-4" aria-hidden="true" />
                </span>
                <div className="flex flex-col">
                  <span className="font-semibold">{label(current)}</span>
                  <span className="text-xs text-muted-foreground">
                    {hideNames ? "Naam verborgen" : current.student.studentNumber}
                    {current.attemptNumber > 1 ? ` · poging ${current.attemptNumber}` : ""}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={goPrev} disabled={index === 0}>
                  <ChevronLeft aria-hidden="true" />
                  Vorige
                  <Kbd className="hidden sm:inline-flex">K</Kbd>
                </Button>
                <Button variant="outline" size="sm" onClick={goNext}>
                  <Kbd className="hidden sm:inline-flex">J</Kbd>
                  {index === order.length - 1 ? "Afronden" : "Volgende"}
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </header>

            <StudentAnswer item={current} questionType={question.type} />

            <ScoreBox
              key={`${current.answerId}:${current.manualScore}:${current.feedback ?? ""}`}
              answer={{
                id: current.answerId,
                autoScore: current.autoScore,
                manualScore: current.manualScore,
                maxScore: current.maxScore,
                feedback: current.feedback,
                status: current.status,
              }}
              compact
              saveLabel="Opslaan en volgende"
              onSaved={goNext}
            />
            {!hideNames ? (
              <Link
                href={routes.docent.attempt(assignmentId, current.attemptId)}
                className="w-fit text-xs font-medium text-primary hover:underline"
              >
                Hele poging van {current.student.name} bekijken →
              </Link>
            ) : null}
          </article>

          <aside className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs xl:sticky xl:top-20">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">
                V{question.number} · {question.title}
              </h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowContext((s) => !s)}
                aria-label={showContext ? "Opdracht en model verbergen" : "Opdracht en model tonen"}
                className="xl:hidden"
              >
                {showContext ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
            <div className={cn("flex flex-col gap-4", !showContext && "hidden xl:flex")}>
              <div className="text-sm">
                <Markdown>{question.prompt}</Markdown>
              </div>
              {question.modelAnswer ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-success-ink uppercase">Modelantwoord</span>
                  <div className="rounded-lg border border-success/25 bg-success/[0.05] px-3 py-2.5 text-sm">
                    <Markdown>{question.modelAnswer}</Markdown>
                  </div>
                </div>
              ) : null}
              {question.rubric ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Beoordelingsmodel
                  </span>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
                    <Markdown>{question.rubric}</Markdown>
                  </div>
                </div>
              ) : null}
              {question.solution ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-success-ink uppercase">Modeloplossing</span>
                  <HighlightedCode code={question.solution} language="python" showHeader={false} />
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">Maximaal {formatNumber(question.points)} punten.</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function StudentAnswer({ item, questionType }: { item: QueueItem; questionType: QueueQuestion["type"] }) {
  const response = (item.response ?? null) as Record<string, unknown> | null;
  if (questionType === "code") {
    const code = typeof response?.code === "string" ? response.code : "";
    const result = item.result?.kind === "code" ? (item.result as CodeGradingResult) : null;
    return (
      <div className="flex flex-col gap-3">
        {code.trim() ? (
          <CodeEditor value={code} readOnly minHeight={80} maxHeight={420} aria-label="Code van de leerling" />
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Geen code.</p>
        )}
        {result ? <CodeResultView result={result} /> : null}
      </div>
    );
  }
  if (questionType === "multiple_choice") {
    const selected = Array.isArray(response?.selected) ? (response.selected as string[]) : [];
    return <p className="text-sm">Gekozen: {selected.join(", ") || "niets"}</p>;
  }
  const text = typeof response?.text === "string" ? response.text : "";
  return text.trim() ? (
    <div className="flex flex-col gap-1.5">
      <div className="rounded-lg border bg-background px-4 py-3 text-[0.95rem] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{text.trim().split(/\s+/).length} woorden</span>
    </div>
  ) : (
    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      Geen antwoord gegeven.
    </p>
  );
}
