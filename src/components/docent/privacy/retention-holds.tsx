"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Plus, Unlock } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { FormFieldset } from "@/components/a11y/form-fieldset";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ScrollRegion } from "@/components/a11y/scroll-region";
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
import { HOLD_KIND_LABELS } from "@/lib/privacy/retention";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { formatDate } from "../students/format";
import { PanelCard } from "./notice";
import { type PickedStudent, StudentPicker } from "./student-picker";

type Hold = RouterOutputs["privacy"]["listHolds"][number];

export function RetentionHolds() {
  const trpc = useTRPC();
  const query = useQuery(trpc.privacy.listHolds.queryOptions());
  const [creating, setCreating] = useState(false);

  return (
    <PanelCard
      title="Bewaarblokkades"
      description="Gebruik een bewaarblokkade als gegevens langer bewaard moeten blijven, bijvoorbeeld bij een bezwaar- of beroepsprocedure of voor een examendossier."
      actions={
        <Button variant="outline" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          Bewaarblokkade instellen
        </Button>
      }
    >
      {query.isPending ? (
        <LoadingState variant="list" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Er zijn geen bewaarblokkades. Alle gegevens volgen de gewone
          bewaartermijnen.
        </p>
      ) : (
        <HoldsTable holds={query.data} />
      )}
      <CreateHoldDialog open={creating} onOpenChange={setCreating} />
    </PanelCard>
  );
}

