"use client";

import { GripVertical } from "lucide-react";
import { useId, useState } from "react";
import { ReorderButtons } from "@/components/a11y/reorder-buttons";
import { IssueDot, IssueIcon } from "@/components/docent/questions/issue-list";
import {
  QUESTION_TYPE_ICONS,
  QUESTION_TYPE_TONE,
} from "@/components/docent/questions/question-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { QuestionType } from "@/lib/questions/schema";
import type { QuestionTemplate } from "@/lib/questions/templates";
import {
  capitalize,
  MAX_QUESTIONS_PER_TEST,
  type QuestionIssue,
} from "@/lib/questions/validate";
import { cn } from "@/lib/utils";
import { AddQuestionMenu } from "./add-question-menu";

export type BuilderSelection =
  | { kind: "settings" }
  | { kind: "question"; id: string };

export type ListQuestion = {
  id: string;
  type: QuestionType;
  title: string;
  points: number;
};

export function formatPoints(points: number) {
  return Number.isInteger(points)
    ? String(points)
    : points.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
}

export interface QuestionListProps {
  questions: ListQuestion[];
  issuesById: Record<string, QuestionIssue[]>;
  selection: BuilderSelection;
  onSelect: (selection: BuilderSelection) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onReorder: (orderedIds: string[]) => void;
  onAdd: (template: QuestionTemplate) => void;
  onOpenBank?: () => void;
  adding: boolean;
  settingsTitle: string;
  settingsHasIssue: boolean;
  /**
   * Every error that blocks publishing (also test-level ones such as "no
   * questions"), the same number as the Publiceren badge.
   */
  errorCount: number;
}

