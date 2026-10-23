"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { FormErrorSummary } from "@/components/a11y/form-error-summary";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  RETENTION_COUNT_KEYS,
  RETENTION_COUNT_LABELS,
  type RetentionReport,
  retentionDeletedTotal,
} from "@/lib/privacy/retention";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { formatDate } from "../students/format";
import { Notice, PanelCard } from "./notice";

type Settings = RouterOutputs["privacy"]["getSettings"]["settings"];
type RetentionValues = {
  attemptEventsDays: string;
  attemptsMonths: string;
  inactiveStudentMonths: string;
  auditLogMonths: string;
  autoDeleteAttempts: boolean;
};

const FIELDS = [
  {
    key: "attemptEventsDays",
    label:
      "Logboek tijdens toetsen (vensterwissels, volledig scherm, plakken, code uitvoeren): verwijderen na",
    unit: "dagen",
    min: 7,
    max: 730,
    help: "Gerekend vanaf het einde van de poging. Advies: 30–90 dagen.",
  },
  {
    key: "attemptsMonths",
    label: "Pogingen, antwoorden en resultaten: verwijderen na",
    unit: "maanden",
    min: 6,
    max: 120,
    help: "Gerekend vanaf het sluiten van de afname. Werk van schoolexamens (PTA) bewaar je minstens 6 maanden na het vaststellen van de uitslag. Het officiële cijfer staat in jullie leerlingadministratie, bijvoorbeeld Magister of SOMtoday.",
  },
  {
    key: "inactiveStudentMonths",
    label: "Leerlingaccounts zonder actieve klas: verwijderen na",
    unit: "maanden zonder inloggen",
    min: 3,
    max: 60,
    help: "Alleen leerlingen die in geen enkele niet-gearchiveerde klas meer zitten.",
  },
  {
    key: "auditLogMonths",
    label: "Logboek van docenthandelingen: verwijderen na",
    unit: "maanden",
    min: 6,
    max: 84,
    help: "Nodig om achteraf te kunnen nagaan wie welke gegevens heeft bekeken of gewijzigd.",
  },
] as const;

type NumberKey = (typeof FIELDS)[number]["key"];

function toValues(s: Settings): RetentionValues {
  return {
    attemptEventsDays: String(s.retention.attemptEventsDays),
    attemptsMonths: String(s.retention.attemptsMonths),
    inactiveStudentMonths: String(s.retention.inactiveStudentMonths),
    auditLogMonths: String(s.retention.auditLogMonths),
    autoDeleteAttempts: s.retention.autoDeleteAttempts,
  };
}

function validate(values: RetentionValues) {
  const errors: Partial<Record<NumberKey, string>> = {};
  for (const f of FIELDS) {
    const raw = values[f.key].trim();
    const n = Number(raw);
    if (!raw || !Number.isInteger(n)) {
      errors[f.key] = "Vul een heel getal in.";
    } else if (n < f.min || n > f.max) {
      errors[f.key] = `Kies een waarde van ${f.min} tot en met ${f.max}.`;
    }
  }
  return errors;
}