function HoldsTable({ holds }: { holds: Hold[] }) {
  const caption = "Bewaarblokkades";
  return (
    <div className="overflow-hidden rounded-xl border">
      <ScrollRegion label={caption}>
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Betreft
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Soort
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Reden
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Tot en met
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                <span className="sr-only">Acties</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {holds.map((h) => (
              <HoldRow key={h.id} hold={h} />
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}

function HoldRow({ hold: h }: { hold: Hold }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const remove = useMutation(trpc.privacy.removeHold.mutationOptions());
  const unrestrict = useMutation(trpc.privacy.setRestriction.mutationOptions());
  const target = h.userId
    ? `${h.studentName ?? "Leerling"}${h.studentNumber ? ` (${h.studentNumber})` : ""}`
    : `${h.assignmentTitle ?? "Afname"}${h.className ? ` · ${h.className}` : ""}`;

  return (
    <tr className={cn("align-top", !h.active && "text-muted-foreground")}>
      <th scope="row" className="px-4 py-3 font-medium text-foreground">
        <span className="block text-xs font-normal text-muted-foreground">
          {h.userId ? "Leerling" : "Afname"}
        </span>
        {target}
      </th>
      <td className="px-4 py-3">{HOLD_KIND_LABELS[h.kind]}</td>
      <td className="max-w-xs px-4 py-3 break-words">
        {h.reason}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Ingesteld op {formatDate(h.createdAt)}
          {h.createdByName ? ` door ${h.createdByName}` : ""}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {h.until ? formatDate(h.until) : "Tot opheffen"}
        {!h.active ? <span className="block text-xs">Verlopen</span> : null}
      </td>
      <td className="px-4 py-3 text-right">
        {h.kind === "restriction" && h.userId ? (
          <ConfirmDialog
            title="Beperking opheffen?"
            description={`${h.studentName ?? "De leerling"} kan weer inloggen en de gegevens vallen weer onder de gewone bewaartermijnen.`}
            confirmLabel="Beperking opheffen"
            trigger={
              <Button variant="ghost" size="sm">
                <Unlock aria-hidden="true" />
                Beperking opheffen
              </Button>
            }
            onConfirm={async () => {
              await unrestrict.mutateAsync({
                userId: h.userId as string,
                restricted: false,
              });
              const message = "De beperking is opgeheven.";
              toast.success(message);
              announce(message);
              await queryClient.invalidateQueries({
                queryKey: trpc.privacy.pathKey(),
              });
            }}
          />
        ) : (
          <ConfirmDialog
            title="Bewaarblokkade opheffen?"
            description={`Daarna vallen de gegevens van ${target} weer onder de gewone bewaartermijnen en kunnen ze automatisch worden verwijderd.`}
            confirmLabel="Opheffen"
            trigger={
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Bewaarblokkade voor ${target} opheffen`}
              >
                <Unlock aria-hidden="true" />
                Opheffen
              </Button>
            }
            onConfirm={async () => {
              await remove.mutateAsync({ id: h.id });
              const message = "De bewaarblokkade is opgeheven.";
              toast.success(message);
              announce(message);
              await queryClient.invalidateQueries({
                queryKey: trpc.privacy.pathKey(),
              });
            }}
          />
        )}
      </td>
    </tr>
  );
}

function CreateHoldDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? <CreateHoldForm onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateHoldForm({ onDone }: { onDone: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const id = useId();
  const [target, setTarget] = useState<"assignment" | "student">("assignment");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [assignmentId, setAssignmentId] = useState("");
  const [kind, setKind] = useState<"dispute" | "exam_dossier">("dispute");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const assignments = useQuery(trpc.privacy.holdAssignments.queryOptions({}));
  const create = useMutation(trpc.privacy.createHold.mutationOptions());

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (target === "student" && !student) next.target = "Kies een leerling.";
    if (target === "assignment" && !assignmentId) {
      next.target = "Kies een afname.";
    }
    if (!reason.trim()) next.reason = "Vul een reden in.";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = next.target ? `${id}-target` : `${id}-reason`;
      document.getElementById(first)?.focus();
      return;
    }
    try {
      await create.mutateAsync({
        userId: target === "student" ? student?.id : undefined,
        assignmentId: target === "assignment" ? assignmentId : undefined,
        kind,
        reason: reason.trim(),
        until: until || undefined,
      });
      const message = "Bewaarblokkade ingesteld.";
      toast.success(message);
      announce(message);
      await queryClient.invalidateQueries({ queryKey: trpc.privacy.pathKey() });
      onDone();
    } catch (err) {
      setErrors({ form: getErrorMessage(err) });
    }
  }

  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Bewaarblokkade instellen</DialogTitle>
        <DialogDescription>
          Gegevens met een bewaarblokkade worden niet automatisch verwijderd,
          ook niet bij het afsluiten van het schooljaar.
        </DialogDescription>
      </DialogHeader>

      <FormFieldset legend="Voor">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["assignment", "Afname"],
              ["student", "Leerling"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                target === value
                  ? "border-primary bg-primary/[0.06] font-medium"
                  : "hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name={`${id}-target-kind`}
                value={value}
                checked={target === value}
                onChange={() => setTarget(value)}
                className="size-4 accent-[var(--primary)]"
              />
              {label}
            </label>
          ))}
        </div>
      </FormFieldset>

      {target === "student" ? (
        <FormField
          label="Leerling"
          htmlFor={`${id}-target`}
          required
          error={errors.target}
        >
          <StudentPicker
            id={`${id}-target`}
            value={student}
            onChange={setStudent}
          />
        </FormField>
      ) : (
        <FormField
          label="Afname"
          htmlFor={`${id}-target`}
          required
          error={errors.target}
        >
          <select
            id={`${id}-target`}
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring dark:bg-input/30"
          >
            <option value="">
              {assignments.isPending ? "Afnames laden…" : "Kies een afname"}
            </option>
            {(assignments.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} · {a.className} ({formatDate(a.createdAt)})
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormField label="Soort" htmlFor={`${id}-kind`}>
        <select
          id={`${id}-kind`}
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring dark:bg-input/30"
        >
          <option value="dispute">{HOLD_KIND_LABELS.dispute}</option>
          <option value="exam_dossier">{HOLD_KIND_LABELS.exam_dossier}</option>
        </select>
      </FormField>

      <FormField
        label="Reden"
        htmlFor={`${id}-reason`}
        required
        error={errors.reason}
        description="Bijvoorbeeld: bezwaar tegen cijfer PTA-toets, ingediend op 3 november."
      >
        <textarea
          id={`${id}-reason`}
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          aria-required="true"
          className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring aria-invalid:border-destructive dark:bg-input/30"
        />
      </FormField>

      <FormField
        label="Tot en met (optioneel)"
        htmlFor={`${id}-until`}
        description="Leeg laten: de blokkade blijft tot je haar opheft."
      >
        <Input
          id={`${id}-until`}
          type="date"
          min={minDate}
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="max-w-xs"
        />
      </FormField>

      {errors.form ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
        >
          {errors.form}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Annuleren
        </Button>
        <Button
          type="submit"
          disabled={create.isPending}
          aria-busy={create.isPending}
        >
          {create.isPending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <Lock aria-hidden="true" />
          )}
          Bewaarblokkade instellen
        </Button>
      </DialogFooter>
    </form>
  );
}
