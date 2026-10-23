"use client";

import { ArrowRight, CircleAlert, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TestProblem } from "@/lib/questions/validate";
import { cn } from "@/lib/utils";

export function PublishDialog({
  open,
  onOpenChange,
  problems,
  warnings,
  onSelectQuestion,
  onPublishAnyway,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problems: TestProblem[];
  warnings: TestProblem[];
  onSelectQuestion: (questionId: string | null) => void;
  onPublishAnyway: () => void;
  pending: boolean;
}) {
  const blocked = problems.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4 text-left">
          <div className="flex flex-col gap-1.5">
            <DialogTitle className="text-base leading-snug">
              {blocked
                ? "De toets kan nog niet gepubliceerd worden"
                : "Wil je de toets toch publiceren?"}
            </DialogTitle>
            <DialogDescription>
              {blocked
                ? `Los eerst ${problems.length === 1 ? "dit probleem" : `deze ${problems.length} problemen`} op. Kies een melding om naar de vraag te gaan.`
                : "Er zijn geen fouten, maar wel een paar aandachtspunten. Controleer ze voordat leerlingen de toets maken."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          {problems.length > 0 ? (
            <ProblemGroup
              title="Problemen"
              severity="error"
              items={problems}
              onSelect={onSelectQuestion}
            />
          ) : null}
          {warnings.length > 0 ? (
            <ProblemGroup
              title="Aandachtspunten"
              severity="warning"
              items={warnings}
              onSelect={onSelectQuestion}
            />
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {blocked ? "Sluiten" : "Annuleren"}
          </Button>
          {!blocked ? (
            <Button onClick={onPublishAnyway} disabled={pending}>
              {pending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Toch publiceren
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProblemGroup({
  title,
  severity,
  items,
  onSelect,
}: {
  title: string;
  severity: "error" | "warning";
  items: TestProblem[];
  onSelect: (questionId: string | null) => void;
}) {
  const Icon = severity === "error" ? CircleAlert : TriangleAlert;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">
        {title}{" "}
        <span className="ml-1 font-normal text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={`${item.code}-${item.message}`}>
            <button
              type="button"
              onClick={() => onSelect(item.questionId ?? null)}
              className={cn(
                "group flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                severity === "error"
                  ? "bg-destructive/[0.06] text-destructive-ink hover:bg-destructive/10"
                  : "bg-warning/10 text-warning-ink hover:bg-warning/15",
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-foreground">
                {item.message}
              </span>
              <ArrowRight
                className="mt-0.5 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
