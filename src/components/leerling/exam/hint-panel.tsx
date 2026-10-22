"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Markdown } from "@/components/app/markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { formatNumber, formatPercent } from "../format";
import { focusAfterDialogs } from "./focus-after-dialogs";

const pointsText = (n: number) =>
  `${formatNumber(n)} ${n > 1 ? "punten" : "punt"}`;

/**
 * Hints of one code question: revealed one by one (each may cost a part of
 * the question's points, asked for first). Hidden when the afname has no
 * hints or the question has none.
 */
export function HintPanel({
  attemptId,
  questionId,
  points,
  disabled,
  className,
}: {
  attemptId: string;
  questionId: string;
  points: number;
  disabled?: boolean;
  className?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const baseId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hints = useQuery(
    trpc.help.hints.queryOptions(
      { attemptId },
      { staleTime: Number.POSITIVE_INFINITY, refetchOnWindowFocus: false },
    ),
  );
  const reveal = useMutation(
    trpc.help.revealHint.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.help.hints.queryKey({ attemptId }),
        });
      },
    }),
  );

  const state = hints.data?.enabled
    ? hints.data.questions[questionId]
    : undefined;
  if (!state || state.total === 0) return null;

  const next = state.next;
  const nextNumber = state.revealed.length + 1;
  const hintId = (index: number) => `${baseId}-hint-${index + 1}`;

  /** Throws on failure (the confirm dialog shows the error). */
  const doReveal = async () => {
    if (!next) return;
    await reveal.mutateAsync({ attemptId, questionId, hintId: next.id });
    // Move focus to the new hint so it is read out.
    focusAfterDialogs(hintId(nextNumber - 1));
  };

  const onClick = () => {
    if (!next) return;
    if (next.penalty > 0) {
      setConfirmOpen(true);
      return;
    }
    doReveal().catch((err: unknown) => {
      toast.error(getErrorMessage(err, "Deze hint kon niet worden geladen."), {
        position: "top-center",
      });
    });
  };

  return (
    <section
      aria-label="Hints"
      className={cn("flex flex-col gap-2.5", className)}
    >
      {state.revealed.length ? (
        <ol className="flex flex-col gap-2">
          {state.revealed.map((hint, index) => (
            <li
              key={hint.id}
              id={hintId(index)}
              tabIndex={-1}
              className="flex flex-col gap-1 rounded-lg border border-warning/30 bg-warning/8 px-3.5 py-2.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-warning-ink">
                <Lightbulb className="size-3.5" aria-hidden="true" />
                Hint {index + 1}
              </span>
              <div className="text-sm [&_p]:my-0">
                <Markdown>{hint.text || "_(lege hint)_"}</Markdown>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {next ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClick}
            disabled={disabled || reveal.isPending}
          >
            {reveal.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Lightbulb aria-hidden="true" />
            )}
            Hint bekijken ({nextNumber} van {state.total})
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Hint bekijken?"
            description={`Deze hint kost ${formatPercent(next.penalty)} van de punten voor deze vraag (${pointsText(next.penalty * points)}). Je kunt dit niet ongedaan maken.`}
            confirmLabel="Bekijk hint"
            cancelLabel="Annuleren"
            onConfirm={doReveal}
          />
        </div>
      ) : null}
    </section>
  );
}
