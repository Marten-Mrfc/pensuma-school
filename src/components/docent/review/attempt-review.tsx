"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClockPlus,
  ArrowLeftRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ClipboardPaste,
  Clock,
  Copy,
  Expand,
  FlaskConical,
  History,
  Loader2,
  type LucideIcon,
  MonitorX,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Shrink,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";
import { CodeEditor } from "@/components/app/code-editor";
import { getErrorMessage } from "@/components/app/get-error-message";
import { HighlightedCode } from "@/components/app/highlighted-code";
import { Markdown } from "@/components/app/markdown";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import {
  formatGrade,
  formatMoment,
  formatNumber,
  formatTime,
} from "@/components/docent/assignments/format";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Timeline,
  TimelineContent,
  TimelineDescription,
  TimelineHeader,
  TimelineItem,
  TimelineMedia,
  TimelineTitle,
} from "@/components/ui/timeline";
import {
  type CodeGradingResult,
  type MultipleChoiceData,
  type OpenQuestionData,
  QUESTION_TYPE_LABELS,
} from "@/lib/questions/schema";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { CodeResultView } from "./code-result-view";
import { scoreTone } from "./results-view";
import { ScoreBox } from "./score-box";

type Data = RouterOutputs["review"]["attempt"];
type Item = Data["items"][number];
type EventRow = Data["events"][number];

export function AttemptReview({
  params,
}: {
  params: Promise<{ afnameId: string; pogingId: string }>;
}) {
  const { afnameId, pogingId } = use(params);
  const trpc = useTRPC();
  const query = useQuery(
    trpc.review.attempt.queryOptions({ attemptId: pogingId }),
  );
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <AttemptContent assignmentId={afnameId} data={query.data} />;
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    !!el.closest(".cm-editor")
  );
}

