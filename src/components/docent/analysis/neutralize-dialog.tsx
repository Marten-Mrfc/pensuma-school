"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTRPC } from "@/trpc/react";
import { useDialogReturnFocus } from "../assignments/use-dialog-return-focus";

type Mode = "full_points" | "drop";

/** Invalidate everything that shows scores after a (un)neutralisation. */
export function useNeutralizeMutation() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.analysis.neutralizeQuestion.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.analysis.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.review.pathKey() }),
          queryClient.invalidateQueries({
            queryKey: trpc.assignment.pathKey(),
          }),
          queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() }),
        ]);
      },
    }),
  );
}

/** "Vraag laten vervallen": full points for everyone, or drop the question. */
export function NeutralizeDialog({
  open,
  onOpenChange,
  assignmentId,
  question,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  question: { questionId: string; number: number; title: string } | null;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>("full_points");
  const neutralize = useNeutralizeMutation();
  const pending = neutralize.isPending;
  const returnFocus = useDialogReturnFocus();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        if (!o) neutralize.reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md" {...returnFocus}>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Vraag laten vervallen</DialogTitle>
          <DialogDescription>
            {question ? `V${question.number} · ${question.title}` : null}
          </DialogDescription>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!question) return;
            try {
              const res = await neutralize.mutateAsync({
                assignmentId,
                questionId: question.questionId,
                mode,
              });
              toast.success(`V${question.number} is vervallen`, {
                description:
                  mode === "full_points"
                    ? `${res.affectedAttempts} ${res.affectedAttempts === 1 ? "leerling krijgt" : "leerlingen krijgen"} de volle punten.`
                    : "De vraag telt niet meer mee; het maximum is omlaag gegaan.",
              });
              onOpenChange(false);
            } catch {
              // The error is shown below.
            }
          }}
        >
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            aria-label="Hoe vervalt de vraag?"
            className="gap-2"
          >
            {(
              [
                ["full_points", "Iedereen krijgt de volle punten"],
                ["drop", "Vraag telt niet mee (het maximum gaat omlaag)"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                htmlFor={`${id}-${value}`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/[0.04]"
              >
                <RadioGroupItem id={`${id}-${value}`} value={value} />
                {label}
              </label>
            ))}
          </RadioGroup>
          <p className="text-sm text-muted-foreground">
            Dit geldt alleen voor deze afname. Je kunt het later ongedaan maken.
          </p>
          {neutralize.error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
            >
              {getErrorMessage(neutralize.error)}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={pending || !question}>
              {pending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Ban aria-hidden="true" />
              )}
              Vraag laten vervallen
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
