"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CircleCheck,
  Loader2,
  Lock,
} from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { FormFieldset } from "@/components/a11y/form-fieldset";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Stepper } from "@/components/ui/stepper";
import { HOLD_KIND_LABELS } from "@/lib/privacy/retention";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { formatDate, plural } from "../students/format";
import { Notice, PanelCard } from "./notice";

type Result = RouterOutputs["privacy"]["closeSchoolYear"];
type Options = {
  archiveClasses: boolean;
  deleteEvents: boolean;
  deleteAttempts: boolean;
  deleteLeavers: boolean;
};

const STEPS = [
  { id: 1, title: "Schooljaar kiezen" },
  { id: 2, title: "Controleren" },
  { id: 3, title: "Wat moet er gebeuren?" },
  { id: 4, title: "Bevestigen" },
];

export function SchoolYearWizard() {
  const trpc = useTRPC();
  const years = useQuery(trpc.privacy.schoolYears.queryOptions());
  const [step, setStep] = useState(1);
  const [year, setYear] = useState<string | null>(null);
  const [options, setOptions] = useState<Options>({
    archiveClasses: true,
    deleteEvents: true,
    deleteAttempts: false,
    deleteLeavers: true,
  });
  const [result, setResult] = useState<Result | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  const go = (next: number) => {
    setStep(next);
    // Move focus to the step heading so screen readers hear the new step.
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const reset = () => {
    setResult(null);
    setYear(null);
    go(1);
  };

  return (
    <PanelCard
      title="Schooljaar afsluiten"
      description="Aan het eind van het schooljaar: archiveer de klassen en verwijder gegevens die niet meer nodig zijn. Afnames en leerlingen met een bewaarblokkade worden overgeslagen."
    >
      {years.isPending ? (
        <LoadingState variant="list" />
      ) : years.isError ? (
        <ErrorState error={years.error} onRetry={() => years.refetch()} />
      ) : years.data.years.length === 0 ? (
        <EmptyBlock
          icon={CalendarCheck}
          title="Geen schooljaren gevonden"
          description="Geef klassen een schooljaar (bijvoorbeeld 2026-2027) om ze per jaar af te sluiten."
        />
      ) : result ? (
        <ResultSummary result={result} onDone={reset} />
      ) : (
        <Stepper steps={STEPS} value={step} onValueChange={go} size="sm">
          <div className="flex flex-col gap-5">
            <h3
              ref={headingRef}
              id={headingId}
              tabIndex={-1}
              className="text-base font-semibold outline-none"
            >
              Stap {step} van 4: {STEPS[step - 1]?.title}
            </h3>
            {step === 1 ? (
              <ChooseYear
                years={years.data.years}
                withoutYear={years.data.classesWithoutYear}
                value={year}
                onChange={setYear}
                onNext={() => go(2)}
              />
            ) : null}
            {step === 2 && year ? (
              <CheckYear
                year={year}
                onBack={() => go(1)}
                onNext={() => go(3)}
              />
            ) : null}
            {step === 3 && year ? (
              <ChooseOptions
                options={options}
                onChange={setOptions}
                onBack={() => go(2)}
                onNext={() => go(4)}
              />
            ) : null}
            {step === 4 && year ? (
              <ConfirmClose
                year={year}
                options={options}
                onBack={() => go(3)}
                onDone={setResult}
              />
            ) : null}
          </div>
        </Stepper>
      )}
    </PanelCard>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel = "Volgende",
  nextDisabled,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Vorige
        </Button>
      ) : (
        <span />
      )}
      {onNext ? (
        <Button type="button" onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
          <ArrowRight aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function ChooseYear({
  years,
  withoutYear,
  value,
  onChange,
  onNext,
}: {
  years: RouterOutputs["privacy"]["schoolYears"]["years"];
  withoutYear: number;
  value: string | null;
  onChange: (year: string) => void;
  onNext: () => void;
}) {
  const name = useId();
  return (
    <>
      <FormFieldset legend="Welk schooljaar wil je afsluiten?">
        <div className="grid gap-2 sm:grid-cols-2">
          {years.map((y) => (
            <label
              key={y.schoolYear}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                value === y.schoolYear
                  ? "border-primary bg-primary/[0.06]"
                  : "hover:bg-muted/40",
              )}
            >
              <input
                type="radio"
                name={name}
                value={y.schoolYear}
                checked={value === y.schoolYear}
                onChange={() => onChange(y.schoolYear)}
                className="mt-1 size-4 accent-[var(--primary)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold tabular-nums">
                  {y.schoolYear}
                </span>
                <span className="text-sm text-muted-foreground">
                  {plural(y.classes, "klas", "klassen")}
                  {y.archivedClasses > 0
                    ? ` (${y.archivedClasses} gearchiveerd)`
                    : ""}{" "}
                  · {plural(y.students, "leerling", "leerlingen")} ·{" "}
                  {plural(y.attempts, "poging", "pogingen")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </FormFieldset>
      {withoutYear > 0 ? (
        <p className="text-sm text-muted-foreground">
          {plural(withoutYear, "klas heeft", "klassen hebben")} geen schooljaar
          en {withoutYear === 1 ? "staat" : "staan"} hier niet bij.
        </p>
      ) : null}
      <Nav onNext={onNext} nextDisabled={!value} />
    </>
  );
}

function HoldsList({
  holds,
}: {
  holds: RouterOutputs["privacy"]["schoolYearPreview"]["holds"];
}) {
  if (holds.length === 0) return null;
  return (
    <Notice tone="info" icon={Lock} title="Deze gegevens worden overgeslagen">
      <ul className="flex flex-col gap-1">
        {holds.map((h) => (
          <li key={h.id}>
            <span className="font-medium text-foreground">{h.target}</span> –{" "}
            {HOLD_KIND_LABELS[h.kind]}: {h.reason}
            {h.until ? ` (tot en met ${formatDate(h.until)})` : ""}
          </li>
        ))}
      </ul>
    </Notice>
  );
}

function CheckYear({
  year,
  onBack,
  onNext,
}: {
  year: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const trpc = useTRPC();
  const preview = useQuery(
    trpc.privacy.schoolYearPreview.queryOptions({ schoolYear: year }),
  );
  if (preview.isPending) return <LoadingState variant="inline" />;
  if (preview.isError) {
    return (
      <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
    );
  }
  const p = preview.data;
  return (
    <>
      <p className="text-[0.95rem] leading-relaxed">
        In {p.schoolYear} zitten {plural(p.classes, "klas", "klassen")},{" "}
        {plural(p.students, "leerling", "leerlingen")} en{" "}
        {plural(p.attempts, "poging", "pogingen")}.{" "}
        {plural(p.leavers, "leerling zit", "leerlingen zitten")} niet in een
        klas van een later schooljaar.
      </p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Antwoorden", p.answers],
          ["Logboekregels", p.events],
          ["Al gearchiveerd", p.archivedClasses],
          ["Vertrekkende leerlingen", p.leavers],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border bg-muted/20 px-3 py-2.5"
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-display text-lg font-semibold tabular-nums">
              {Number(value).toLocaleString("nl-NL")}
            </dd>
          </div>
        ))}
      </dl>
      <HoldsList holds={p.holds} />
      <Nav onBack={onBack} onNext={onNext} />
    </>
  );
}

const OPTION_ROWS: {
  key: keyof Options;
  label: string;
  help: string;
  warning?: string;
}[] = [
  {
    key: "archiveClasses",
    label: "Klassen archiveren",
    help: "De klassen verdwijnen uit de lijsten; resultaten blijven bewaard.",
  },
  {
    key: "deleteEvents",
    label: "Logboeken van toetsen verwijderen",
    help: "Het toetslogboek (vensterwissels, volledig scherm, plakpogingen, code uitvoeren) van alle pogingen in dit schooljaar.",
  },
  {
    key: "deleteAttempts",
    label: "Pogingen en antwoorden verwijderen",
    help: "Alle pogingen, antwoorden, scores en feedback van dit schooljaar.",
    warning:
      "Werk van schoolexamens (PTA) moet je minstens 6 maanden na het vaststellen van de uitslag bewaren. Zet zo nodig eerst een bewaarblokkade op die afnames.",
  },
  {
    key: "deleteLeavers",
    label: "Leerlingaccounts verwijderen die alleen in deze klassen zaten",
    help: "Leerlingen die niet in een klas van een later schooljaar of een andere actieve klas zitten, met al hun gegevens.",
  },
];

function ChooseOptions({
  options,
  onChange,
  onBack,
  onNext,
}: {
  options: Options;
  onChange: (options: Options) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const baseId = useId();
  const nothing = !Object.values(options).some(Boolean);
  return (
    <>
      <FormFieldset legend="Kies wat er met dit schooljaar gebeurt">
        <div className="flex flex-col gap-2">
          {OPTION_ROWS.map((o) => {
            const id = `${baseId}-${o.key}`;
            return (
              <div key={o.key} className="flex flex-col gap-2">
                <div className="flex items-start gap-3 rounded-xl border p-4">
                  <Checkbox
                    id={id}
                    checked={options[o.key]}
                    onCheckedChange={(checked) =>
                      onChange({ ...options, [o.key]: checked === true })
                    }
                    aria-describedby={`${id}-help`}
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <label
                      htmlFor={id}
                      className="cursor-pointer text-sm font-medium"
                    >
                      {o.label}
                    </label>
                    <span
                      id={`${id}-help`}
                      className="text-xs leading-relaxed text-muted-foreground"
                    >
                      {o.help}
                    </span>
                  </span>
                </div>
                {o.warning && options[o.key] ? (
                  <Notice tone="warning">{o.warning}</Notice>
                ) : null}
              </div>
            );
          })}
        </div>
      </FormFieldset>
      <Nav onBack={onBack} onNext={onNext} nextDisabled={nothing} />
    </>
  );
}

function ConfirmClose({
  year,
  options,
  onBack,
  onDone,
}: {
  year: string;
  options: Options;
  onBack: () => void;
  onDone: (result: Result) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const id = useId();
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{
    confirm?: string;
    password?: string;
    form?: string;
  }>({});
  const close = useMutation(trpc.privacy.closeSchoolYear.mutationOptions());
  const chosen = OPTION_ROWS.filter((o) => options[o.key]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (confirm.trim() !== "VERWIJDEREN") {
      next.confirm = "Typ VERWIJDEREN om te bevestigen.";
    }
    if (!password) next.password = "Vul je wachtwoord in.";
    setErrors(next);
    if (next.confirm || next.password) {
      document
        .getElementById(next.confirm ? `${id}-confirm` : `${id}-password`)
        ?.focus();
      return;
    }
    try {
      const result = await close.mutateAsync({
        schoolYear: year,
        ...options,
        confirm: "VERWIJDEREN",
        password,
      });
      setPassword("");
      const message = `Schooljaar ${year} is afgesloten.`;
      toast.success(message);
      announce(message);
      await queryClient.invalidateQueries();
      onDone(result);
    } catch (err) {
      const message = getErrorMessage(err);
      setErrors(
        /wachtwoord/i.test(message) ? { password: message } : { form: message },
      );
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="rounded-xl border bg-muted/20 p-4 text-sm">
        <p className="font-medium">Schooljaar {year}:</p>
        <ul className="mt-2 ml-5 list-disc space-y-1 text-muted-foreground">
          {chosen.map((o) => (
            <li key={o.key}>{o.label}</li>
          ))}
        </ul>
        {options.deleteAttempts || options.deleteLeavers ? (
          <p className="mt-3 text-destructive-ink">
            Verwijderde gegevens kun je niet terughalen.
          </p>
        ) : null}
      </div>
      <FormField
        label="Typ VERWIJDEREN om te bevestigen"
        htmlFor={`${id}-confirm`}
        required
        error={errors.confirm}
      >
        <Input
          id={`${id}-confirm`}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          className="max-w-xs font-mono"
        />
      </FormField>
      <FormField
        label="Je wachtwoord"
        htmlFor={`${id}-password`}
        required
        error={errors.password}
      >
        <PasswordInput
          id={`${id}-password`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder=""
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
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Vorige
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={close.isPending}
          aria-busy={close.isPending}
        >
          {close.isPending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <CalendarCheck aria-hidden="true" />
          )}
          Schooljaar afsluiten
        </Button>
      </div>
    </form>
  );
}

function ResultSummary({
  result: r,
  onDone,
}: {
  result: Result;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/[0.06] p-4">
        <CircleCheck
          className="mt-0.5 size-5 shrink-0 text-success-ink"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">
            Schooljaar {r.schoolYear} is afgesloten
          </p>
          <ul className="text-sm text-muted-foreground">
            <li>{plural(r.archivedClasses, "klas", "klassen")} gearchiveerd</li>
            <li>
              {plural(r.events, "logboekregel", "logboekregels")} verwijderd
            </li>
            <li>
              {plural(r.attempts, "poging", "pogingen")} met{" "}
              {plural(r.answers, "antwoord", "antwoorden")} verwijderd
            </li>
            <li>
              {plural(r.students, "leerlingaccount", "leerlingaccounts")}{" "}
              verwijderd
            </li>
            {r.skippedByHold > 0 ? (
              <li>
                {r.skippedByHold.toLocaleString("nl-NL")} overgeslagen vanwege
                een bewaarblokkade
              </li>
            ) : null}
          </ul>
        </div>
      </div>
      <HoldsList holds={r.holds} />
      <div>
        <Button variant="outline" onClick={onDone}>
          Klaar
        </Button>
      </div>
    </div>
  );
}