function AttemptContent({
  assignmentId,
  data,
}: {
  assignmentId: string;
  data: Data;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { attempt, student, assignment, navigation } = data;

  const prevHref = navigation.prevAttemptId
    ? routes.docent.attempt(assignmentId, navigation.prevAttemptId)
    : null;
  const nextHref = navigation.nextAttemptId
    ? routes.docent.attempt(assignmentId, navigation.nextAttemptId)
    : null;

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === "j" && nextHref) router.push(nextHref);
    if (key === "k" && prevHref) router.push(prevHref);
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Jump to #vraag-<id> once the content is there.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#vraag-")) {
      document
        .getElementById(hash.slice(1))
        ?.scrollIntoView({ block: "start" });
    }
  }, []);

  const regrade = useMutation(
    trpc.review.regradeAttempt.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.review.pathKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.assignment.pathKey(),
        });
        toast.success("Opnieuw nagekeken", {
          description: "Handmatige scores en feedback zijn bewaard.",
        });
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    }),
  );

  const durationMin =
    attempt.submittedAt != null
      ? Math.max(
          1,
          Math.round(
            (new Date(attempt.submittedAt).getTime() -
              new Date(attempt.startedAt).getTime()) /
              60_000,
          ),
        )
      : null;
  const reviewCount = data.items.filter(
    (i) => i.answer?.status === "needs_review" && i.answer.manualScore == null,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={routes.docent.assignmentResults(assignmentId)}
        backLabel={`Resultaten · ${assignment.title}`}
        title={student.name}
        badge={
          <>
            <StatusBadge kind="attempt" status={attempt.status} />
            {attempt.status === "submitted" ? (
              <StatusBadge kind="grading" status={attempt.gradingStatus} />
            ) : null}
          </>
        }
        description={
          <span>
            {student.studentNumber ? `${student.studentNumber} · ` : ""}
            {assignment.className} · {assignment.title}
            {data.studentAttempts.length > 1
              ? ` · poging ${attempt.attemptNumber} van ${data.studentAttempts.length}`
              : ""}
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => regrade.mutate({ attemptId: attempt.id })}
              disabled={regrade.isPending || attempt.status !== "submitted"}
            >
              {regrade.isPending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
              Opnieuw nakijken
            </Button>
            <div className="flex items-center gap-1 rounded-lg border bg-card p-1 shadow-xs">
              <Button
                variant="ghost"
                size="sm"
                disabled={!prevHref}
                onClick={() => prevHref && router.push(prevHref)}
                title={
                  navigation.prevName
                    ? `Vorige: ${navigation.prevName} (K)`
                    : undefined
                }
              >
                <ChevronLeft aria-hidden="true" />
                Vorige
                <Kbd className="hidden sm:inline-flex">K</Kbd>
              </Button>
              <span className="px-1 text-xs text-muted-foreground tabular-nums">
                {navigation.index != null ? navigation.index + 1 : "–"}/
                {navigation.total}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={!nextHref}
                onClick={() => nextHref && router.push(nextHref)}
                title={
                  navigation.nextName
                    ? `Volgende: ${navigation.nextName} (J)`
                    : undefined
                }
              >
                <Kbd className="hidden sm:inline-flex">J</Kbd>
                Volgende
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-3 lg:grid-cols-6">
        <Summary label="Score">
          <span className="font-display text-xl font-bold tabular-nums">
            {formatNumber(attempt.score)}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {" "}
            / {formatNumber(attempt.maxScore)}
          </span>
        </Summary>
        <Summary label="Cijfer">
          <span
            className={cn(
              "font-display text-xl font-bold tabular-nums",
              attempt.grade != null &&
                (attempt.grade >= 5.5
                  ? "text-success-ink"
                  : "text-destructive-ink"),
            )}
          >
            {formatGrade(attempt.grade)}
          </span>
          {reviewCount ? (
            <span className="ml-1 text-xs text-warning-ink">voorlopig</span>
          ) : null}
        </Summary>
        <Summary label="Begonnen">{formatMoment(attempt.startedAt)}</Summary>
        <Summary label="Ingeleverd">
          {attempt.submittedAt ? (
            <>
              {formatMoment(attempt.submittedAt)}
              {attempt.autoSubmitted ? (
                <span className="block text-xs text-muted-foreground">
                  automatisch
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-warning-ink">Nog bezig</span>
          )}
        </Summary>
        <Summary label="Duur">
          {durationMin != null ? `${durationMin} min` : "–"}
          {attempt.extraMinutes ? (
            <span className="block text-xs text-info-ink">
              +{attempt.extraMinutes} min extra tijd
            </span>
          ) : null}
        </Summary>
        <Summary label="Vensterwissels">
          <span
            className={cn(
              "font-semibold tabular-nums",
              attempt.focusLossCount >= 3
                ? "text-destructive-ink"
                : attempt.focusLossCount > 0
                  ? "text-warning-ink"
                  : "",
            )}
          >
            {attempt.focusLossCount}
          </span>
        </Summary>
      </div>

      {data.studentAttempts.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Pogingen van {student.name.split(" ")[0]}:
          </span>
          {data.studentAttempts.map((s) => (
            <Link
              key={s.id}
              href={routes.docent.attempt(assignmentId, s.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent",
                s.id === attempt.id &&
                  "border-primary bg-primary/10 text-primary",
              )}
            >
              Poging {s.attemptNumber}
              {s.status === "in_progress" ? " (bezig)" : ""}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav
          aria-label="Vragen"
          className="flex flex-col gap-1 rounded-xl border bg-card p-2 shadow-xs lg:sticky lg:top-20"
        >
          <span className="px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Vragen
          </span>
          <ol className="flex flex-col gap-0.5">
            {data.items.map((item) => (
              <li key={item.question.id}>
                <a
                  href={`#vraag-${item.question.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="w-5 shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                    {item.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {item.question.title}
                  </span>
                  <ScorePill item={item} />
                </a>
              </li>
            ))}
          </ol>
          <a
            href="#logboek"
            className="mt-1 flex items-center gap-2 rounded-md border-t px-2 pt-2.5 pb-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <History className="size-4" aria-hidden="true" />
            Logboek ({data.events.length})
          </a>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          {data.items.map((item) => (
            <QuestionCard
              key={item.question.id}
              item={item}
              attemptSubmitted={attempt.status === "submitted"}
            />
          ))}
          <EventTimeline events={data.events} />
        </div>
      </div>
    </div>
  );
}

function Summary({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

function ScorePill({ item }: { item: Item }) {
  const a = item.answer;
  if (!a) return <span className="text-xs text-muted-foreground">–</span>;
  const review = a.status === "needs_review" && a.manualScore == null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-9 shrink-0 items-center justify-center rounded px-1.5 text-[11px] font-semibold tabular-nums",
        scoreTone({
          score: a.score,
          maxScore: a.maxScore,
          status: a.status,
          manualScore: a.manualScore,
        }),
      )}
    >
      {review ? "?" : `${formatNumber(a.score, 1)}/${formatNumber(a.maxScore)}`}
    </span>
  );
}

function QuestionCard({
  item,
  attemptSubmitted,
}: {
  item: Item;
  attemptSubmitted: boolean;
}) {
  const { question: q, answer: a } = item;
  const [promptOpen, setPromptOpen] = useState(false);
  const longPrompt = q.prompt.length > 260 || q.prompt.split("\n").length > 5;
  return (
    <article
      id={`vraag-${q.id}`}
      className="scroll-mt-20 overflow-hidden rounded-xl border bg-card shadow-xs"
      aria-labelledby={`vraag-${q.id}-title`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-5 py-3">
        <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums">
          {item.number}
        </span>
        <h2 id={`vraag-${q.id}-title`} className="font-semibold">
          {q.title}
        </h2>
        <span className="text-xs text-muted-foreground">
          {QUESTION_TYPE_LABELS[q.type]} · {formatNumber(q.points)}{" "}
          {q.points === 1 ? "punt" : "punten"}
        </span>
        <span className="ml-auto">
          {a ? (
            <StatusBadge kind="answer" status={a.status} />
          ) : (
            <StatusBadge kind="answer" status="empty" />
          )}
        </span>
      </header>
      <div className="flex flex-col gap-5 p-5">
        {q.prompt ? (
          <div className="flex flex-col gap-2">
            <div
              className={cn(
                "relative overflow-hidden text-sm",
                longPrompt && !promptOpen && "max-h-28",
              )}
            >
              <Markdown>{q.prompt}</Markdown>
              {longPrompt && !promptOpen ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
              ) : null}
            </div>
            {longPrompt ? (
              <button
                type="button"
                onClick={() => setPromptOpen((o) => !o)}
                className="w-fit text-xs font-medium text-primary hover:underline"
              >
                {promptOpen ? "Opdracht inklappen" : "Hele opdracht tonen"}
              </button>
            ) : null}
          </div>
        ) : null}

        <AnswerView item={item} />

        {a ? (
          <ScoreBox
            key={`${a.id}:${a.manualScore}:${a.feedback ?? ""}:${a.autoScore}`}
            answer={a}
            disabled={!attemptSubmitted}
            disabledReason="De leerling is nog bezig. Je kunt beoordelen zodra de poging is ingeleverd."
          />
        ) : (
          <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Deze vraag hoorde niet bij de poging van deze leerling (de toets is
            later aangepast).
          </p>
        )}
      </div>
    </article>
  );
}

function AnswerView({ item }: { item: Item }) {
  const { question: q, answer: a } = item;
  const response = (a?.response ?? null) as Record<string, unknown> | null;

  if (q.type === "code") {
    const code = typeof response?.code === "string" ? response.code : "";
    const data = q.data as { solution?: string; starterCode?: string };
    const result =
      a?.result && a.result.kind === "code"
        ? (a.result as CodeGradingResult)
        : null;
    const blank =
      !code.trim() || code.trim() === (data.starterCode ?? "").trim();
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Code van de leerling</span>
          {blank ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Geen code ingeleverd{code.trim() ? " (alleen de startcode)" : ""}.
            </p>
          ) : (
            <CodeEditor
              value={code}
              readOnly
              minHeight={80}
              maxHeight={480}
              aria-label="Code van de leerling"
            />
          )}
        </div>
        {result ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Testresultaten</span>
            <CodeResultView result={result} />
          </div>
        ) : !blank && a?.status !== "graded" ? (
          <p className="text-sm text-muted-foreground">
            Nog niet automatisch nagekeken.
          </p>
        ) : null}
        {data.solution ? (
          <details className="group rounded-lg border">
            <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium select-none hover:bg-accent/40">
              <span className="inline-flex items-center gap-2">
                <ChevronRight
                  className="size-4 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                Modeloplossing
              </span>
            </summary>
            <div className="border-t p-3">
              <HighlightedCode code={data.solution} language="python" />
            </div>
          </details>
        ) : null}
      </div>
    );
  }

  if (q.type === "multiple_choice") {
    const data = q.data as MultipleChoiceData;
    const selected = new Set(
      Array.isArray(response?.selected) ? (response.selected as string[]) : [],
    );
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Antwoord van de leerling
          {data.multiple ? " (meerdere antwoorden mogelijk)" : ""}
        </span>
        <ul className="flex flex-col gap-1.5">
          {data.options.map((o) => {
            const chosen = selected.has(o.id);
            return (
              <li
                key={o.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                  o.correct && "border-success/40 bg-success/[0.06]",
                  chosen &&
                    !o.correct &&
                    "border-destructive/40 bg-destructive/[0.05]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center border",
                    data.multiple ? "rounded" : "rounded-full",
                    chosen
                      ? "border-foreground bg-foreground text-background"
                      : "border-muted-foreground/50",
                  )}
                  aria-hidden="true"
                >
                  {chosen ? (
                    <span
                      className={cn(
                        "size-1.5 bg-background",
                        data.multiple ? "rounded-sm" : "rounded-full",
                      )}
                    />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1 [&_p]:m-0">
                  <Markdown>{o.text}</Markdown>
                </div>
                <span className="flex shrink-0 gap-1">
                  {chosen ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                      Gekozen
                    </span>
                  ) : null}
                  {o.correct ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success-ink">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      Juist
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        {selected.size === 0 ? (
          <p className="text-sm text-muted-foreground">
            De leerling heeft niets gekozen.
          </p>
        ) : null}
      </div>
    );
  }

  const data = q.data as OpenQuestionData;
  const text = typeof response?.text === "string" ? response.text : "";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Antwoord van de leerling</span>
        {text.trim() ? (
          <div className="min-h-24 rounded-lg border bg-background px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
            {text}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Geen antwoord gegeven.
          </p>
        )}
        {text.trim() ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {text.trim().split(/\s+/).length} woorden
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Modelantwoord</span>
          <div className="rounded-lg border border-success/25 bg-success/[0.05] px-4 py-3 text-sm">
            {data.modelAnswer ? (
              <Markdown>{data.modelAnswer}</Markdown>
            ) : (
              <span className="text-muted-foreground">Geen modelantwoord.</span>
            )}
          </div>
        </div>
        {data.rubric ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Beoordelingsmodel</span>
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <Markdown>{data.rubric}</Markdown>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- Timeline ------------------------------- */

const EVENT_INFO: Record<
  string,
  {
    label: string;
    icon: LucideIcon;
    status: "default" | "success" | "warning" | "error" | "info" | "muted";
  }
> = {
  started: { label: "Begonnen", icon: Play, status: "info" },
  resumed: { label: "Verder gegaan", icon: Play, status: "muted" },
  submitted: { label: "Ingeleverd", icon: Send, status: "success" },
  focus_lost: { label: "Venster verlaten", icon: MonitorX, status: "warning" },
  focus_gained: {
    label: "Terug in het venster",
    icon: ArrowLeftRight,
    status: "muted",
  },
  visibility_hidden: {
    label: "Tabblad verborgen",
    icon: MonitorX,
    status: "warning",
  },
  visibility_visible: {
    label: "Tabblad weer zichtbaar",
    icon: ArrowLeftRight,
    status: "muted",
  },
  fullscreen_enter: {
    label: "Volledig scherm aan",
    icon: Expand,
    status: "muted",
  },
  fullscreen_exit: {
    label: "Volledig scherm verlaten",
    icon: Shrink,
    status: "warning",
  },
  paste: { label: "Geplakt", icon: ClipboardPaste, status: "error" },
  copy: { label: "Gekopieerd", icon: Copy, status: "muted" },
  code_run: { label: "Code uitgevoerd", icon: Play, status: "muted" },
  self_test: { label: "Zelf getest", icon: FlaskConical, status: "muted" },
  time_extended: {
    label: "Tijd verlengd",
    icon: AlarmClockPlus,
    status: "info",
  },
  reopened: { label: "Poging heropend", icon: RotateCcw, status: "info" },
};

function eventDescription(e: EventRow): string | null {
  const d = (e.details ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case "submitted":
      if (d.auto)
        return d.reason === "assignment_closed" || d.by === "teacher"
          ? "Automatisch, bij het sluiten van de afname"
          : "Automatisch, toen de tijd om was";
      return "Door de leerling";
    case "time_extended":
      return `+${d.minutes ?? "?"} minuten${d.by ? ` door ${d.by}` : ""}`;
    case "reopened":
      return d.minutes
        ? `${d.minutes} minuten extra${d.by ? `, door ${d.by}` : ""}`
        : d.by
          ? `Door ${d.by}`
          : null;
    case "paste":
      return typeof d.length === "number"
        ? `${d.length} tekens${d.blocked ? " (geblokkeerd)" : ""}`
        : d.blocked
          ? "Geblokkeerd"
          : null;
    case "focus_lost":
    case "visibility_hidden":
      return typeof d.durationMs === "number"
        ? `${Math.round(d.durationMs / 1000)} seconden weg`
        : null;
    case "focus_gained":
    case "visibility_visible":
      return typeof d.awayMs === "number"
        ? `Na ${Math.round(d.awayMs / 1000)} seconden`
        : typeof d.durationMs === "number"
          ? `Na ${Math.round(d.durationMs / 1000)} seconden`
          : null;
    default:
      return null;
  }
}

function EventTimeline({ events }: { events: EventRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const important = events.filter(
    (e) =>
      ![
        "code_run",
        "self_test",
        "focus_gained",
        "visibility_visible",
        "copy",
      ].includes(e.type),
  );
  const list = showAll ? events : important;
  const warnings = events.filter((e) =>
    ["focus_lost", "visibility_hidden", "fullscreen_exit", "paste"].includes(
      e.type,
    ),
  ).length;
  return (
    <section
      id="logboek"
      className="scroll-mt-20 rounded-xl border bg-card p-5 shadow-xs"
      aria-labelledby="logboek-title"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            id="logboek-title"
            className="flex items-center gap-2 font-semibold"
          >
            <History
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Logboek
          </h2>
          <p className="text-xs text-muted-foreground">
            {events.length} gebeurtenissen
            {warnings ? ` · ${warnings} om op te letten` : ""}
          </p>
        </div>
        {events.length !== important.length ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAll((s) => !s)}
          >
            {showAll ? "Alleen belangrijke" : `Alles tonen (${events.length})`}
          </Button>
        ) : null}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen gebeurtenissen.
        </p>
      ) : (
        <Timeline density="compact">
          {list.map((e) => {
            const info = EVENT_INFO[e.type] ?? {
              label: e.type,
              icon: CircleDot,
              status: "muted" as const,
            };
            const Icon = info.icon;
            const description = eventDescription(e);
            const highlight =
              info.status === "warning" || info.status === "error";
            return (
              <TimelineItem key={e.id} status={info.status}>
                <TimelineMedia variant="icon" status={info.status}>
                  <Icon aria-hidden="true" />
                </TimelineMedia>
                <TimelineContent className="pb-3">
                  <TimelineHeader className="flex flex-wrap items-baseline gap-x-2">
                    <TimelineTitle
                      className={cn(
                        "text-sm",
                        highlight &&
                          (info.status === "error"
                            ? "text-destructive-ink"
                            : "text-warning-ink"),
                      )}
                    >
                      {info.label}
                    </TimelineTitle>
                    <time
                      dateTime={new Date(e.createdAt).toISOString()}
                      className="text-xs text-muted-foreground tabular-nums"
                    >
                      <Clock
                        className="mr-1 inline size-3"
                        aria-hidden="true"
                      />
                      {formatTime(e.createdAt)}
                    </time>
                  </TimelineHeader>
                  {description ? (
                    <TimelineDescription className="text-xs">
                      {description}
                    </TimelineDescription>
                  ) : null}
                </TimelineContent>
              </TimelineItem>
            );
          })}
        </Timeline>
      )}
    </section>
  );
}
