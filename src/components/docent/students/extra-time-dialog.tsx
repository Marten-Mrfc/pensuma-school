"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, TimerReset } from "lucide-react";
import { useState } from "react";
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
import { useTRPC } from "@/trpc/react";
import { ExtraTimeField } from "./extra-time-field";

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
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setPercent(initialPercent);
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
        toast.success(
          res.updated === 1
            ? "Faciliteiten opgeslagen"
            : `Verlengde tijd opgeslagen voor ${res.updated} leerlingen`,
        );
        onSaved?.();
        onOpenChange(false);
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    }),
  );

  const who =
    students.length === 1
      ? (students[0]?.name ?? "de leerling")
      : `${students.length} leerlingen`;

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
        <ExtraTimeField value={percent} onChange={setPercent} />
        <p className="text-xs text-muted-foreground">
          Een toets die al bezig is, verandert niet. Gebruik daarvoor ‘Tijd
          verlengen’ in het live overzicht.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
