"use client";

import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { type PreviewQuestion, StudentQuestionPreview } from "@/components/docent/questions/question-preview";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/** "Voorbeeld als leerling": the questions exactly as students see them. Nothing is saved. */
export function PreviewSheet({
  open,
  onOpenChange,
  testTitle,
  questions,
  index,
  onIndexChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testTitle: string;
  questions: PreviewQuestion[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const current = questions[index];
  const total = questions.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl lg:max-w-4xl">
        <div className="flex flex-col gap-3 border-b bg-card px-4 pt-4 pb-3 pr-12 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-2.5 py-1 text-xs font-medium text-info-ink">
              <Eye className="size-3.5" aria-hidden="true" />
              Voorbeeld als leerling
            </span>
            <span className="text-xs text-muted-foreground">Er wordt niets opgeslagen.</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <SheetTitle className="truncate font-display text-lg leading-tight">{testTitle || "Naamloze toets"}</SheetTitle>
            <SheetDescription className="sr-only">
              Bekijk en probeer de vragen uit zoals een leerling ze ziet.
            </SheetDescription>
          </div>
          {total > 0 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Vorige vraag"
                disabled={index <= 0}
                onClick={() => onIndexChange(index - 1)}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <NativeSelect
                aria-label="Kies een vraag"
                sizeVariant="sm"
                className="min-w-0 flex-1"
                value={String(index)}
                onChange={(e) => onIndexChange(Number(e.target.value))}
                options={questions.map((q, i) => ({
                  value: String(i),
                  label: `Vraag ${i + 1}: ${q.title || "Naamloze vraag"}`,
                }))}
              />
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Volgende vraag"
                disabled={index >= total - 1}
                onClick={() => onIndexChange(index + 1)}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8">
          {current ? (
            <div className="mx-auto w-full max-w-3xl">
              <StudentQuestionPreview key={current.id} question={current} number={index + 1} total={total} />
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Deze toets heeft nog geen vragen.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
