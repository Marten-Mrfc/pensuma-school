"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Loader2,
  Lock,
  LockOpen,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { ErrorState, LoadingState } from "@/components/app/states";
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
import { downloadTextFile } from "@/lib/export/download";
import { exportFileName } from "@/lib/privacy/export-format";
import { HOLD_KIND_LABELS } from "@/lib/privacy/retention";
import { routes } from "@/lib/routes";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { formatDate, plural } from "../students/format";
import { Notice, PanelCard } from "./notice";
import { type PickedStudent, StudentPicker } from "./student-picker";

type ErasePreview = RouterOutputs["privacy"]["erasePreview"];

/** "Inzage & verwijderen": export, restrict or erase one student. */
export function DataSubjectTools() {
  const pickerId = useId();
  const [student, setStudent] = useState<PickedStudent | null>(null);

  return (
    <PanelCard
      title="Inzage en verwijderen"
      description="Voor een inzage-, verbeter- of verwijderverzoek van een leerling of ouder. Alles wat je hier doet, komt in het logboek."
    >
      <FormField label="Leerling" htmlFor={pickerId} className="max-w-xl">
        <StudentPicker
          id={pickerId}
          value={student}
          onChange={setStudent}
          clearable
        />
      </FormField>
      {student ? (
        <StudentActions
          key={student.id}
          student={student}
          onErased={() => setStudent(null)}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Kies een leerling om de gegevens te downloaden, de verwerking te
          beperken of de leerling te verwijderen.
        </p>
      )}
    </PanelCard>
  );
}

