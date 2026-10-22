"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Save,
  UserRoundPen,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { MarkdownEditor } from "@/components/app/markdown-editor";
import { formatNumber } from "@/components/docent/assignments/format";
import { NumberInput } from "@/components/docent/questions/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  prependRubricFeedback,
  type RubricCriterion,
  rubricFeedbackLines,
  rubricScore,
} from "@/lib/grading/rubric";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { FeedbackSnippets } from "./feedback-snippets";
import { RubricChecklist } from "./rubric-checklist";

export type ScoreBoxAnswer = {
  id: string;
  autoScore: number | null;
  manualScore: number | null;
  maxScore: number;
  feedback: string | null;
  status: string;
  /** Ticked rubric criteria (open questions), when known. */
  rubricChecked?: string[] | null;
};

/** Quick score buttons: 0, ½, 1, … up to max (whole points when max > 6). */
export function quickScores(max: number): number[] {
  const step = max > 6 ? 1 : 0.5;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 2) / 2);
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Teacher scoring: automatic score, manual override (0..max), "restore
 * automatic score", markdown feedback with snippets ("Snelle opmerkingen")
 * and, for open questions with criteria, a rubric checklist.
 *
 * Saving uses review.setManualScore, or feedback.gradeMany when criteria
 * are used or the score also goes to identical answers (`sameAnswerIds`).
 * Without `rubricItems`/`questionId` the box loads them itself.
 */
