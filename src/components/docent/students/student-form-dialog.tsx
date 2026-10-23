"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
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
import { NativeSelect } from "@/components/ui/select";
import { STUDENT_NUMBER_REGEX } from "@/lib/auth-shared";
import { useTRPC } from "@/trpc/react";
import { focusInvalidField } from "../a11y/invalid-field-focus";
import type { PinDialogStudent } from "./pin-dialog";

type EditableStudent = { id: string; name: string; studentNumber: string };

export interface StudentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this student; omit to create a new one. */
  student?: EditableStudent | null;
  /** Preselected class when creating. */
  defaultClassId?: string;
  /** Hide the class picker (e.g. when the class is fixed by the page). */
  hideClassPicker?: boolean;
  /** Called after a student was created, with their PIN. */
  onCreated?: (student: PinDialogStudent) => void;
}

/** Create or edit a student (leerlingnummer, naam, klas). */
export function StudentFormDialog(props: StudentFormDialogProps) {
  // Remount the form whenever the dialog opens so fields start fresh.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.open ? <StudentForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function StudentForm({
  onOpenChange,
  student,
  defaultClassId,
  hideClassPicker,
  onCreated,
}: StudentFormDialogProps) {
  const uid = useId();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const editing = Boolean(student);
  const ids = {
    number: `${uid}-student-number`,
    name: `${uid}-student-name`,
  };

  const [studentNumber, setStudentNumber] = useState(
    student?.studentNumber ?? "",
  );
  const [name, setName] = useState(student?.name ?? "");
  const [classId, setClassId] = useState(defaultClassId ?? "");
  const [errors, setErrors] = useState<{
    number?: string;
    name?: string;
    form?: string;
  }>({});

  const classesQuery = useQuery({
    ...trpc.class.list.queryOptions({}),
    enabled: !editing && !hideClassPicker,
  });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.student.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.class.pathKey() }),
    ]);

  const create = useMutation(
    trpc.student.create.mutationOptions({
      onSuccess: async (res) => {
        await invalidate();
        toast.success(`${res.user.name} is toegevoegd`);
        onOpenChange(false);
        onCreated?.({ ...res.user, pin: res.pin });
      },
      onError: (e) => setErrors({ form: getErrorMessage(e) }),
    }),
  );

  const update = useMutation(
    trpc.student.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Leerling bijgewerkt");
        onOpenChange(false);
      },
      onError: (e) => setErrors({ form: getErrorMessage(e) }),
    }),
  );

  const pending = create.isPending || update.isPending;
  const numberChanged =
    editing && studentNumber.trim() !== student?.studentNumber;

  function submit(e: FormEvent) {
    e.preventDefault();
    const number = studentNumber.trim();
    const cleanName = name.trim().replace(/\s+/g, " ");
    const next: typeof errors = {};
    if (!STUDENT_NUMBER_REGEX.test(number))
      next.number = "Een leerlingnummer bestaat uit 3 tot 12 cijfers.";
    if (!cleanName) next.name = "Vul de naam van de leerling in.";
    setErrors(next);
    if (next.number) {
      focusInvalidField(ids.number, next.number, announce);
      return;
    }
    if (next.name) {
      focusInvalidField(ids.name, next.name, announce);
      return;
    }

    if (student) {
      update.mutate({ id: student.id, name: cleanName, studentNumber: number });
    } else {
      create.mutate({
        studentNumber: number,
        name: cleanName,
        classId: classId || undefined,
      });
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>
          {editing ? "Leerling bewerken" : "Leerling toevoegen"}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? "Pas de naam of het leerlingnummer aan."
            : "De leerling krijgt automatisch een pincode van 6 cijfers om mee in te loggen."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <FormField
          label="Leerlingnummer"
          htmlFor={ids.number}
          required
          error={errors.number}
          description={
            numberChanged
              ? "Let op: de leerling logt voortaan in met dit nieuwe nummer."
              : "Hetzelfde nummer als in Magister of SOMtoday, bijvoorbeeld 17053."
          }
        >
          <Input
            id={ids.number}
            inputMode="numeric"
            autoComplete="off"
            autoFocus={!editing}
            value={studentNumber}
            onChange={(e) =>
              setStudentNumber(e.target.value.replace(/\s/g, ""))
            }
            className="font-mono"
            maxLength={12}
          />
        </FormField>

        <FormField
          label="Naam"
          htmlFor={ids.name}
          required
          error={errors.name}
        >
          <Input
            id={ids.name}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Voornaam Achternaam"
          />
        </FormField>

        {!editing && !hideClassPicker ? (
          <FormField
            label="Klas"
            htmlFor={`${uid}-student-class`}
            description="Optioneel. Je kunt dit later nog aanpassen."
          >
            <NativeSelect
              id={`${uid}-student-class`}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={classesQuery.isLoading}
            >
              <option value="">Geen klas</option>
              {classesQuery.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.schoolYear ? ` (${c.schoolYear})` : ""}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ) : null}

        {errors.form ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
          >
            {errors.form}
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
          {editing ? "Opslaan" : "Toevoegen"}
        </Button>
      </DialogFooter>
    </form>
  );
}
