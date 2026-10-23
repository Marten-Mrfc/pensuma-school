"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, ShieldAlert, TimerReset } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { routes } from "@/lib/routes";
import { useTRPC } from "@/trpc/react";
import { ExtraTimeField } from "./extra-time-field";

export type AccommodationValue = {
  extraTimePercent: number;
  allowPaste: boolean;
  ignoreFocusEvents: boolean;
};

/**
 * Help text of "Vensterwissels niet registreren". Must match what is logged
 * (src/lib/privacy/event-details.ts, studentSettings in student-access.ts):
 * the facility only switches off logFocusEvents for this student.
 */
export const IGNORE_FOCUS_HELP =
  "Voor voorleessoftware of vergrotingsprogramma's die een eigen venster openen. Uitvoeren en testen van code wordt altijd vastgelegd; het verlaten van volledig scherm en geblokkeerd plakken alleen als de toets daarom vraagt. Die tellen dan niet als vensterwissel.";

const NONE: AccommodationValue = {
  extraTimePercent: 0,
  allowPaste: false,
  ignoreFocusEvents: false,
};

/**
 * “Faciliteiten bij toetsen”: verlengde tijd, always allow paste, don't log
 * window switches. Set once per student; applies to every test.
 */
export function AccommodationPanel({
  userId,
  value,
  restricted = false,
}: {
  userId: string;
  value: AccommodationValue | null;
  /** Processing restricted (AVG art. 18): show the facilities, no changes. */
  restricted?: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const id = useId();
  const saved = value ?? NONE;
  const [draft, setDraft] = useState<AccommodationValue>(saved);
  const dirty =
    draft.extraTimePercent !== saved.extraTimePercent ||
    draft.allowPaste !== saved.allowPaste ||
    draft.ignoreFocusEvents !== saved.ignoreFocusEvents;

  const save = useMutation(
    trpc.accommodation.set.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.student.pathKey() }),
          queryClient.invalidateQueries({
            queryKey: trpc.accommodation.pathKey(),
          }),
        ]);
        toast.success("Faciliteiten opgeslagen");
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    }),
  );

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs"
    >
      <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-3">
        <h2
          id={`${id}-title`}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <TimerReset
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          Faciliteiten bij toetsen
        </h2>
      </header>
      <form
        className="flex flex-col gap-4 px-5 pb-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!restricted) save.mutate({ userId, ...draft });
        }}
      >
        {restricted ? (
          <p className="flex gap-2 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs text-pretty">
            <ShieldAlert
              className="mt-px size-3.5 shrink-0 text-warning-ink"
              aria-hidden="true"
            />
            <span>
              De verwerking is beperkt (AVG art. 18), dus deze faciliteiten kun
              je nu niet wijzigen. De beperking beheer je via{" "}
              <Link
                href={routes.docent.privacy}
                className="font-medium underline underline-offset-4"
              >
                Privacy &amp; gegevens
              </Link>
              .
            </span>
          </p>
        ) : null}
        <fieldset
          disabled={restricted}
          className="flex min-w-0 flex-col gap-4 disabled:opacity-70"
        >
          <legend className="sr-only">Faciliteiten</legend>
          <div className="flex flex-col gap-1.5">
            <ExtraTimeField
              value={draft.extraTimePercent}
              onChange={(extraTimePercent) =>
                setDraft((d) => ({ ...d, extraTimePercent }))
              }
              describedBy={`${id}-time-help`}
            />
            <p id={`${id}-time-help`} className="text-xs text-muted-foreground">
              Geldt automatisch bij elke toets met een tijdslimiet of eindtijd.
              Bij 50 minuten en +25% krijgt de leerling 63 minuten.
            </p>
          </div>

          <ToggleRow
            id={`${id}-paste`}
            label="Plakken altijd toestaan"
            help="Voor hulpmiddelen die via plakken werken, zoals dicteersoftware."
            checked={draft.allowPaste}
            onCheckedChange={(allowPaste) =>
              setDraft((d) => ({ ...d, allowPaste }))
            }
          />
          <ToggleRow
            id={`${id}-focus`}
            label="Vensterwissels niet registreren"
            help={IGNORE_FOCUS_HELP}
            checked={draft.ignoreFocusEvents}
            onCheckedChange={(ignoreFocusEvents) =>
              setDraft((d) => ({ ...d, ignoreFocusEvents }))
            }
          />
        </fieldset>

        <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
          <p className="flex gap-2">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            Vul nergens een diagnose of reden in. Pensuma bewaart alleen deze
            instellingen.
          </p>
          <p className="pl-5.5">
            Een toets die al bezig is, verandert niet. Gebruik daarvoor ‘Tijd
            verlengen’ in het live overzicht.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDraft(saved)}
              disabled={save.isPending}
            >
              Annuleren
            </Button>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={restricted || !dirty || save.isPending}
          >
            {save.isPending ? (
              <Loader2
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {dirty ? "Opslaan" : "Opgeslagen"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ToggleRow({
  id,
  label,
  help,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={`${id}-help`}
        className="mt-0.5"
      />
    </div>
  );
}
