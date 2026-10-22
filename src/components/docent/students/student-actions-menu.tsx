"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CircleCheck,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Printer,
  Trash2,
  UserMinus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { routes } from "@/lib/routes";
import { useTRPC } from "@/trpc/react";
import { PinDialog, type PinDialogStudent } from "./pin-dialog";
import { StudentFormDialog } from "./student-form-dialog";

export type ActionStudent = {
  id: string;
  name: string;
  studentNumber: string;
  banned: boolean;
};

export interface StudentActionsMenuProps {
  student: ActionStudent;
  /** When set, the menu offers "Uit klas halen" and prints within this class. */
  classId?: string;
  className?: string;
  /** Show a "Bekijk leerling" link (lists). */
  showDetailsLink?: boolean;
  /** Called after the student was deleted (e.g. navigate away). */
  onDeleted?: () => void;
}

type DialogName = "reset" | "edit" | "remove" | "deactivate" | "delete" | null;

/** Row actions for a student: PIN resetten, bewerken, uit klas halen, (de)activeren, verwijderen. */
export function StudentActionsMenu({
  student,
  classId,
  className,
  showDetailsLink,
  onDeleted,
}: StudentActionsMenuProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogName>(null);
  const [newPin, setNewPin] = useState<PinDialogStudent | null>(null);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.student.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.class.pathKey() }),
    ]);

  const resetPin = useMutation(trpc.student.resetPin.mutationOptions());
  const removeMember = useMutation(trpc.class.removeMember.mutationOptions());
  const setActive = useMutation(trpc.student.setActive.mutationOptions());
  const remove = useMutation(trpc.student.delete.mutationOptions());

  const printHref = classId
    ? `${routes.docent.classLoginCards(classId)}?ids=${encodeURIComponent(student.id)}`
    : routes.docent.studentLoginCards([student.id]);

  async function activate() {
    try {
      await setActive.mutateAsync({ id: student.id, active: true });
      await invalidate();
      toast.success(`${student.name} kan weer inloggen`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activeren mislukt.");
    }
  }

  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={className}
            aria-label={`Acties voor ${student.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
            {student.name} · {student.studentNumber}
          </DropdownMenuLabel>
          {showDetailsLink ? (
            <DropdownMenuItem asChild>
              <Link href={routes.docent.student(student.id)}>
                <UserRound />
                Bekijk leerling
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setDialog("reset")}>
            <KeyRound />
            Pincode resetten
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={printHref} target="_blank" rel="noopener">
              <Printer />
              Inlogkaart printen
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil />
            Bewerken
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {classId ? (
            <DropdownMenuItem onSelect={() => setDialog("remove")}>
              <UserMinus />
              Uit klas halen
            </DropdownMenuItem>
          ) : null}
          {student.banned ? (
            <DropdownMenuItem onSelect={activate}>
              <CircleCheck />
              Activeren
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setDialog("deactivate")}>
              <Ban />
              Deactiveren
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 />
            Verwijderen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={dialog === "reset"}
        onOpenChange={close}
        title={`Pincode van ${student.name} resetten?`}
        description="De leerling krijgt een nieuwe pincode en wordt op alle apparaten uitgelogd. Een afname die bezig is, blijft bewaard."
        confirmLabel="Nieuwe pincode maken"
        onConfirm={async () => {
          const res = await resetPin.mutateAsync({ id: student.id });
          await invalidate();
          setNewPin(res);
        }}
      />

      <ConfirmDialog
        open={dialog === "remove"}
        onOpenChange={close}
        title={`${student.name} uit de klas halen?`}
        description="Het account en de resultaten van de leerling blijven bestaan. De leerling ziet geen nieuwe afnames van deze klas meer."
        confirmLabel="Uit klas halen"
        onConfirm={async () => {
          if (!classId) return;
          await removeMember.mutateAsync({ classId, userId: student.id });
          await invalidate();
          toast.success(`${student.name} is uit de klas gehaald`);
        }}
      />

      <ConfirmDialog
        open={dialog === "deactivate"}
        onOpenChange={close}
        title={`${student.name} deactiveren?`}
        description="De leerling wordt direct uitgelogd en kan niet meer inloggen tot je het account weer activeert. Resultaten blijven bewaard."
        confirmLabel="Deactiveren"
        destructive
        onConfirm={async () => {
          await setActive.mutateAsync({ id: student.id, active: false });
          await invalidate();
          toast.success(`${student.name} is gedeactiveerd`);
        }}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={`${student.name} definitief verwijderen?`}
        description="Het account, alle pogingen en alle antwoorden van deze leerling worden verwijderd. Dit kun je niet ongedaan maken. Wil je alleen inloggen blokkeren? Kies dan Deactiveren."
        confirmLabel="Definitief verwijderen"
        destructive
        onConfirm={async () => {
          await remove.mutateAsync({ id: student.id });
          await invalidate();
          toast.success(`${student.name} is verwijderd`);
          onDeleted?.();
        }}
      />

      <StudentFormDialog open={dialog === "edit"} onOpenChange={close} student={student} />

      <PinDialog
        open={newPin !== null}
        onOpenChange={(open) => !open && setNewPin(null)}
        student={newPin}
        classId={classId}
      />
    </>
  );
}
