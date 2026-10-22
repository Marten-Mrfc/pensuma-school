"use client";

import { KeyRound, Printer } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/app/copy-button";
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
import { formatPin } from "./format";

export interface PinDialogStudent {
  id: string;
  name: string;
  studentNumber: string;
  pin: string;
}

export interface PinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: PinDialogStudent | null;
  title?: string;
  description?: string;
  /** Class context for the print link (falls back to the per-student print page). */
  classId?: string;
}

/** Shows a (new) PIN once, big and copyable, with a link to print the login card. */
export function PinDialog({
  open,
  onOpenChange,
  student,
  title = "Nieuwe pincode",
  description = "De leerling is overal uitgelogd en logt voortaan in met deze pincode.",
  classId,
}: PinDialogProps) {
  const printHref = student
    ? classId
      ? `${routes.docent.classLoginCards(classId)}?ids=${encodeURIComponent(student.id)}`
      : routes.docent.studentLoginCards([student.id])
    : "#";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {student ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border bg-muted/40 px-4 py-6 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-foreground">{student.name}</span>
              <span className="text-sm text-muted-foreground">
                Leerlingnummer <span className="font-mono text-foreground">{student.studentNumber}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <output
                className="font-mono text-4xl font-medium tracking-[0.2em] text-foreground tabular-nums"
                aria-label={`Pincode ${student.pin.split("").join(" ")}`}
              >
                {formatPin(student.pin)}
              </output>
              <CopyButton value={student.pin} successMessage="Pincode gekopieerd" />
            </div>
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" asChild>
            <Link href={printHref} target="_blank" rel="noopener">
              <Printer aria-hidden="true" />
              Inlogkaart printen
            </Link>
          </Button>
          <Button onClick={() => onOpenChange(false)}>Klaar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
