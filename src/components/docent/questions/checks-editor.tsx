"use client";

import { Ban, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useId } from "react";
import { ReorderButtons } from "@/components/a11y/reorder-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  CODE_CONSTRUCT_LABELS,
  type CodeCheck,
  type CodeConstruct,
} from "@/lib/questions/schema";
import { newCheck } from "@/lib/questions/templates";
import { cn } from "@/lib/utils";
import { FieldLabel, NumberInput } from "./fields";

const CONSTRUCT_OPTIONS = (
  Object.keys(CODE_CONSTRUCT_LABELS) as CodeConstruct[]
).map((c) => ({
  value: c,
  label: CODE_CONSTRUCT_LABELS[c],
}));

const VALUE_HINT: Partial<
  Record<CodeConstruct, { label: string; placeholder: string }>
> = {
  function_call: {
    label: "Functienaam",
    placeholder: "bijv. max (leeg = elke aanroep)",
  },
  function_def: {
    label: "Functienaam",
    placeholder: "bijv. gemiddelde (leeg = elke def)",
  },
  import: {
    label: "Module",
    placeholder: "bijv. statistics (leeg = elke import)",
  },
};

type Example = { label: string; check: Omit<CodeCheck, "id" | "weight"> };

const EXAMPLES: Example[] = [
  {
    label: "Leerlingen moeten een for-lus gebruiken",
    check: {
      kind: "requires",
      construct: "for_loop",
      message: "Gebruik een for-lus.",
    },
  },
  {
    label: "while-lus verplicht",
    check: {
      kind: "requires",
      construct: "while_loop",
      message: "Gebruik een while-lus.",
    },
  },
  {
    label: "max() is verboden",
    check: {
      kind: "forbids",
      construct: "function_call",
      value: "max",
      message: "Je mag max() niet gebruiken.",
    },
  },
  {
    label: "Functie gemiddelde maken",
    check: {
      kind: "requires",
      construct: "function_def",
      value: "gemiddelde",
      message: "Maak een functie met de naam gemiddelde.",
    },
  },
  {
    label: "Geen imports",
    check: {
      kind: "forbids",
      construct: "import",
      message: "Je mag geen modules importeren.",
    },
  },
];

export function describeCheck(check: CodeCheck): string {
  const what = CODE_CONSTRUCT_LABELS[check.construct];
  const value = check.value?.trim();
  const target =
    value && check.construct === "function_call"
      ? `${value}()`
      : value && check.construct === "function_def"
        ? `def ${value}`
        : value && check.construct === "import"
          ? `import ${value}`
          : what;
  return check.kind === "requires"
    ? `Verplicht: ${target}`
    : `Verboden: ${target}`;
}

export function ChecksEditor({
  checks,
  onChange,
}: {
  checks: CodeCheck[];
  onChange: (checks: CodeCheck[]) => void;
}) {
  function set(id: string, patch: Partial<CodeCheck>) {
    onChange(checks.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function move(from: number, to: number) {
    const next = [...checks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {checks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen code-eisen. Met een eis controleer je <em>hoe</em> de
          leerling het oplost, bijvoorbeeld dat er een lus in zit of dat een
          functie niet gebruikt wordt. Dat gebeurt door de code te lezen, niet
          uit te voeren.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {checks.map((check, index) => (
              <CheckRow
                key={check.id}
                index={index}
                count={checks.length}
                check={check}
                onMove={move}
                onChange={(patch) => set(check.id, patch)}
                onRemove={() =>
                  onChange(checks.filter((c) => c.id !== check.id))
                }
              />
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Zo tellen de eisen mee: een eis die niet gehaald wordt, kost punten
            (naar het gewicht van de eis). Een gehaalde eis levert alleen punten
            op naar verhouding van de geslaagde tests: code die geen enkele test
            haalt, krijgt dus 0 punten. Heeft de vraag geen tests, dan tellen
            alleen de eisen.
          </p>
        </>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Snel toevoegen
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="xs"
            variant="outline"
            onClick={() => onChange([...checks, newCheck()])}
          >
            <Plus aria-hidden="true" />
            Lege eis
          </Button>
          {EXAMPLES.map((ex) => (
            <Button
              key={ex.label}
              size="xs"
              variant="ghost"
              className="border border-dashed text-muted-foreground hover:text-foreground"
              onClick={() => onChange([...checks, newCheck(ex.check)])}
            >
              {ex.check.kind === "requires" ? (
                <ShieldCheck aria-hidden="true" />
              ) : (
                <Ban aria-hidden="true" />
              )}
              {ex.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CheckRow({
  check,
  index,
  count,
  onMove,
  onChange,
  onRemove,
}: {
  check: CodeCheck;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onChange: (patch: Partial<CodeCheck>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const valueHint = VALUE_HINT[check.construct];
  const requires = check.kind === "requires";

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-background/60 p-3",
        requires
          ? "border-l-[3px] border-l-success/70"
          : "border-l-[3px] border-l-destructive/70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          {requires ? (
            <ShieldCheck
              className="size-4 text-success-ink"
              aria-hidden="true"
            />
          ) : (
            <Ban className="size-4 text-destructive-ink" aria-hidden="true" />
          )}
          <span className="sr-only">Eis {index + 1}: </span>
          {describeCheck(check)}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <ReorderButtons
            index={index}
            count={count}
            itemLabel={`Eis ${index + 1}`}
            itemKey={check.id}
            onMove={onMove}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Eis ${index + 1} verwijderen`}
            onClick={onRemove}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-kind`} className="text-xs">
            Soort
          </FieldLabel>
          <NativeSelect
            id={`${id}-kind`}
            sizeVariant="sm"
            value={check.kind}
            options={[
              { value: "requires", label: "Vereist" },
              { value: "forbids", label: "Verboden" },
            ]}
            onChange={(e) =>
              onChange({ kind: e.target.value as CodeCheck["kind"] })
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-construct`} className="text-xs">
            Constructie
          </FieldLabel>
          <NativeSelect
            id={`${id}-construct`}
            sizeVariant="sm"
            value={check.construct}
            options={CONSTRUCT_OPTIONS}
            onChange={(e) =>
              onChange({ construct: e.target.value as CodeConstruct })
            }
          />
        </div>
        {valueHint ? (
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={`${id}-value`} className="text-xs">
              {valueHint.label}
            </FieldLabel>
            <Input
              id={`${id}-value`}
              size="small"
              className="font-mono"
              value={check.value ?? ""}
              placeholder={valueHint.placeholder}
              onChange={(e) => onChange({ value: e.target.value || undefined })}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem]">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-message`} className="text-xs">
            Melding voor de leerling (optioneel)
          </FieldLabel>
          <Input
            id={`${id}-message`}
            size="small"
            value={check.message ?? ""}
            placeholder={
              requires
                ? "bijv. Gebruik een for-lus."
                : "bijv. Je mag max() niet gebruiken."
            }
            onChange={(e) => onChange({ message: e.target.value || undefined })}
            maxLength={200}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-weight`} className="text-xs">
            Gewicht
          </FieldLabel>
          <NumberInput
            id={`${id}-weight`}
            value={check.weight}
            min={0.1}
            max={100}
            onChange={(v) => v !== undefined && onChange({ weight: v })}
            className="h-8"
          />
        </div>
      </div>
    </li>
  );
}
