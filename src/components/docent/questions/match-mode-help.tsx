import { Check, X } from "lucide-react";
import {
  OUTPUT_MATCH_MODE_LABELS,
  type OutputMatchMode,
} from "@/lib/questions/schema";
import { cn } from "@/lib/utils";

type ModeHelp = {
  summary: string;
  expected: string;
  good: string[];
  bad: string[];
};

/** Dutch explanation + example per comparison mode (mirrors src/lib/grading/compare.ts). */
export const MATCH_MODE_HELP: Record<OutputMatchMode, ModeHelp> = {
  flexible: {
    summary:
      "Hoofdletters, spaties en leestekens tellen niet mee; getallen worden op waarde vergeleken (108.50 = 108.5). Elke verwachte regel moet in volgorde in de uitvoer staan. Extra tekst op dezelfde regel mag, extra regels alleen als het kopjes of vragen zijn (eindigen op : of ?).",
    expected: "Hallo Mark",
    good: ["hallo mark!", "Antwoord: Hallo, Mark"],
    bad: ["Hallo", "Hoi Mark"],
  },
  exact: {
    summary:
      "Elke regel moet precies gelijk zijn. Alleen spaties aan het eind van een regel en lege regels aan het eind tellen niet mee.",
    expected: "8\n22",
    good: ["8\n22"],
    bad: ["8 22", "Even: 8\n22"],
  },
  contains: {
    summary:
      "Elke verwachte regel moet ergens in de uitvoer staan (als hele woorden of getallen), in willekeurige volgorde.",
    expected: "gewonnen",
    good: ["Je hebt gewonnen!", "Score: 10\nGewonnen"],
    bad: ["Je hebt verloren"],
  },
  numbers: {
    summary:
      "Alleen de getallen tellen: hetzelfde aantal, in dezelfde volgorde, met de ingestelde tolerantie. De tekst eromheen maakt niet uit. Ook 10,5 (komma) wordt begrepen.",
    expected: "10",
    good: ["De oppervlakte is 10.0", "Oppervlakte: 10,001"],
    bad: ["Oppervlakte: 12", "4 x 2.5 = 10"],
  },
  regex: {
    summary:
      "De verwachte uitvoer is een reguliere expressie (JavaScript-notatie) die ergens in de uitvoer moet passen. Voor gevorderden.",
    expected: "^Hallo \\w+$",
    good: ["Hallo Mark"],
    bad: ["Hoi Mark"],
  },
};

const MODES = Object.keys(OUTPUT_MATCH_MODE_LABELS) as OutputMatchMode[];

function Sample({ text, ok }: { text: string; ok: boolean }) {
  const Icon = ok ? Check : X;
  return (
    <div className="flex items-start gap-1.5">
      <Icon
        className={cn(
          "mt-1 size-3.5 shrink-0",
          ok ? "text-success-ink" : "text-destructive-ink",
        )}
        aria-label={ok ? "Goed" : "Fout"}
      />
      <pre className="min-w-0 rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[0.72rem] leading-5 whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}

/** Content of the "Hoe wordt vergeleken?" popover. */
export function MatchModeHelpContent({
  current,
}: {
  current?: OutputMatchMode;
}) {
  return (
    <div className="flex max-h-[70vh] flex-col overflow-y-auto">
      <div className="border-b bg-primary/[0.06] px-4 py-3">
        <p className="text-sm font-semibold">
          Hoe wordt de uitvoer vergeleken?
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          De tekst tussen de haakjes van{" "}
          <code className="font-mono">input("…")</code> telt{" "}
          <strong className="text-foreground">nooit</strong> mee.{" "}
          <code className="font-mono">input("Hoe heet je? ")</code> en{" "}
          <code className="font-mono">input()</code> worden precies hetzelfde
          nagekeken.
        </p>
      </div>
      <ul className="divide-y">
        {MODES.map((mode) => {
          const help = MATCH_MODE_HELP[mode];
          return (
            <li
              key={mode}
              className={cn(
                "flex flex-col gap-2 px-4 py-3",
                mode === current && "bg-muted/50",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {OUTPUT_MATCH_MODE_LABELS[mode]}
                </span>
                {mode === current ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary">
                    gekozen
                  </span>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {help.summary}
              </p>
              <div className="grid gap-2 text-xs sm:grid-cols-[auto_1fr]">
                <span className="pt-0.5 text-muted-foreground">Verwacht</span>
                <pre className="w-fit rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[0.72rem] leading-5 whitespace-pre-wrap">
                  {help.expected}
                </pre>
                <span className="pt-0.5 text-muted-foreground">Uitvoer</span>
                <div className="flex flex-col gap-1">
                  {help.good.map((g) => (
                    <Sample key={g} text={g} ok />
                  ))}
                  {help.bad.map((b) => (
                    <Sample key={b} text={b} ok={false} />
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
