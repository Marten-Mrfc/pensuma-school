"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/app/form-field";
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
import { Input } from "@/components/ui/input";
import { type RouterOutputs, useTRPC } from "@/trpc/react";

type ClassRow = Pick<
  RouterOutputs["class"]["get"],
  "id" | "name" | "schoolYear" | "description"
>;

export interface ClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this class; omit to create a new one. */
  klas?: ClassRow | null;
  onSaved?: (klas: { id: string; name: string }) => void;
}

/** "2026-2027" for the school year that is running now (starts 1 August). */
export function currentSchoolYear(now = new Date()): string {
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

/** Create or edit a class (naam, schooljaar, omschrijving). */
export function ClassFormDialog(props: ClassFormDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.open ? <ClassForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ClassForm({ onOpenChange, klas, onSaved }: ClassFormDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const editing = Boolean(klas);
  const [name, setName] = useState(klas?.name ?? "");
  const [schoolYear, setSchoolYear] = useState(
    klas ? (klas.schoolYear ?? "") : currentSchoolYear(),
  );
  const [description, setDescription] = useState(klas?.description ?? "");
  const [nameError, setNameError] = useState<string>();
  const [formError, setFormError] = useState<string>();

  const onSuccess = async (saved: { id: string; name: string }) => {
    await queryClient.invalidateQueries({ queryKey: trpc.class.pathKey() });
    toast.success(
      editing ? "Klas bijgewerkt" : `Klas ${saved.name} aangemaakt`,
    );
    onOpenChange(false);
    onSaved?.(saved);
  };
  const onError = (e: unknown) => setFormError(getErrorMessage(e));

  const create = useMutation(
    trpc.class.create.mutationOptions({ onSuccess, onError }),
  );
  const update = useMutation(
    trpc.class.update.mutationOptions({ onSuccess, onError }),
  );
  const pending = create.isPending || update.isPending;

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (!name.trim()) {
      setNameError("Geef de klas een naam.");
      return;
    }
    setNameError(undefined);
    const values = {
      name: name.trim(),
      schoolYear: schoolYear.trim() || null,
      description: description.trim() || null,
    };
    if (klas) update.mutate({ id: klas.id, ...values });
    else create.mutate(values);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "Klas bewerken" : "Nieuwe klas"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Pas de gegevens van de klas aan."
            : "Maak een klas aan. Daarna voeg je leerlingen toe door een lijst te plakken of een CSV-bestand te kiezen."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <FormField label="Naam" htmlFor="class-name" required error={nameError}>
          <Input
            id="class-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bijvoorbeeld 4H2"
            autoFocus
            maxLength={60}
            autoComplete="off"
          />
        </FormField>
        <FormField
          label="Schooljaar"
          htmlFor="class-year"
          description="Optioneel, bijvoorbeeld 2026-2027."
        >
          <Input
            id="class-year"
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            placeholder={currentSchoolYear()}
            maxLength={20}
            autoComplete="off"
          />
        </FormField>
        <FormField
          label="Omschrijving"
          htmlFor="class-description"
          description="Optioneel, alleen zichtbaar voor docenten."
        >
          <textarea
            id="class-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Bijvoorbeeld: informatica, dinsdag en donderdag het 3e uur"
            className="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
          />
        </FormField>
        {formError ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
          >
            {formError}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => onOpenChange(false)}
        >
          Annuleren
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : null}
          {editing ? "Opslaan" : "Klas aanmaken"}
        </Button>
      </DialogFooter>
    </form>
  );
}