export function QuestionList({
  questions,
  issuesById,
  selection,
  onSelect,
  onMove,
  onReorder,
  onAdd,
  onOpenBank,
  adding,
  settingsTitle,
  settingsHasIssue,
  errorCount,
}: QuestionListProps) {
  const uid = useId();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const totalPoints = questions.reduce(
    (sum, q) => sum + (Number.isFinite(q.points) ? q.points : 0),
    0,
  );
  const full = questions.length >= MAX_QUESTIONS_PER_TEST;

  function drop() {
    if (dragId === null || dropIndex === null) return;
    const from = questions.findIndex((q) => q.id === dragId);
    if (from < 0) return;
    const ids = questions.map((q) => q.id);
    ids.splice(from, 1);
    const to = dropIndex > from ? dropIndex - 1 : dropIndex;
    ids.splice(to, 0, dragId);
    if (to !== from) onReorder(ids);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => onSelect({ kind: "settings" })}
        aria-current={selection.kind === "settings" ? "true" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-xs transition-colors outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
          selection.kind === "settings" &&
            "border-primary/50 bg-primary/[0.06] ring-1 ring-primary/25",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">Toetsinstellingen</span>
          <span className="truncate text-xs text-muted-foreground">
            {settingsTitle || "Titel, onderwerp, beschrijving"}
          </span>
        </span>
        {settingsHasIssue ? (
          <IssueIcon severity="error" label="Probleem" />
        ) : null}
      </button>

      <div className="rounded-xl border bg-card shadow-xs">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <h2 className="text-sm font-semibold">Vragen</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {questions.length} / {MAX_QUESTIONS_PER_TEST}
          </span>
        </div>
        {questions.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nog geen vragen. Voeg je eerste vraag toe.
          </p>
        ) : (
          <ol
            className="flex flex-col p-1.5"
            onDragOver={(e) => {
              if (dragId) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop();
              setDragId(null);
              setDropIndex(null);
            }}
          >
            {questions.map((q, index) => {
              const selected =
                selection.kind === "question" && selection.id === q.id;
              const Icon = QUESTION_TYPE_ICONS[q.type];
              const issues = issuesById[q.id] ?? [];
              const firstIssue = issues[0];
              const issuesId = `${uid}-${q.id}-issues`;
              return (
                <li
                  key={q.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(q.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", q.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropIndex(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDropIndex(
                      e.clientY < rect.top + rect.height / 2
                        ? index
                        : index + 1,
                    );
                  }}
                  className={cn(
                    "group/item relative",
                    dragId === q.id && "opacity-40",
                  )}
                >
                  {dropIndex === index && dragId && dragId !== q.id ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-2 -top-px h-0.5 rounded bg-primary"
                    />
                  ) : null}
                  {dropIndex === index + 1 &&
                  index === questions.length - 1 &&
                  dragId ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-primary"
                    />
                  ) : null}
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-lg pr-1 transition-colors",
                      selected
                        ? "bg-primary/[0.08] ring-1 ring-primary/30"
                        : "hover:bg-accent/60",
                    )}
                  >
                    <span
                      className="hidden cursor-grab touch-none py-2 pl-1 text-muted-foreground/50 group-hover/item:text-muted-foreground lg:block"
                      aria-hidden="true"
                      title="Slepen om te verplaatsen"
                    >
                      <GripVertical className="size-3.5" />
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelect({ kind: "question", id: q.id })}
                      aria-current={selected ? "true" : undefined}
                      aria-describedby={firstIssue ? issuesId : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-2 pl-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring lg:pl-0.5"
                    >
                      <span
                        className={cn(
                          "w-5 shrink-0 text-right font-mono text-xs font-semibold tabular-nums",
                          selected ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                      <span
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-md",
                          QUESTION_TYPE_TONE[q.type],
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm",
                            selected && "font-medium",
                          )}
                        >
                          {q.title || (
                            <span className="text-muted-foreground italic">
                              Naamloze vraag
                            </span>
                          )}
                        </span>
                      </span>
                      {firstIssue ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="grid size-4 place-items-center">
                              <IssueDot issues={issues} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-64">
                            {capitalize(firstIssue.message)}
                            {issues.length > 1
                              ? ` (+${issues.length - 1})`
                              : ""}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatPoints(q.points)} p
                      </span>
                    </button>
                    {firstIssue ? (
                      // The tooltip text for keyboard and screen-reader
                      // users, as the button's description.
                      <span id={issuesId} className="sr-only">
                        {issues.map((i) => capitalize(i.message)).join(". ")}
                      </span>
                    ) : null}
                    <ReorderButtons
                      index={index}
                      count={questions.length}
                      itemLabel={`Vraag ${index + 1}`}
                      itemKey={q.id}
                      onMove={(from, to) => onMove(q.id, to > from ? 1 : -1)}
                      className={cn(
                        "shrink-0 transition-opacity",
                        // Desktop: other rows show the buttons on hover or
                        // focus, floating over the points, so they don't
                        // take room from the title.
                        !selected &&
                          "lg:pointer-events-none lg:absolute lg:top-1/2 lg:right-1 lg:-translate-y-1/2 lg:rounded-md lg:bg-popover lg:opacity-0 lg:shadow-sm lg:ring-1 lg:ring-border lg:group-focus-within/item:pointer-events-auto lg:group-focus-within/item:opacity-100 lg:group-hover/item:pointer-events-auto lg:group-hover/item:opacity-100",
                      )}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex flex-col gap-2.5 border-t p-3">
          <AddQuestionMenu
            onAdd={onAdd}
            onOpenBank={onOpenBank}
            pending={adding}
            disabled={full}
            className="w-full"
          />
          {full ? (
            <p className="text-center text-xs text-muted-foreground">
              Het maximum van {MAX_QUESTIONS_PER_TEST} vragen is bereikt.
            </p>
          ) : null}
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/50 px-2 py-1.5">
              <dt className="text-[0.68rem] text-muted-foreground">Vragen</dt>
              <dd className="font-semibold tabular-nums">{questions.length}</dd>
            </div>
            <div className="rounded-lg bg-muted/50 px-2 py-1.5">
              <dt className="text-[0.68rem] text-muted-foreground">Punten</dt>
              <dd className="font-semibold tabular-nums">
                {formatPoints(totalPoints)}
              </dd>
            </div>
            <div
              className={cn(
                "rounded-lg px-2 py-1.5",
                errorCount > 0
                  ? "bg-destructive/[0.08] text-destructive-ink"
                  : "bg-success/10 text-success-ink",
              )}
            >
              <dt className="text-[0.68rem]">Problemen</dt>
              <dd className="font-semibold tabular-nums">{errorCount}</dd>
            </div>
          </dl>
          <p className="hidden text-center text-[0.68rem] text-muted-foreground lg:block">
            Sleep om te ordenen · <kbd className="font-mono">Alt</kbd>+
            <kbd className="font-mono">↑</kbd>/
            <kbd className="font-mono">↓</kbd> wisselt van vraag
          </p>
        </div>
      </div>
    </div>
  );
}