function StudentActions({
  student,
  onErased,
}: {
  student: PickedStudent;
  onErased: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const preview = useQuery(
    trpc.privacy.erasePreview.queryOptions({ userId: student.id }),
  );
  const exportStudent = useMutation(
    trpc.privacy.exportStudent.mutationOptions(),
  );
  const setRestriction = useMutation(
    trpc.privacy.setRestriction.mutationOptions(),
  );
  const [dialog, setDialog] = useState<"restrict" | "erase" | null>(null);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.privacy.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.student.pathKey() }),
    ]);

  async function handleExport() {
    try {
      const data = await exportStudent.mutateAsync({ userId: student.id });
      downloadTextFile(
        exportFileName(student.studentNumber),
        JSON.stringify(data, null, 2),
        "application/json;charset=utf-8",
      );
      const message = `Gegevens van ${student.name} gedownload.`;
      toast.success(message);
      announce(message);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  if (preview.isPending) return <LoadingState variant="inline" />;
  if (preview.isError) {
    return (
      <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
    );
  }

  const p = preview.data;
  const restriction = p.holds.find((h) => h.kind === "restriction");

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{p.name}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              Leerlingnummer {p.studentNumber}
              {restriction ? (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-ink">
                  <Lock className="size-3" aria-hidden="true" />
                  Verwerking beperkt
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <Button variant="link" size="sm" asChild className="px-0">
          <Link href={routes.docent.student(student.id)}>
            Naar de leerlingpagina
          </Link>
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Klassen", p.classes],
          ["Pogingen", p.attempts],
          ["Antwoorden", p.answers],
          ["Logboekregels", p.events],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-display text-lg font-semibold tabular-nums">
              {Number(value).toLocaleString("nl-NL")}
            </dd>
          </div>
        ))}
      </dl>

      {p.holds.length > 0 ? (
        <Notice tone="info" title="Bewaarblokkade" icon={Lock}>
          <ul className="flex flex-col gap-1">
            {p.holds.map((h) => (
              <li key={h.id}>
                <span className="font-medium text-foreground">
                  {HOLD_KIND_LABELS[h.kind]}
                </span>
                : {h.reason}
                {h.until ? ` (tot en met ${formatDate(h.until)})` : ""}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={exportStudent.isPending}
          aria-busy={exportStudent.isPending}
        >
          {exportStudent.isPending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          Gegevens downloaden (JSON)
        </Button>
        {restriction ? (
          <ConfirmDialog
            title="Beperking opheffen?"
            description={`${p.name} kan weer inloggen en de gegevens vallen weer onder de gewone bewaartermijnen.`}
            confirmLabel="Beperking opheffen"
            trigger={
              <Button variant="outline">
                <LockOpen aria-hidden="true" />
                Beperking opheffen
              </Button>
            }
            onConfirm={async () => {
              await setRestriction.mutateAsync({
                userId: student.id,
                restricted: false,
              });
              const message = `De beperking voor ${p.name} is opgeheven.`;
              toast.success(message);
              announce(message);
              await invalidate();
            }}
          />
        ) : (
          <Button variant="outline" onClick={() => setDialog("restrict")}>
            <Lock aria-hidden="true" />
            Verwerking beperken
          </Button>
        )}
        <Button
          variant="destructive"
          onClick={() => setDialog("erase")}
          className="sm:ml-auto"
        >
          <Trash2 aria-hidden="true" />
          Leerling en alle gegevens verwijderen
        </Button>
      </div>

      <RestrictDialog
        open={dialog === "restrict"}
        onOpenChange={(open) => setDialog(open ? "restrict" : null)}
        studentName={p.name}
        onConfirm={async (reason) => {
          await setRestriction.mutateAsync({
            userId: student.id,
            restricted: true,
            reason,
          });
          const message = `De verwerking voor ${p.name} is beperkt.`;
          toast.success(message);
          announce(message);
          await invalidate();
        }}
      />
      <EraseDialog
        open={dialog === "erase"}
        onOpenChange={(open) => setDialog(open ? "erase" : null)}
        preview={p}
        onErased={async () => {
          const message = `${p.name} (${p.studentNumber}) en alle gegevens zijn verwijderd.`;
          toast.success(message);
          announce(message);
          onErased();
          await invalidate();
        }}
        userId={student.id}
      />
    </div>
  );
}

function RestrictDialog({
  open,
  onOpenChange,
  studentName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Vul een reden in.");
      document.getElementById(reasonId)?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          setError(null);
          setReason("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Verwerking beperken voor {studentName}</DialogTitle>
            <DialogDescription>
              De leerling kan niet meer inloggen en de gegevens worden niet
              automatisch verwijderd, totdat je de beperking opheft. Gebruik dit
              bijvoorbeeld als een leerling of ouder de juistheid van gegevens
              betwist (AVG artikel 18).
            </DialogDescription>
          </DialogHeader>
          <FormField
            label="Reden"
            htmlFor={reasonId}
            required
            error={error ?? undefined}
            description="Alleen zichtbaar voor docenten. Noem geen gezondheids- of andere gevoelige gegevens."
          >
            <textarea
              id={reasonId}
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(e) => setReason(e.target.value)}
              aria-required="true"
              className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
            />
          </FormField>
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
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Lock aria-hidden="true" />
              )}
              Verwerking beperken
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EraseDialog({
  open,
  onOpenChange,
  preview: p,
  userId,
  onErased,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ErasePreview;
  userId: string;
  onErased: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const erase = useMutation(trpc.privacy.eraseStudent.mutationOptions());
  const matches = typed.trim() === p.studentNumber && p.studentNumber !== "";
  const hold = p.holds[0];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!matches) {
      setError("Het leerlingnummer klopt niet.");
      return;
    }
    setError(null);
    try {
      await erase.mutateAsync({ userId, confirmStudentNumber: typed.trim() });
      setTyped("");
      onOpenChange(false);
      await onErased();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (erase.isPending) return;
        if (!next) {
          setTyped("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent role="alertdialog" className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>
              {p.name} ({p.studentNumber}) definitief verwijderen?
            </DialogTitle>
            <DialogDescription>
              {hold
                ? `Voor deze leerling geldt een bewaarblokkade: ${hold.reason}. Hef de blokkade eerst op.`
                : `Je verwijdert het account, ${plural(p.classes, "klaslidmaatschap", "klaslidmaatschappen")}, ${plural(p.attempts, "poging", "pogingen")} met ${plural(p.answers, "antwoord", "antwoorden")} en ${plural(p.events, "logboekregel", "logboekregels")}. Dit kan niet ongedaan worden gemaakt. In back-ups blijven gegevens nog maximaal ${p.backupDays} dagen bestaan.`}
            </DialogDescription>
          </DialogHeader>
          {hold ? null : (
            <FormField
              label="Typ het leerlingnummer ter bevestiging"
              htmlFor={inputId}
              error={error ?? undefined}
              required
            >
              <Input
                id={inputId}
                value={typed}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => setTyped(e.target.value)}
                className="max-w-xs font-mono"
              />
            </FormField>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={erase.isPending}
              onClick={() => onOpenChange(false)}
            >
              {hold ? "Sluiten" : "Annuleren"}
            </Button>
            {hold ? null : (
              <Button
                type="submit"
                variant="destructive"
                disabled={!matches || erase.isPending}
                aria-busy={erase.isPending}
              >
                {erase.isPending ? (
                  <Loader2
                    className="motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Trash2 aria-hidden="true" />
                )}
                Definitief verwijderen
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
