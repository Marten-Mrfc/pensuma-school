"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTRPC } from "@/trpc/react";
import { StudentPicker } from "./student-picker";
import { useDialogReturnFocus } from "./use-dialog-return-focus";

type TargetAssignment = {
  id: string;
  class: { id: string; name: string };
  targetedStudentIds: string[] | null;
};

/** "Leerlingen kiezen…": the whole class, or only some students. */
export function SelectStudentsDialog({
  open,
  onOpenChange,
  assignment,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null while it loads (see SelectStudentsDialogById). */
  assignment: TargetAssignment | null;
  /** Shown instead of the form while `assignment` is null. */
  loading?: ReactNode;
}) {
  const returnFocus = useDialogReturnFocus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-xl"
        {...returnFocus}
      >
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Leerlingen kiezen</DialogTitle>
          <DialogDescription>
            Wie mag deze afname maken? Pogingen die al bestaan blijven altijd
            bewaard.
          </DialogDescription>
        </div>
        {open && assignment ? (
          <SelectStudentsForm
            assignment={assignment}
            onDone={() => onOpenChange(false)}
          />
        ) : open ? (
          loading
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SelectStudentsForm({
  assignment,
  onDone,
}: {
  assignment: TargetAssignment;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const id = useId();
  const [scope, setScope] = useState<"class" | "some">(
    assignment.targetedStudentIds ? "some" : "class",
  );
  const [ids, setIds] = useState<string[]>(assignment.targetedStudentIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation(
    trpc.assignment.setStudents.mutationOptions({
      onSuccess: async (res) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.assignment.pathKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.review.pathKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.pathKey(),
        });
        toast.success(
          res.targetedStudentCount == null
            ? "De hele klas kan deze afname maken"
            : `Alleen voor ${res.targetedStudentCount} ${res.targetedStudentCount === 1 ? "leerling" : "leerlingen"}`,
          {
            description: res.removedWithAttempts
              ? `${res.removedWithAttempts} ${res.removedWithAttempts === 1 ? "leerling die je weghaalde, heeft" : "leerlingen die je weghaalde, hebben"} al een poging. Die blijft bewaard en staat nog bij de resultaten.`
              : undefined,
          },
        );
        onDone();
      },
      onError: (err) => setError(getErrorMessage(err)),
    }),
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (scope === "some" && ids.length === 0) {
          setError("Kies minstens één leerling.");
          return;
        }
        setError(null);
        save.mutate({
          id: assignment.id,
          userIds: scope === "class" ? null : ids,
        });
      }}
    >
      <RadioGroup
        value={scope}
        onValueChange={(v) => setScope(v as "class" | "some")}
        aria-label="Wie mag de afname maken?"
        className="gap-2"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${id}-class`} value="class" />
          <label htmlFor={`${id}-class`} className="text-sm font-medium">
            De hele klas ({assignment.class.name})
          </label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${id}-some`} value="some" />
          <label htmlFor={`${id}-some`} className="text-sm font-medium">
            Alleen een paar leerlingen (inhaaltoets of herkansing)
          </label>
        </div>
      </RadioGroup>
      {scope === "some" ? (
        <StudentPicker
          classId={assignment.class.id}
          value={ids}
          onChange={setIds}
        />
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={save.isPending}
        >
          Annuleren
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : null}
          Opslaan
        </Button>
      </div>
    </form>
  );
}

/** Same dialog for places that only know the afname's id (the list). */
export function SelectStudentsDialogById({
  assignmentId,
  open,
  onOpenChange,
}: {
  assignmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const assignment = useQuery({
    ...trpc.assignment.get.queryOptions({ id: assignmentId }),
    enabled: open,
  });
  // One dialog for loading and the form, so focus stays inside it.
  return (
    <SelectStudentsDialog
      open={open}
      onOpenChange={onOpenChange}
      assignment={assignment.data ?? null}
      loading={
        assignment.isError ? (
          <ErrorState
            error={assignment.error}
            onRetry={() => assignment.refetch()}
          />
        ) : (
          <LoadingState variant="list" />
        )
      }
    />
  );
}