export function ScoreBox({
  answer,
  disabled,
  disabledReason,
  onSaved,
  compact,
  saveLabel = "Opslaan",
  questionId,
  questionNumber,
  rubricItems,
  sameAnswerIds,
}: {
  answer: ScoreBoxAnswer;
  disabled?: boolean;
  disabledReason?: string;
  /** After a successful save; `answerIds` lists every answer that was graded. */
  onSaved?: (info: { answerIds: string[] }) => void;
  compact?: boolean;
  /** Label of the save button, e.g. "Opslaan en volgende". */
  saveLabel?: string;
  questionId?: string;
  /** For the label "Punten voor vraag {n} (maximaal {max})". */
  questionNumber?: number;
  /** The question's rubric criteria (open questions). */
  rubricItems?: readonly RubricCriterion[];
  /** Other answers with the same content (grading together). */
  sameAnswerIds?: readonly string[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const id = useId();

  // Criteria and question id, when the caller did not pass them.
  const needsContext =
    !disabled && (rubricItems === undefined || questionId === undefined);
  const context = useQuery({
    ...trpc.feedback.answerContext.queryOptions({ answerId: answer.id }),
    enabled: needsContext,
    staleTime: 60_000,
  });
  const items: readonly RubricCriterion[] =
    rubricItems ?? context.data?.rubricItems ?? [];
  const resolvedQuestionId = questionId ?? context.data?.questionId;
  const initialChecked =
    answer.rubricChecked !== undefined
      ? (answer.rubricChecked ?? [])
      : (context.data?.rubricChecked ?? []);

  const initialScore = answer.manualScore ?? null;
  const [score, setScore] = useState<number | undefined>(
    initialScore ?? undefined,
  );
  const [feedback, setFeedback] = useState(answer.feedback ?? "");
  const [showFeedback, setShowFeedback] = useState(
    !!answer.feedback?.trim() || !!compact,
  );
  const [checkedState, setChecked] = useState<string[] | null>(null);
  const checked = checkedState ?? initialChecked;
  const [applyToSame, setApplyToSame] = useState(false);

  async function afterSave() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.review.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.assignment.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() }),
      queryClient.invalidateQueries({
        queryKey: trpc.feedback.groups.pathKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.feedback.answerContext.pathKey(),
      }),
    ]);
  }

  const save = useMutation(
    trpc.review.setManualScore.mutationOptions({
      onSuccess: async (res) => {
        await afterSave();
        if (!res.recomputed) {
          toast.warning(
            "Score opgeslagen, maar het totaal kon niet worden bijgewerkt",
          );
        } else {
          toast.success(
            res.manualScore == null
              ? "Automatische score hersteld"
              : "Beoordeling opgeslagen",
          );
        }
        onSaved?.({ answerIds: [res.answerId] });
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    }),
  );
  const saveMany = useMutation(
    trpc.feedback.gradeMany.mutationOptions({
      onSuccess: async (res, variables) => {
        await afterSave();
        if (!res.recomputed) {
          toast.warning(
            "Score opgeslagen, maar een totaal kon niet worden bijgewerkt",
          );
        } else {
          toast.success(
            res.updated === 1
              ? "Beoordeling opgeslagen"
              : `Beoordeling opgeslagen voor ${res.updated} antwoorden`,
          );
        }
        setApplyToSame(false);
        onSaved?.({ answerIds: variables.answerIds });
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    }),
  );
  const pending = save.isPending || saveMany.isPending;

  const parsed = score === undefined ? null : score;
  const invalid =
    parsed != null &&
    (!Number.isFinite(parsed) || parsed < 0 || parsed > answer.maxScore);
  const rubricDirty = !sameList(checked, initialChecked);
  const dirty =
    parsed !== initialScore ||
    (feedback.trim() || null) !== (answer.feedback?.trim() || null) ||
    rubricDirty;
  const effective = parsed ?? answer.autoScore;
  const needsReview =
    answer.status === "needs_review" && answer.manualScore == null;
  const others = sameAnswerIds?.filter((x) => x !== answer.id) ?? [];
  const usesRubric = items.length > 0 && (rubricDirty || checked.length > 0);
  const bulk = applyToSame && others.length > 0;

  function changeChecked(next: string[]) {
    setChecked(next);
    setScore(rubricScore(items, next, answer.maxScore));
  }

  function insertSnippet(text: string) {
    setShowFeedback(true);
    setFeedback((current) => {
      const base = current.replace(/\s+$/, "");
      return base ? `${base}\n\n${text}` : text;
    });
  }

  const submit = (manualScore: number | null) => {
    if (
      manualScore != null &&
      (manualScore < 0 || manualScore > answer.maxScore)
    )
      return;
    const feedbackValue = feedback.trim() ? feedback : null;
    if (manualScore != null && (usesRubric || bulk)) {
      saveMany.mutate({
        answerIds: bulk ? [answer.id, ...others] : [answer.id],
        manualScore,
        feedback: feedbackValue,
        rubricChecked: items.length > 0 ? checked : undefined,
      });
      return;
    }
    save.mutate({
      answerId: answer.id,
      manualScore,
      feedback: feedbackValue,
    });
  };

  const scoreLabel = questionNumber
    ? `Punten voor vraag ${questionNumber} (maximaal ${formatNumber(answer.maxScore)})`
    : `Punten (maximaal ${formatNumber(answer.maxScore)})`;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-muted/30 p-4",
        needsReview && "border-warning/40 bg-warning/[0.05]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span
            id={`${id}-total-label`}
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Beoordeling
          </span>
          <output
            aria-labelledby={`${id}-total-label`}
            className="flex items-baseline gap-1"
          >
            <span className="font-display text-2xl font-bold tabular-nums">
              {effective == null ? "?" : formatNumber(effective)}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              / {formatNumber(answer.maxScore)}
            </span>
          </output>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Bot className="size-3.5" aria-hidden="true" />
            Automatisch:{" "}
            {answer.autoScore == null
              ? "geen score"
              : formatNumber(answer.autoScore)}
          </span>
          {answer.manualScore != null ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-primary">
              <UserRoundPen className="size-3.5" aria-hidden="true" />
              Handmatig: {formatNumber(answer.manualScore)}
            </span>
          ) : needsReview ? (
            <span className="font-medium text-warning-ink">
              Wacht op jouw beoordeling
            </span>
          ) : null}
        </div>
      </div>

      {disabled ? (
        <p className="text-sm text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <RubricChecklist
            items={items}
            checked={checked}
            onCheckedChange={changeChecked}
            max={answer.maxScore}
            onApplyToFeedback={() => {
              setShowFeedback(true);
              setFeedback((current) =>
                prependRubricFeedback(
                  current,
                  rubricFeedbackLines(items, checked, formatNumber),
                ),
              );
            }}
          />

          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-score`} className="text-sm font-medium">
              {scoreLabel}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-28">
                <NumberInput
                  id={`${id}-score`}
                  value={score}
                  allowEmpty
                  min={0}
                  max={answer.maxScore}
                  step={0.5}
                  placeholder={
                    answer.autoScore == null
                      ? "–"
                      : formatNumber(answer.autoScore)
                  }
                  aria-invalid={invalid || undefined}
                  aria-describedby={`${id}-score-help`}
                  onChange={setScore}
                />
              </div>
              <fieldset className="flex flex-wrap gap-1">
                <legend className="sr-only">Snelle score</legend>
                {quickScores(answer.maxScore).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={parsed === v}
                    onClick={() => setScore(v)}
                    className={cn(
                      "h-8 min-w-9 rounded-md border bg-background px-2 text-sm font-medium tabular-nums transition-colors hover:bg-accent",
                      parsed === v &&
                        "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {formatNumber(v)}
                  </button>
                ))}
              </fieldset>
            </div>
            {invalid ? (
              <p
                id={`${id}-score-help`}
                className="text-xs font-medium text-destructive"
              >
                Kies een score van 0 tot en met {formatNumber(answer.maxScore)}.
              </p>
            ) : (
              <p
                id={`${id}-score-help`}
                className="text-xs text-muted-foreground"
              >
                {answer.autoScore == null
                  ? "Kies een score. Halve punten mogen."
                  : "Leeg laten = de automatische score telt. Halve punten mogen."}
              </p>
            )}
          </div>

          <FeedbackSnippets
            questionId={resolvedQuestionId}
            feedback={feedback}
            onInsert={insertSnippet}
          />

          {showFeedback ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-feedback`} className="text-sm font-medium">
                Feedback voor de leerling
              </label>
              <MarkdownEditor
                id={`${id}-feedback`}
                value={feedback}
                onChange={setFeedback}
                minRows={compact ? 3 : 4}
                placeholder="Bijvoorbeeld: Goed bedacht! Let op: input() geeft altijd tekst terug."
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {!showFeedback ? (
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto"
                onClick={() => setShowFeedback(true)}
              >
                <MessageSquarePlus aria-hidden="true" />
                Feedback toevoegen
              </Button>
            ) : null}
            {others.length > 0 ? (
              <div className="mr-auto flex items-center gap-2">
                <Checkbox
                  id={`${id}-same`}
                  checked={applyToSame}
                  disabled={pending}
                  onCheckedChange={(v) => setApplyToSame(v === true)}
                />
                <label htmlFor={`${id}-same`} className="text-sm">
                  Ook toepassen op {others.length} gelijke{" "}
                  {others.length === 1 ? "antwoord" : "antwoorden"}
                </label>
              </div>
            ) : null}
            {answer.manualScore != null ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setScore(undefined);
                  setChecked(null);
                  submit(null);
                }}
              >
                <RotateCcw aria-hidden="true" />
                Automatische score herstellen
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={
                pending ||
                invalid ||
                (!dirty && !bulk) ||
                (bulk && parsed == null)
              }
              onClick={() => submit(parsed)}
            >
              {pending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : dirty || needsReview || bulk ? (
                <Save aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {dirty || needsReview || bulk ? saveLabel : "Opgeslagen"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
