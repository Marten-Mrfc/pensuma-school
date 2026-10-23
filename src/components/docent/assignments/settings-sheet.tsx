"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AssignmentSettings } from "@/lib/questions/schema";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { ACCESS_CODE_REGEX, normalizeAccessCode } from "./defaults";
import { fromDateTimeLocal, toDateTimeLocal } from "./format";
import { AssignmentSettingsFields } from "./settings-fields";
import { useDialogReturnFocus } from "./use-dialog-return-focus";

type Assignment = RouterOutputs["assignment"]["get"];

/** Edit an afname's title, window, time limit, access code and settings. */
export function SettingsSheet({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: Assignment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const returnFocus = useDialogReturnFocus();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 sm:max-w-xl"
        {...returnFocus}
      >
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Instellingen van de afname</SheetTitle>
          <SheetDescription>
            Wijzigingen gelden meteen, ook voor leerlingen die al bezig zijn.
          </SheetDescription>
        </SheetHeader>
        {open ? (
          <SettingsForm
            assignment={assignment}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SettingsForm({
  assignment,
  onDone,
}: {
  assignment: Assignment;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const id = useId();
  const [title, setTitle] = useState(assignment.customTitle ?? "");
  const [opensAt, setOpensAt] = useState(toDateTimeLocal(assignment.opensAt));
  const [closesAt, setClosesAt] = useState(
    toDateTimeLocal(assignment.closesAt),
  );
  const [timeLimit, setTimeLimit] = useState(
    assignment.timeLimitMinutes?.toString() ?? "",
  );
  const [code, setCode] = useState(assignment.accessCode ?? "");
  const [settings, setSettings] = useState<AssignmentSettings>(
    assignment.settings,
  );
  const [error, setError] = useState<string | null>(null);

  const update = useMutation(
    trpc.assignment.update.mutationOptions({
      onSuccess: async (res) => {
        // Grades are computed from the scale on the fly: refresh every view.
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.assignment.pathKey(),
          }),
          queryClient.invalidateQueries({ queryKey: trpc.review.pathKey() }),
          queryClient.invalidateQueries({
            queryKey: trpc.analysis.pathKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.dashboard.pathKey(),
          }),
        ]);
        toast.success("Instellingen opgeslagen", {
          description: res.recomputedDeadlines
            ? `De eindtijd van ${res.recomputedDeadlines} lopende poging(en) is bijgewerkt.`
            : undefined,
        });
        onDone();
      },
      onError: (err) => setError(getErrorMessage(err)),
    }),
  );

  const isPlanned = assignment.effectiveStatus === "planned";
  const isClosed = assignment.effectiveStatus === "closed";

  function save() {
    setError(null);
    const limit = timeLimit.trim() ? Number.parseInt(timeLimit, 10) : null;
    if (timeLimit.trim() && (!limit || limit < 1 || limit > 1440)) {
      setError(
        "Vul een tijdslimiet in tussen 1 en 1440 minuten, of laat het veld leeg.",
      );
      return;
    }
    const normalizedCode = code.trim() ? normalizeAccessCode(code) : null;
    if (normalizedCode && !ACCESS_CODE_REGEX.test(normalizedCode)) {
      setError(
        "Een toegangscode bestaat uit 3 tot 20 letters, cijfers of streepjes.",
      );
      return;
    }
    const newOpens = fromDateTimeLocal(opensAt);
    const newCloses = fromDateTimeLocal(closesAt);
    // datetime-local has minute precision: only send the times that changed.
    const minute = (d: Date | null | undefined) =>
      d ? Math.floor(new Date(d).getTime() / 60_000) : null;
    const sameTime = (a: Date | null, b: Date | null) =>
      minute(a) === minute(b);
    update.mutate({
      id: assignment.id,
      title: title.trim() || null,
      ...(isPlanned && !sameTime(newOpens, assignment.opensAt)
        ? { opensAt: newOpens }
        : {}),
      ...(!sameTime(newCloses, assignment.closesAt)
        ? { closesAt: newCloses }
        : {}),
      // Only when it changed: the server recomputes running deadlines.
      ...(limit !== assignment.timeLimitMinutes
        ? { timeLimitMinutes: limit }
        : {}),
      accessCode: normalizedCode,
      settings,
    });
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-6">
          <SheetField
            label="Titel"
            htmlFor={`${id}-title`}
            hint={`Leeg = “${assignment.test.title}”`}
          >
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={150}
              placeholder={assignment.test.title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </SheetField>

          <div className="grid gap-4 sm:grid-cols-2">
            {isPlanned ? (
              <SheetField
                label="Opent op"
                htmlFor={`${id}-opens`}
                hint="Leeg = jij opent hem zelf."
              >
                <Input
                  id={`${id}-opens`}
                  type="datetime-local"
                  value={opensAt}
                  onChange={(e) => setOpensAt(e.target.value)}
                />
              </SheetField>
            ) : null}
            <SheetField
              label="Sluit op"
              htmlFor={`${id}-closes`}
              hint={
                isClosed
                  ? "Heropen de afname om een nieuwe eindtijd te kiezen."
                  : "Leeg = jij sluit hem zelf."
              }
            >
              <Input
                id={`${id}-closes`}
                type="datetime-local"
                value={closesAt}
                disabled={isClosed}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </SheetField>
            <SheetField
              label="Tijdslimiet (minuten)"
              htmlFor={`${id}-limit`}
              hint="Leeg = geen limiet."
            >
              <Input
                id={`${id}-limit`}
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                placeholder="Geen limiet"
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
              />
            </SheetField>
            <SheetField
              label="Toegangscode"
              htmlFor={`${id}-code`}
              hint="Leeg = geen code nodig."
            >
              <Input
                id={`${id}-code`}
                value={code}
                maxLength={20}
                placeholder="Geen code"
                className="font-mono tracking-widest uppercase"
                onChange={(e) => setCode(e.target.value)}
              />
            </SheetField>
          </div>

          <AssignmentSettingsFields
            value={settings}
            onChange={setSettings}
            mode={assignment.mode}
            compact
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t bg-card px-6 py-4">
        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
          >
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onDone}
            disabled={update.isPending}
          >
            Annuleren
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? (
              <Loader2
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : null}
            Opslaan
          </Button>
        </div>
      </div>
    </>
  );
}

function SheetField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
