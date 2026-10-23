"use client";

import { Lightbulb } from "lucide-react";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  type AssignmentSettings,
  SHOW_RESULTS_LABELS,
  SHOW_SOLUTIONS_LABELS,
  type ShowResults,
  type ShowSolutions,
} from "@/lib/questions/schema";
import { cn } from "@/lib/utils";
import type { AssignmentMode } from "./defaults";
import { FocusLoggingHint } from "./focus-logging-hint";
import { GradingScaleFields } from "./grading-scale-fields";
import { Notice } from "./notice";

const SHOW_RESULTS_HELP: Record<ShowResults, string> = {
  immediately:
    "Leerlingen zien hun score en de zichtbare testresultaten meteen na het inleveren.",
  after_close: "Leerlingen zien hun resultaat pas als de afname gesloten is.",
  manual: "Je geeft de resultaten zelf vrij op de resultatenpagina.",
  never: "Leerlingen zien nooit een score (alleen dat ze hebben ingeleverd).",
};

/** Shown instead of the help/solution settings in exam mode. */
export const EXAM_HELP_OFF =
  "In toetsmodus zijn hints, codetips en oplossingen altijd uit.";

type BooleanKey = {
  [K in keyof AssignmentSettings]: AssignmentSettings[K] extends boolean
    ? K
    : never;
}[keyof AssignmentSettings];

type SwitchDef = {
  key: BooleanKey;
  label: string;
  help: string;
  group: "work" | "help" | "exam";
};

const SWITCHES: SwitchDef[] = [
  {
    key: "shuffleQuestions",
    label: "Vragen husselen",
    help: "Iedere leerling krijgt de vragen in een andere volgorde. Lastiger om af te kijken.",
    group: "work",
  },
  {
    key: "allowCodeRun",
    label: "Code uitvoeren toestaan",
    help: "Leerlingen mogen hun programma in de browser uitvoeren met de knop ‘Uitvoeren’.",
    group: "work",
  },
  {
    key: "allowSelfTest",
    label: "Zelf testen toestaan",
    help: "Leerlingen mogen de zichtbare testgevallen zelf draaien voordat ze inleveren.",
    group: "work",
  },
  {
    key: "allowHints",
    label: "Hints toestaan",
    help: "Leerlingen kunnen de hints bij programmeervragen bekijken. Een hint kan punten kosten; dat stel je per hint in.",
    group: "help",
  },
  {
    key: "codeTips",
    label: "Tips over veelgemaakte fouten",
    help: "Leerlingen zien een seintje bij bijvoorbeeld print in plaats van return, of een verkeerd gespelde functienaam. Er wordt nooit iets voorgezegd.",
    group: "help",
  },
  {
    key: "requireFullscreen",
    label: "Volledig scherm verplichten",
    help: "De toets vraagt om volledig scherm en registreert elke keer dat de leerling dit verlaat.",
    group: "exam",
  },
  {
    key: "logFocusEvents",
    label: "Vensterwissels registreren",
    help: "Wisselt een leerling van tabblad of venster, dan zie je dat live in het overzicht.",
    group: "exam",
  },
  {
    key: "blockPaste",
    label: "Plakken blokkeren",
    help: "Plakken in de code-editor werkt niet. Pogingen om te plakken worden wel geregistreerd.",
    group: "exam",
  },
];

const GROUP_LABELS: Record<SwitchDef["group"], string> = {
  work: "Werken aan de toets",
  help: "Hulp en oplossingen",
  exam: "Toezicht",
};

/** True when exam results are visible right away while students may retry. */
export function showsResultsBetweenAttempts(
  mode: AssignmentMode | undefined,
  settings: Pick<AssignmentSettings, "showResults" | "maxAttempts">,
): boolean {
  return (
    mode === "exam" &&
    settings.showResults === "immediately" &&
    settings.maxAttempts > 1
  );
}

