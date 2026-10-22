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
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type RefObject, use, useId, useRef, useState } from "react";
import { KeyCombo } from "@/components/a11y/key-combo";
import { CodeEditor } from "@/components/app/code-editor";
import { HighlightedCode } from "@/components/app/highlighted-code";
import { Markdown } from "@/components/app/markdown";
import { PageHeader } from "@/components/app/page-header";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { AssignmentNav } from "@/components/docent/assignments/assignment-nav";
import { formatNumber } from "@/components/docent/assignments/format";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useShortcut } from "@/lib/a11y/shortcuts";
import { useDocumentTitle } from "@/lib/a11y/use-document-title";
import { groupAnswers } from "@/lib/grading/answer-groups";
import {
  type CodeGradingResult,
  QUESTION_TYPE_LABELS,
} from "@/lib/questions/schema";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { CodeResultView } from "./code-result-view";
import { ScoreBox } from "./score-box";

type Queue = RouterOutputs["review"]["gradingQueue"];
type QueueQuestion = Queue["questions"][number];
type QueueItem = Queue["items"][number];

export function GradingView({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  const { afnameId } = use(params);
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const assignment = useQuery(
    trpc.assignment.get.queryOptions({ id: afnameId }),
  );
  const overview = useQuery(
    trpc.review.gradingQueue.queryOptions(
      { assignmentId: afnameId, includeGraded: true },
      { refetchInterval: 30_000 },
    ),
  );

  useDocumentTitle([
    assignment.data ? `Nakijken · ${assignment.data.title}` : "Nakijken",
  ]);

  if (overview.isPending || assignment.isPending) return <LoadingState />;
  if (assignment.isError)
    return (
      <ErrorState
        error={assignment.error}
        onRetry={() => assignment.refetch()}
      />
    );
  if (overview.isError)
    return (
      <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
    );

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
      <AssignmentNav
        assignmentId={a.id}
        active="grading"
        needsReview={totalOpen}
      />

      {questions.length === 0 || !questionId ? (
        <EmptyBlock
          icon={ClipboardCheck}
          title="Er is niets handmatig na te kijken"
          description="Deze toets heeft geen open vragen en alle code is automatisch nagekeken. Wil je toch iets aanpassen? Open een poging via de resultaten."
          action={
            <Button asChild variant="outline">
              <Link href={routes.docent.assignmentResults(a.id)}>
                Naar resultaten
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <QuestionPicker
            questions={questions}
            active={questionId}
            onSelect={selectQuestion}
          />
          <QuestionGrader
            key={questionId}
            assignmentId={a.id}
            question={
              questions.find((q) => q.id === questionId) as QueueQuestion
            }
          />
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
    <nav
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      aria-label="Vragen om na te kijken"
    >
      {questions.map((q) => {
        const done = q.needsReview === 0;
        return (
          <button
            key={q.id}
            type="button"
            aria-current={q.id === active ? "true" : undefined}
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
              {done ? (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              ) : null}
              {done ? "Alles beoordeeld" : `${q.needsReview} te beoordelen`}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {q.total} antwoorden
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function QuestionGrader({
  assignmentId,
  question,
}: {
  assignmentId: string;
  question: QueueQuestion;
}) {
  const trpc = useTRPC();
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [hideNames, setHideNames] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(question.needsReview > 0);
  const [grouped, setGrouped] = useState(false);
  const [showContext, setShowContext] = useState(true);
  const query = useQuery(
    trpc.review.gradingQueue.queryOptions({
      assignmentId,
      questionId: question.id,
      includeGraded: true,
    }),
  );
  const groups = useQuery(
    trpc.feedback.groups.queryOptions({
      assignmentId,
      questionId: question.id,
    }),
  );

  const info = new Map(
    (groups.data?.items ?? []).map((g) => [g.answerId, g] as const),
  );
  const keyOf = (answerId: string) => info.get(answerId)?.groupKey ?? "";

  // A stable order for this question + filter, so saved answers don't jump away.
  const filterKey = `${question.id}:${onlyOpen}:${grouped}`;
  const [snapshot, setSnapshot] = useState<{ key: string; ids: string[] }>({
    key: "",
    ids: [],
  });
  const [index, setIndex] = useState(0);
  const items = query.data?.items ?? [];
  const filtered = items.filter((i) => !onlyOpen || i.needsReview);
  const filteredIds = (
    grouped
      ? groupAnswers(filtered, (i) => keyOf(i.answerId))
          // Biggest groups first: grading them saves the most clicks.
          .sort((a, b) => b.items.length - a.items.length)
          .flatMap((g) => g.items)
      : filtered
  ).map((i) => i.answerId);
  if (query.data && groups.data && snapshot.key !== filterKey) {
    setSnapshot({ key: filterKey, ids: filteredIds });
    setIndex(0);
  }
  const byId = new Map(items.map((i) => [i.answerId, i]));
  const snapSet = new Set(snapshot.ids);
  const order = [
    ...snapshot.ids.filter((x) => byId.has(x)),
    ...filteredIds.filter((x) => !snapSet.has(x)),
  ];
  const current = order[index] ? byId.get(order[index]) : undefined;
  const reviewedCount = order.filter((x) => !byId.get(x)?.needsReview).length;

  // Answers identical to the current one (all of this question's answers).
  const currentKey = current ? keyOf(current.answerId) : "";
  const sameAnswerIds = currentKey
    ? items
        .filter(
          (i) =>
            i.answerId !== current?.answerId &&
            keyOf(i.answerId) === currentKey,
        )
        .map((i) => i.answerId)
    : [];

  const goNext = () => setIndex((i) => Math.min(i + 1, order.length));
  const goPrev = () => setIndex((i) => Math.max(i - 1, 0));
  const afterSave = ({ answerIds }: { answerIds: string[] }) => {
    if (answerIds.length <= 1) return goNext();
    // Graded a whole group: continue after the last of them.
    const positions = answerIds
      .map((x) => order.indexOf(x))
      .filter((p) => p >= 0);
    setIndex(Math.min(Math.max(index, ...positions) + 1, order.length));
  };

  if (query.isPending || groups.isPending)
    return <LoadingState variant="list" />;
  if (query.isError)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (groups.isError)
    return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />;

  const label = (item: QueueItem) =>
    hideNames
      ? `Leerling ${order.indexOf(item.answerId) + 1}`
      : item.student.name;

  return (
    <div ref={panelRef} className="flex flex-col gap-4">
      <GradingShortcuts scope={panelRef} onPrev={goPrev} onNext={goNext} />
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
              style={{
                width: `${order.length ? (reviewedCount / order.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 md:pl-6">
          <label
            htmlFor={`${id}-hide`}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <Switch
              id={`${id}-hide`}
              checked={hideNames}
              onCheckedChange={setHideNames}
            />
            Namen verbergen
          </label>
          <label
            htmlFor={`${id}-open`}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <Switch
              id={`${id}-open`}
              checked={onlyOpen}
              onCheckedChange={setOnlyOpen}
            />
            Alleen nog te beoordelen
          </label>
          <label
            htmlFor={`${id}-group`}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <Switch
              id={`${id}-group`}
              checked={grouped}
              onCheckedChange={setGrouped}
            />
            Groeperen op gelijke antwoorden
          </label>
        </div>
      </div>

      {order.length === 0 ? (
        <EmptyBlock
          icon={CheckCircle2}
          title={
            onlyOpen
              ? "Alles van deze vraag is beoordeeld"
              : "Nog geen antwoorden op deze vraag"
          }
          description={
            onlyOpen
              ? "Zet ‘Alleen nog te beoordelen’ uit om je beoordelingen terug te zien."
              : undefined
          }
        />
      ) : !current ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center shadow-xs">
          <span className="grid size-12 place-items-center rounded-2xl bg-success/12 text-success-ink">
            <PartyPopper className="size-6" aria-hidden="true" />
          </span>
          <h3 className="text-lg font-semibold">Klaar met deze vraag!</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Je hebt {reviewedCount} van de {order.length} antwoorden beoordeeld.
            Kies hierboven een andere vraag of bekijk de resultaten.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => setIndex(0)}>
              Terug naar het begin
            </Button>
            <Button asChild>
              <Link href={routes.docent.assignmentResults(assignmentId)}>
                Naar resultaten
              </Link>
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
                    {hideNames
                      ? "Naam verborgen"
                      : current.student.studentNumber}
                    {current.attemptNumber > 1
                      ? ` · poging ${current.attemptNumber}`
                      : ""}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goPrev}
                  disabled={index === 0}
                  aria-keyshortcuts="Alt+ArrowUp"
                >
                  <ChevronLeft aria-hidden="true" />
                  Vorige leerling
                  <span aria-hidden="true" className="hidden lg:inline-flex">
                    <KeyCombo keys="Alt+↑" />
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goNext}
                  aria-keyshortcuts="Alt+ArrowDown"
                >
                  {index === order.length - 1
                    ? "Afronden"
                    : "Volgende leerling"}
                  <span aria-hidden="true" className="hidden lg:inline-flex">
                    <KeyCombo keys="Alt+↓" />
                  </span>
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </header>
            {grouped && sameAnswerIds.length > 0 ? (
              <p className="flex items-center gap-2 rounded-lg bg-info/10 px-3 py-2 text-sm text-info-ink">
                <UsersRound className="size-4 shrink-0" aria-hidden="true" />
                {sameAnswerIds.length === 1
                  ? "Nog 1 leerling gaf precies hetzelfde antwoord."
                  : `Nog ${sameAnswerIds.length} leerlingen gaven precies hetzelfde antwoord.`}
              </p>
            ) : null}

            <StudentAnswer item={current} questionType={question.type} />

            <ScoreBox
              key={`${current.answerId}:${current.manualScore}:${current.feedback ?? ""}:${(info.get(current.answerId)?.rubricChecked ?? []).join(",")}`}
              answer={{
                id: current.answerId,
                autoScore: current.autoScore,
                manualScore: current.manualScore,
                maxScore: current.maxScore,
                feedback: current.feedback,
                status: current.status,
                rubricChecked:
                  info.get(current.answerId)?.rubricChecked ?? null,
              }}
              compact
              saveLabel="Opslaan en volgende"
              questionId={question.id}
              questionNumber={question.number}
              rubricItems={groups.data.rubricItems}
              sameAnswerIds={sameAnswerIds}
              onSaved={afterSave}
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
                aria-label={
                  showContext
                    ? "Opdracht en model verbergen"
                    : "Opdracht en model tonen"
                }
                className="xl:hidden"
              >
                {showContext ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </Button>
            </div>
            <div
              className={cn(
                "flex flex-col gap-4",
                !showContext && "hidden xl:flex",
              )}
            >
              <div className="text-sm">
                <Markdown>{question.prompt}</Markdown>
              </div>
              {question.modelAnswer ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-success-ink uppercase">
                    Modelantwoord
                  </span>
                  <div className="rounded-lg border border-success/25 bg-success/[0.05] px-3 py-2.5 text-sm">
                    <Markdown>{question.modelAnswer}</Markdown>
                  </div>
                </div>
              ) : null}
              {question.rubric ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Toelichting voor het nakijken
                  </span>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
                    <Markdown>{question.rubric}</Markdown>
                  </div>
                </div>
              ) : null}
              {question.solution ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-success-ink uppercase">
                    Modeloplossing
                  </span>
                  <HighlightedCode
                    code={question.solution}
                    language="python"
                    showHeader={false}
                  />
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Maximaal {formatNumber(question.points)} punten.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/** Alt+↑ / Alt+↓: previous / next student, while focus is in the panel. */
function GradingShortcuts({
  scope,
  onPrev,
  onNext,
}: {
  scope: RefObject<HTMLDivElement | null>;
  onPrev: () => void;
  onNext: () => void;
}) {
  useShortcut({
    id: "docent-review-navigate",
    label: "Vorige leerling",
    keys: { key: "ArrowUp", alt: true },
    scope,
    handler: onPrev,
  });
  useShortcut({
    id: "docent-review-navigate-next",
    label: "Volgende leerling",
    keys: { key: "ArrowDown", alt: true },
    scope,
    handler: onNext,
  });
  return null;
}

function StudentAnswer({
  item,
  questionType,
}: {
  item: QueueItem;
  questionType: QueueQuestion["type"];
}) {
  const response = (item.response ?? null) as Record<string, unknown> | null;
  if (questionType === "code") {
    const code = typeof response?.code === "string" ? response.code : "";
    const result =
      item.result?.kind === "code" ? (item.result as CodeGradingResult) : null;
    return (
      <div className="flex flex-col gap-3">
        {code.trim() ? (
          <CodeEditor
            value={code}
            readOnly
            minHeight={80}
            maxHeight={420}
            aria-label="Code van de leerling"
          />
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Geen code.
          </p>
        )}
        {result ? <CodeResultView result={result} /> : null}
      </div>
    );
  }
  if (questionType === "multiple_choice") {
    const selected = Array.isArray(response?.selected)
      ? (response.selected as string[])
      : [];
    return <p className="text-sm">Gekozen: {selected.join(", ") || "niets"}</p>;
  }
  const text = typeof response?.text === "string" ? response.text : "";
  return text.trim() ? (
    <div className="flex flex-col gap-1.5">
      <div className="rounded-lg border bg-background px-4 py-3 text-[0.95rem] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {text.trim().split(/\s+/).length} woorden
      </span>
    </div>
  ) : (
    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      Geen antwoord gegeven.
    </p>
  );
}