function parsed(values: RetentionValues) {
  return {
    attemptEventsDays: Number(values.attemptEventsDays),
    attemptsMonths: Number(values.attemptsMonths),
    inactiveStudentMonths: Number(values.inactiveStudentMonths),
    auditLogMonths: Number(values.auditLogMonths),
    autoDeleteAttempts: values.autoDeleteAttempts,
  };
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function RetentionForm() {
  const trpc = useTRPC();
  const query = useQuery(trpc.privacy.getSettings.queryOptions());
  if (query.isPending) return <LoadingState variant="list" />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return (
    <RetentionFormInner
      key={String(query.data.updatedAt ?? "new")}
      data={query.data}
    />
  );
}

function RetentionFormInner({
  data,
}: {
  data: RouterOutputs["privacy"]["getSettings"];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const baseId = useId();
  const [values, setValues] = useState<RetentionValues>(() =>
    toValues(data.settings),
  );
  const [submitted, setSubmitted] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const errors = validate(values);
  const hasErrors = Object.keys(errors).length > 0;
  const confirmed = data.settings.retention.confirmedAt != null;
  const current = data.settings.retention;
  const numbers = parsed(values);
  const gatedChanged =
    numbers.attemptsMonths !== current.attemptsMonths ||
    numbers.inactiveStudentMonths !== current.inactiveStudentMonths ||
    numbers.autoDeleteAttempts !== current.autoDeleteAttempts;
  const dirty =
    gatedChanged ||
    numbers.attemptEventsDays !== current.attemptEventsDays ||
    numbers.auditLogMonths !== current.auditLogMonths;

  const previewInput = useDebounced(hasErrors ? null : numbers, 350);
  const preview = useQuery({
    ...trpc.privacy.retentionPreview.queryOptions({
      retention: previewInput ?? undefined,
    }),
    enabled: previewInput != null,
    placeholderData: (previous) => previous,
  });

  const update = useMutation(trpc.privacy.updateSettings.mutationOptions());
  const run = useMutation(trpc.privacy.runRetention.mutationOptions());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.privacy.pathKey() });

  const fieldId = (key: string) => `${baseId}-${key}`;
  const summary = submitted
    ? FIELDS.filter((f) => errors[f.key]).map((f) => ({
        fieldId: fieldId(f.key),
        message: `${f.label.replace(/: verwijderen na$/, "")}: ${errors[f.key]}`,
      }))
    : [];

  async function save(confirmRetention: boolean) {
    setSubmitted(true);
    if (hasErrors) {
      setFocusKey((k) => k + 1);
      throw new Error("Controleer de gemarkeerde velden.");
    }
    const {
      confirmedAt: _a,
      confirmedById: _b,
      ...retentionRest
    } = data.settings.retention;
    const result = await update.mutateAsync({
      ...data.settings,
      retention: { ...retentionRest, ...numbers },
      confirmRetention,
    });
    const message = confirmRetention
      ? "Bewaartermijnen opgeslagen en vastgesteld."
      : result.confirmationWithdrawn
        ? "Bewaartermijnen opgeslagen. Stel ze opnieuw vast om automatisch verwijderen weer aan te zetten."
        : "Bewaartermijnen opgeslagen.";
    toast.success(message);
    announce(message);
    await invalidate();
  }

  async function handleSave() {
    try {
      await save(false);
    } catch (error) {
      if (!hasErrors) toast.error(getErrorMessage(error));
    }
  }

  const report = preview.data;
  const lines = report
    ? RETENTION_COUNT_KEYS.filter(
        (k) => k !== "skippedByHold" && k !== "attemptsReset" && report[k] > 0,
      )
    : [];

  return (
    <PanelCard
      title="Bewaartermijnen"
      description={
        confirmed ? (
          <>
            Vastgesteld op {formatDate(current.confirmedAt)}
            {data.confirmedByName ? ` door ${data.confirmedByName}` : ""}.
            Wijzig je de termijnen voor pogingen of accounts, dan moet je ze
            opnieuw vaststellen.
          </>
        ) : (
          "Nog niet vastgesteld. Technische gegevens en logboeken worden al automatisch verwijderd; pogingen en accounts pas na vaststelling."
        )
      }
    >
      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <FormErrorSummary errors={summary} focusKey={focusKey} />
        <div className="grid gap-5 lg:grid-cols-2">
          {FIELDS.map((f) => (
            <FormField
              key={f.key}
              label={f.label}
              htmlFor={fieldId(f.key)}
              description={f.help}
              error={submitted ? errors[f.key] : undefined}
            >
              <Input
                id={fieldId(f.key)}
                type="number"
                inputMode="numeric"
                min={f.min}
                max={f.max}
                step={1}
                value={values[f.key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                suffix={
                  <span className="text-sm text-muted-foreground">
                    {f.unit}
                  </span>
                }
                className="max-w-xs"
              />
            </FormField>
          ))}
        </div>

        {numbers.attemptsMonths < 12 && !errors.attemptsMonths ? (
          <Notice tone="warning" title="Korte bewaartermijn voor pogingen">
            Met minder dan 12 maanden kan werk van een schoolexamen verdwijnen
            voordat een bezwaar- of beroepsprocedure klaar is. Zet zo nodig een
            bewaarblokkade op de afname.
          </Notice>
        ) : null}

        <label
          htmlFor={`${baseId}-auto`}
          className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/40"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">
              Pogingen en oude leerlingaccounts automatisch verwijderen
            </span>
            <span
              id={`${baseId}-auto-description`}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              Afnames en leerlingen met een bewaarblokkade worden overgeslagen.
            </span>
          </span>
          <Switch
            id={`${baseId}-auto`}
            checked={values.autoDeleteAttempts}
            aria-describedby={`${baseId}-auto-description`}
            onCheckedChange={(checked) =>
              setValues((v) => ({ ...v, autoDeleteAttempts: checked }))
            }
            className="mt-0.5"
          />
        </label>

        <section
          aria-labelledby={`${baseId}-preview`}
          aria-busy={preview.isFetching}
          className="flex flex-col gap-2 rounded-xl border border-dashed bg-muted/30 p-4"
        >
          <h3 id={`${baseId}-preview`} className="text-sm font-semibold">
            Bij de volgende opschoning worden verwijderd:
          </h3>
          {hasErrors ? (
            <p className="text-sm text-muted-foreground">
              Vul eerst geldige termijnen in.
            </p>
          ) : !report ? (
            <p className="text-sm text-muted-foreground">Berekenen…</p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Niets: er zijn geen gegevens waarvan de bewaartermijn voorbij is.
            </p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {lines.map((k) => (
                <li key={k} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {RETENTION_COUNT_LABELS[k]}
                  </span>
                  <span className="font-medium tabular-nums">
                    {report[k].toLocaleString("nl-NL")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {report && report.skippedByHold > 0 ? (
            <p className="text-xs text-muted-foreground">
              {report.skippedByHold.toLocaleString("nl-NL")}{" "}
              {report.skippedByHold === 1 ? "regel wordt" : "regels worden"}{" "}
              overgeslagen vanwege een bewaarblokkade.
            </p>
          ) : null}
          {values.autoDeleteAttempts && !confirmed ? (
            <p className="text-xs text-muted-foreground">
              Pogingen en accounts tellen pas mee nadat je de termijnen hebt
              vastgesteld.
            </p>
          ) : null}
          {confirmed && gatedChanged ? (
            <p className="text-xs text-muted-foreground">
              Je hebt termijnen gewijzigd die al waren vastgesteld. Na opslaan
              moet je ze opnieuw vaststellen.
            </p>
          ) : null}
        </section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="submit" disabled={update.isPending || !dirty}>
            Opslaan
          </Button>
          <ConfirmDialog
            title="Bewaartermijnen vaststellen?"
            description={
              <>
                Je legt vast dat jullie school deze bewaartermijnen heeft
                gekozen, bij voorkeur in overleg met de FG.
                {values.autoDeleteAttempts
                  ? " Pogingen, antwoorden en oude leerlingaccounts worden daarna automatisch verwijderd als hun termijn voorbij is."
                  : " Automatisch verwijderen van pogingen en accounts staat uit; dat kun je later aanzetten."}
              </>
            }
            confirmLabel="Opslaan en vaststellen"
            onConfirm={() => save(true)}
            trigger={
              <Button
                type="button"
                variant="outline"
                disabled={update.isPending}
              >
                Opslaan en vaststellen
              </Button>
            }
          />
          <ConfirmDialog
            destructive
            title="Nu opschonen?"
            description="Pensuma verwijdert nu alle gegevens waarvan de bewaartermijn voorbij is, volgens de opgeslagen instellingen. Dit gebeurt anders automatisch elke 6 uur."
            confirmLabel="Nu opschonen"
            onConfirm={async () => {
              const result: RetentionReport = await run.mutateAsync();
              const total = retentionDeletedTotal(result);
              const message =
                total === 0
                  ? "Opschoning klaar: er was niets te verwijderen."
                  : `Opschoning klaar: ${total.toLocaleString("nl-NL")} ${total === 1 ? "regel" : "regels"} verwijderd.`;
              toast.success(message);
              announce(message);
              await invalidate();
            }}
            trigger={
              <Button
                type="button"
                variant="ghost"
                className="sm:ml-auto"
                disabled={dirty}
                title={dirty ? "Sla eerst je wijzigingen op." : undefined}
              >
                <Eraser aria-hidden="true" />
                Nu opschonen
              </Button>
            }
          />
        </div>
        {dirty ? (
          <p className="text-xs text-muted-foreground">
            Je hebt niet-opgeslagen wijzigingen. Opschonen gebruikt de
            opgeslagen termijnen.
          </p>
        ) : null}
      </form>
    </PanelCard>
  );
}
