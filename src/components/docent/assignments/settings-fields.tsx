"use client";

import {
  ClipboardX,
  Expand,
  Eye,
  FlaskConical,
  type LucideIcon,
  MonitorSmartphone,
  Play,
  Repeat,
  Shuffle,
} from "lucide-react";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  type AssignmentSettings,
  SHOW_RESULTS_LABELS,
  type ShowResults,
} from "@/lib/questions/schema";
import { cn } from "@/lib/utils";

const SHOW_RESULTS_HELP: Record<ShowResults, string> = {
  immediately:
    "Leerlingen zien hun score en de zichtbare testresultaten meteen na het inleveren.",
  after_close: "Leerlingen zien hun resultaat pas als de afname gesloten is.",
  manual: "Je geeft de resultaten zelf vrij op de resultatenpagina.",
  never: "Leerlingen zien nooit een score (alleen dat ze hebben ingeleverd).",
};

type BooleanKey = {
  [K in keyof AssignmentSettings]: AssignmentSettings[K] extends boolean
    ? K
    : never;
}[keyof AssignmentSettings];

const SWITCHES: {
  key: BooleanKey;
  label: string;
  help: string;
  icon: LucideIcon;
  group: "work" | "exam";
}[] = [
  {
    key: "shuffleQuestions",
    label: "Vragen husselen",
    help: "Iedere leerling krijgt de vragen in een andere volgorde. Lastiger om af te kijken.",
    icon: Shuffle,
    group: "work",
  },
  {
    key: "allowCodeRun",
    label: "Code uitvoeren toestaan",
    help: "Leerlingen mogen hun programma in de browser uitvoeren met de knop ‘Uitvoeren’.",
    icon: Play,
    group: "work",
  },
  {
    key: "allowSelfTest",
    label: "Zelf testen toestaan",
    help: "Leerlingen mogen de zichtbare testgevallen zelf draaien voordat ze inleveren.",
    icon: FlaskConical,
    group: "work",
  },
  {
    key: "requireFullscreen",
    label: "Volledig scherm verplichten",
    help: "De toets vraagt om volledig scherm en registreert elke keer dat de leerling dit verlaat.",
    icon: Expand,
    group: "exam",
  },
  {
    key: "logFocusEvents",
    label: "Vensterwissels registreren",
    help: "Wisselt een leerling van tabblad of venster, dan zie je dat live in het overzicht.",
    icon: MonitorSmartphone,
    group: "exam",
  },
  {
    key: "blockPaste",
    label: "Plakken blokkeren",
    help: "Plakken in de code-editor werkt niet. Pogingen om te plakken worden wel geregistreerd.",
    icon: ClipboardX,
    group: "exam",
  },
];

export function AssignmentSettingsFields({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: AssignmentSettings;
  onChange: (next: AssignmentSettings) => void;
  disabled?: boolean;
  /** Single column (for the settings sheet). */
  compact?: boolean;
}) {
  const id = useId();
  const set = <K extends keyof AssignmentSettings>(
    key: K,
    v: AssignmentSettings[K],
  ) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-6">
      <div className={cn("grid gap-4", !compact && "md:grid-cols-2")}>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${id}-results`}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
            Resultaten tonen
          </label>
          <NativeSelect
            id={`${id}-results`}
            value={value.showResults}
            disabled={disabled}
            onChange={(e) => set("showResults", e.target.value as ShowResults)}
            options={(Object.keys(SHOW_RESULTS_LABELS) as ShowResults[]).map(
              (k) => ({
                value: k,
                label: SHOW_RESULTS_LABELS[k],
              }),
            )}
          />
          <p className="text-xs text-muted-foreground">
            {SHOW_RESULTS_HELP[value.showResults]}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${id}-attempts`}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Repeat
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Max. pogingen
          </label>
          <Input
            id={`${id}-attempts`}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            disabled={disabled}
            value={value.maxAttempts}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              set(
                "maxAttempts",
                Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 1,
              );
            }}
          />
          <p className="text-xs text-muted-foreground">
            {value.maxAttempts === 1
              ? "Iedere leerling maakt de toets één keer."
              : `Leerlingen mogen het ${value.maxAttempts} keer proberen; de laatste ingeleverde poging telt.`}
          </p>
        </div>
      </div>

      {(["work", "exam"] as const).map((group) => (
        <fieldset key={group} className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group === "work" ? "Werken aan de toets" : "Toezicht"}
          </legend>
          <div className={cn("grid gap-2", !compact && "md:grid-cols-2")}>
            {SWITCHES.filter((s) => s.group === group).map((s) => {
              const Icon = s.icon;
              const switchId = `${id}-${s.key}`;
              return (
                <label
                  key={s.key}
                  htmlFor={switchId}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border bg-background/50 p-3 transition-colors hover:bg-accent/40",
                    value[s.key] && "border-primary/30 bg-primary/[0.04]",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md",
                      value[s.key]
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {s.help}
                    </span>
                  </span>
                  <Switch
                    id={switchId}
                    checked={value[s.key]}
                    disabled={disabled}
                    onCheckedChange={(checked) => set(s.key, checked)}
                    className="mt-1"
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
