"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert, TimerReset } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { routes } from "@/lib/routes";
import { useTRPC } from "@/trpc/react";
import { ExtraTimeField } from "./extra-time-field";
import { plural, restrictedSkipNote } from "./format";

/**
 * “Voor Emma Smit” / “Voor 3 leerlingen”: who the dialog is about. After a
 * save that skipped students, the result decides: the caller has cleared its
 * selection by then (`students` is empty), so the count would read 0.
 */
export function extraTimeAudience(
  students: readonly { name: string }[],
  saved: { updated: number; skippedRestricted: number } | null,
): string {
  const count = saved
    ? saved.updated + saved.skippedRestricted
    : students.length;
  if (!saved && count === 1) return students[0]?.name ?? "de leerling";
  return plural(count, "leerling", "leerlingen");
}

/**
 * “Verlengde tijd instellen…” for one or more students at once (only the
 * percentage; paste and window-switch facilities stay as they are).
 */
export function ExtraTimeDialog({
  open,
  onOpenChange,
  students,
  initialPercent = 0,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: { id: string; name: string }[];
  /** Current value (for a single student). */
  initialPercent?: number;
  onSaved?: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState(initialPercent);
  /** Saved, but some students were skipped (AVG art. 18): stay open. */
  const [skipped, setSkipped] = useState<{
    updated: number;
    skippedRestricted: number;
  } | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setPercent(initialPercent);
      setSkipped(null);
    }
  }

  const save = useMutation(
    trpc.accommodation.setMany.mutationOptions({
      onSuccess: async (res) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.accommodation.pathKey(),
          }),
          queryClient.invalidateQueries({ queryKey: trpc.student.pathKey() }),
        ]);
        onSaved?.();
        if (res.skippedRestricted > 0) {
          // Keep the dialog open: the teacher must see who was skipped.
          setSkipped(res);
          // The Opslaan button disappears: read the result instead.
          requestAnimationFrame(() => noticeRef.current?.focus());
          return;
        }
        toast.success(
          res.updated === 1
            ? "Faciliteiten opgeslagen"
            : `Verlengde tijd opgeslagen voor ${res.updated} leerlingen`,
        );
        onOpenChange(false);
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    }),
  );

  const who = extraTimeAudience(students, skipped);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TimerReset className="size-5 text-primary" aria-hidden="true" />
            Verlengde tijd
          </DialogTitle>
          <DialogDescription>
            Voor {who}. Geldt automatisch bij elke toets met een tijdslimiet of
            eindtijd.
          </DialogDescription>
        </DialogHeader>
        {skipped ? (
          // biome-ignore lint/a11y/useSemanticElements: a block-level status (<output> only takes phrasing content); focused after saving
          <div
            ref={noticeRef}
            role="status"
            tabIndex={-1}
            className="flex items-start gap-3 rounded-lg border border-warning/35 bg-warning/10 px-3.5 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ShieldAlert
              className="mt-0.5 size-4 shrink-0 text-warning-ink"
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-medium">
                Verlengde tijd opgeslagen voor{" "}
                {plural(skipped.updated, "leerling", "leerlingen")}.
              </p>
              <p className="text-pretty text-muted-foreground">
                {restrictedSkipNote(skipped.skippedRestricted)} Hef de beperking
                op via{" "}
                <Link
                  href={routes.docent.privacy}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Privacy &amp; gegevens
                </Link>
                .
              </p>
            </div>
          </div>
        ) : (
          <>
            <ExtraTimeField value={percent} onChange={setPercent} />
            <p className="text-xs text-muted-foreground">
              Een toets die al bezig is, verandert niet. Gebruik daarvoor ‘Tijd
              verlengen’ in het live overzicht.
            </p>
          </>
        )}
        <DialogFooter>
          <Button
            variant={skipped ? "default" : "outline"}
            onClick={() => onOpenChange(false)}
          >
            {skipped ? "Sluiten" : "Annuleren"}
          </Button>
          {skipped ? null : (
            <Button
              disabled={save.isPending || students.length === 0}
              onClick={() =>
                save.mutate({
                  userIds: students.map((s) => s.id),
                  extraTimePercent: percent,
                })
              }
            >
              {save.isPending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Opslaan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
