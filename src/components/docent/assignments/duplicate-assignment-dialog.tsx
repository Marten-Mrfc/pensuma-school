"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyPlus, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTRPC } from "@/trpc/react";
import { ClassMultiSelect } from "./class-multi-select";
import { formatWindow } from "./format";
import { useDialogReturnFocus } from "./use-dialog-return-focus";

/** "Afname dupliceren": copy test, title, mode, time limit and settings to other classes. */
export function DuplicateAssignmentDialog({
  open,
  onOpenChange,
  assignment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: {
    id: string;
    title: string;
    class: { id: string; name: string };
    opensAt: Date | string | null;
    closesAt: Date | string | null;
  };
}) {
  const returnFocus = useDialogReturnFocus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg" {...returnFocus}>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>Afname dupliceren</DialogTitle>
          <DialogDescription>
            Dezelfde toets, titel, modus, tijdslimiet en instellingen voor
            andere klassen. Elke kopie krijgt een eigen toegangscode.
          </DialogDescription>
        </div>
        {open ? (
          <DuplicateForm
            assignment={assignment}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DuplicateForm({
  assignment,
  onDone,
}: {
  assignment: Parameters<typeof DuplicateAssignmentDialog>[0]["assignment"];
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const id = useId();
  const options = useQuery(trpc.assignment.formOptions.queryOptions());
  const [classIds, setClassIds] = useState<string[]>([]);
  const [keepWindow, setKeepWindow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasWindow = !!(assignment.opensAt || assignment.closesAt);

  const duplicate = useMutation(
    trpc.assignment.duplicate.mutationOptions({
      onSuccess: async (res) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.assignment.pathKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.pathKey(),
        });
        toast.success(
          res.items.length === 1
            ? "Afname gedupliceerd"
            : `${res.items.length} afnames gepland`,
          { description: res.items.map((i) => i.className).join(", ") },
        );
        onDone();
      },
      onError: (err) => setError(getErrorMessage(err)),
    }),
  );

  if (options.isPending) return <LoadingState variant="list" />;
  if (options.isError)
    return (
      <ErrorState error={options.error} onRetry={() => options.refetch()} />
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!classIds.length) {
          setError("Kies minstens één klas.");
          return;
        }
        setError(null);
        duplicate.mutate({ id: assignment.id, classIds, keepWindow });
      }}
    >
      <ClassMultiSelect
        legend="Naar welke klassen?"
        classes={options.data.classes}
        value={classIds}
        onChange={setClassIds}
        markId={assignment.class.id}
      />
      {hasWindow ? (
        <Checkbox
          id={`${id}-window`}
          checked={keepWindow}
          onCheckedChange={(v) => setKeepWindow(v === true)}
          label="Zelfde start- en eindtijd"
          hint={formatWindow(assignment.opensAt, assignment.closesAt)}
        />
      ) : null}
      <p className="text-xs text-muted-foreground">
        {keepWindow
          ? "De kopieën gaan op hetzelfde moment open en dicht."
          : "De kopieën worden gepland zonder tijdvak; je opent ze zelf."}
      </p>
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
          disabled={duplicate.isPending}
        >
          Annuleren
        </Button>
        <Button type="submit" disabled={duplicate.isPending}>
          {duplicate.isPending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <CopyPlus aria-hidden="true" />
          )}
          Dupliceren
        </Button>
      </div>
    </form>
  );
}
