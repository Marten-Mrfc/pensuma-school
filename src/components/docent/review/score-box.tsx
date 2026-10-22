"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

export type ScoreBoxAnswer = {
  id: string;
  autoScore: number | null;
  manualScore: number | null;
  maxScore: number;
  feedback: string | null;
  status: string;
};

/** Quick score buttons: 0, ½, 1, … up to max (whole points when max > 6). */
export function quickScores(max: number): number[] {
  const step = max > 6 ? 1 : 0.5;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 2) / 2);
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

/**
 * Teacher scoring: automatic score, manual override (0..max, step 0.5),
 * "restore automatic score" and markdown feedback.
 */
export function ScoreBox({
  answer,
  disabled,
  disabledReason,
  onSaved,
  compact,
  saveLabel = "Opslaan",
}: {
  answer: ScoreBoxAnswer;
  disabled?: boolean;
  disabledReason?: string;
  onSaved?: () => void;
  compact?: boolean;
  /** Label of the save button, e.g. "Opslaan en volgende". */
  saveLabel?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const id = useId();
  const initialScore = answer.manualScore ?? null;
  const [score, setScore] = useState<string>(
    initialScore == null ? "" : String(initialScore),
  );
  const [feedback, setFeedback] = useState(answer.feedback ?? "");
  const [showFeedback, setShowFeedback] = useState(
    !!answer.feedback?.trim() || !!compact,
  );

  const save = useMutation(
    trpc.review.setManualScore.mutationOptions({
      onSuccess: async (res) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.review.pathKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.assignment.pathKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.pathKey(),
        });
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
        onSaved?.();
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    }),
  );

  const parsed = score.trim() === "" ? null : Number(score.replace(",", "."));
  const invalid =
    parsed != null &&
    (!Number.isFinite(parsed) || parsed < 0 || parsed > answer.maxScore);
  const dirty =
    parsed !== initialScore ||
    (feedback.trim() || null) !== (answer.feedback?.trim() || null);
  const effective = parsed ?? answer.autoScore;
  const needsReview =
    answer.status === "needs_review" && answer.manualScore == null;

  const submit = (manualScore: number | null) => {
    if (
      manualScore != null &&
      (manualScore < 0 || manualScore > answer.maxScore)
    )
      return;
    save.mutate({
      answerId: answer.id,
      manualScore,
      feedback: feedback.trim() ? feedback : null,
    });
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-muted/30 p-4",
        needsReview && "border-warning/40 bg-warning/[0.05]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Beoordeling
          </span>
          <span className="flex items-baseline gap-1">
            <span className="font-display text-2xl font-bold tabular-nums">
              {effective == null ? "?" : formatNumber(effective)}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              / {formatNumber(answer.maxScore)}
            </span>
          </span>
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
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-score`} className="text-sm font-medium">
              {answer.autoScore == null ? "Score" : "Score aanpassen"}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-28">
                <Input
                  id={`${id}-score`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={answer.maxScore}
                  step={0.5}
                  placeholder={
                    answer.autoScore == null ? "–" : String(answer.autoScore)
                  }
                  value={score}
                  aria-invalid={invalid}
                  onChange={(e) => setScore(e.target.value)}
                />
              </div>
              <fieldset
                className="flex flex-wrap gap-1"
                aria-label="Snelle score"
              >
                {quickScores(answer.maxScore).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setScore(String(v))}
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
              <p className="text-xs font-medium text-destructive">
                Kies een score van 0 tot en met {formatNumber(answer.maxScore)}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {answer.autoScore == null
                  ? "Kies een score. Halve punten mogen."
                  : "Leeg laten = de automatische score telt. Halve punten mogen."}
              </p>
            )}
          </div>

          {showFeedback ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                Feedback voor de leerling
              </span>
              <MarkdownEditor
                value={feedback}
                onChange={setFeedback}
                minRows={compact ? 3 : 4}
                placeholder="Bijvoorbeeld: Goed bedacht! Let op: input() geeft altijd tekst terug."
                aria-label="Feedback voor de leerling"
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
            {answer.manualScore != null ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={save.isPending}
                onClick={() => {
                  setScore("");
                  submit(null);
                }}
              >
                <RotateCcw aria-hidden="true" />
                Automatische score herstellen
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={save.isPending || invalid || !dirty}
              onClick={() => submit(parsed)}
            >
              {save.isPending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : dirty || needsReview ? (
                <Save aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {dirty || needsReview ? saveLabel : "Opgeslagen"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