export function AssignmentSettingsFields({
  value,
  onChange,
  disabled,
  compact,
  mode,
}: {
  value: AssignmentSettings;
  onChange: (next: AssignmentSettings) => void;
  disabled?: boolean;
  /** Single column (for the settings sheet). */
  compact?: boolean;
  /** Exam mode switches hints, code tips and solutions off. */
  mode?: AssignmentMode;
}) {
  const id = useId();
  const set = <K extends keyof AssignmentSettings>(
    key: K,
    v: AssignmentSettings[K],
  ) => onChange({ ...value, [key]: v });
  const exam = mode === "exam";

  return (
    <div className="flex flex-col gap-6">
      <div className={cn("grid gap-4", !compact && "md:grid-cols-2")}>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-results`} className="text-sm font-medium">
            Resultaten tonen
          </label>
          <NativeSelect
            id={`${id}-results`}
            value={value.showResults}
            disabled={disabled}
            aria-describedby={`${id}-results-help`}
            onChange={(e) => set("showResults", e.target.value as ShowResults)}
            options={(Object.keys(SHOW_RESULTS_LABELS) as ShowResults[]).map(
              (k) => ({
                value: k,
                label: SHOW_RESULTS_LABELS[k],
              }),
            )}
          />
          <p
            id={`${id}-results-help`}
            className="text-xs text-muted-foreground"
          >
            {SHOW_RESULTS_HELP[value.showResults]}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-attempts`} className="text-sm font-medium">
            Max. pogingen
          </label>
          <Input
            id={`${id}-attempts`}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            disabled={disabled}
            aria-describedby={`${id}-attempts-help`}
            value={value.maxAttempts}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              set(
                "maxAttempts",
                Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 1,
              );
            }}
          />
          <p
            id={`${id}-attempts-help`}
            className="text-xs text-muted-foreground"
          >
            {value.maxAttempts === 1
              ? "Iedere leerling maakt de toets één keer."
              : `Leerlingen mogen het ${value.maxAttempts} keer proberen; de laatste ingeleverde poging telt.`}
          </p>
        </div>
      </div>

      {showsResultsBetweenAttempts(mode, value) ? (
        <Notice tone="warning">
          Let op: met ‘direct na inleveren’ en meer dan één poging zien
          leerlingen hun resultaat (en bij meerkeuzevragen de juiste antwoorden
          pas na hun laatste poging).
        </Notice>
      ) : null}

      {(["work", "help", "exam"] as const).map((group) => (
        <fieldset key={group} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">
            {GROUP_LABELS[group]}
          </legend>
          {group === "help" && exam ? (
            <Notice tone="info" icon={Lightbulb}>
              {EXAM_HELP_OFF}
            </Notice>
          ) : (
            <div className="divide-y overflow-hidden rounded-lg border">
              {SWITCHES.filter((s) => s.group === group).map((s) => (
                <SettingSwitch
                  key={s.key}
                  def={s}
                  id={`${id}-${s.key}`}
                  checked={value[s.key]}
                  disabled={disabled}
                  onChange={(checked) => set(s.key, checked)}
                />
              ))}
              {group === "help" ? (
                <div className="flex flex-col gap-2 p-3">
                  <label
                    htmlFor={`${id}-solutions`}
                    className="text-sm font-medium"
                  >
                    Modeloplossing tonen
                  </label>
                  <NativeSelect
                    id={`${id}-solutions`}
                    value={value.showSolutions}
                    disabled={disabled}
                    aria-describedby={`${id}-solutions-help`}
                    onChange={(e) =>
                      set("showSolutions", e.target.value as ShowSolutions)
                    }
                    options={(
                      Object.keys(SHOW_SOLUTIONS_LABELS) as ShowSolutions[]
                    ).map((k) => ({
                      value: k,
                      label: SHOW_SOLUTIONS_LABELS[k],
                    }))}
                  />
                  <p
                    id={`${id}-solutions-help`}
                    className="text-xs leading-relaxed text-muted-foreground"
                  >
                    Let op: wordt dezelfde toets later nog bij een andere klas
                    afgenomen, kies dan ‘Nooit’ of ‘Na sluiten’.
                  </p>
                </div>
              ) : null}
            </div>
          )}
          {group === "exam" && value.logFocusEvents ? (
            <FocusLoggingHint id={`${id}-focus-hint`} />
          ) : null}
        </fieldset>
      ))}

      <GradingScaleFields
        value={value.grading}
        disabled={disabled}
        onChange={(grading) => onChange({ ...value, grading })}
      />
    </div>
  );
}

function SettingSwitch({
  def,
  id,
  checked,
  disabled,
  onChange,
}: {
  def: SwitchDef;
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 p-3 transition-colors hover:bg-muted/30",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{def.label}</span>
        <span
          id={`${id}-help`}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {def.help}
        </span>
      </span>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-help`}
        onCheckedChange={onChange}
        className="mt-1"
      />
    </label>
  );
}
