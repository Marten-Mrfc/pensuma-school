import { Check, CircleCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* Static, hand-highlighted snippet: no editor bundle needed on public pages. */
function CodeLine({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="w-8 shrink-0 pr-3 text-right text-[var(--code-gutter)] select-none">
        {n}
      </span>
      <span className="whitespace-pre">{children}</span>
    </div>
  );
}

const cmt = "text-[var(--code-comment)] italic";
const str = "text-[var(--code-string)]";
const fn = "text-[var(--code-function)]";
const op = "text-[var(--code-operator)]";
const punc = "text-[var(--code-punctuation)]";

function Snippet() {
  return (
    <div className="py-3 font-mono text-[0.8rem] leading-6 sm:text-[0.84rem]">
      <CodeLine n={1}>
        <span className={cmt}># Vraag de naam en begroet</span>
      </CodeLine>
      <CodeLine n={2}>
        <span>naam </span>
        <span className={op}>=</span> <span className={fn}>input</span>
        <span className={punc}>(</span>
        <span className={str}>"Wat is je naam? "</span>
        <span className={punc}>)</span>
      </CodeLine>
      <CodeLine n={3}>
        <span className={fn}>print</span>
        <span className={punc}>(</span>
        <span className={str}>"Hallo"</span>
        <span className={punc}>, </span>
        <span>naam</span>
        <span className={punc}>)</span>
      </CodeLine>
    </div>
  );
}

export interface GradingDemoProps {
  /** `card`: just the editor + passing test. `compare`: adds the old-vs-new comparison. */
  variant?: "card" | "compare";
  className?: string;
}

/** Marketing visual: `naam = input("Wat is je naam? ")` is graded as correct. */
export function GradingDemo({ variant = "card", className }: GradingDemoProps) {
  return (
    <figure
      className={cn("flex flex-col gap-3", className)}
      aria-label="Voorbeeld: een opdracht met input() wordt goed gerekend"
    >
      <div className="overflow-hidden rounded-xl border bg-[var(--code-bg)] text-[var(--code-fg)]">
        <div className="flex h-10 items-center gap-2 border-b bg-muted/50 px-3.5">
          <span className="text-xs font-medium text-foreground">Jouw code</span>
          <span className="font-mono text-xs text-muted-foreground">
            begroeting.py
          </span>
        </div>
        <Snippet />
        <div className="border-t bg-background/60 px-4 py-3 text-[0.8rem]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">
              Test 1{" "}
              <span className="font-normal text-muted-foreground">
                · invoer
              </span>{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.75rem]">
                Sam
              </code>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-success-ink">
              <CircleCheck className="size-4" aria-hidden="true" />
              Goed
            </span>
          </div>
          <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 font-mono text-[0.78rem]">
            <dt className="font-sans text-muted-foreground">Verwacht</dt>
            <dd>Hallo Sam</dd>
            <dt className="font-sans text-muted-foreground">Uitvoer</dt>
            <dd>Hallo Sam</dd>
          </dl>
          <p className="mt-2.5 text-xs text-muted-foreground">
            De vraag “Wat is je naam?” is geen uitvoer en telt dus niet mee.
          </p>
        </div>
      </div>

      {variant === "compare" ? (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-dashed bg-card/60 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-muted-foreground">
              <X
                className="size-3.5 text-destructive"
                strokeWidth={3}
                aria-hidden="true"
              />
              Oud systeem
            </div>
            <code className="block font-mono text-[0.72rem] text-muted-foreground line-through decoration-destructive/60">
              Wat is je naam? Hallo Sam
            </code>
            <p className="mt-1.5 text-muted-foreground">
              Fout: de vraag stond in de uitvoer.
            </p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/[0.06] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground">
              <Check
                className="size-3.5 text-success-ink"
                strokeWidth={3}
                aria-hidden="true"
              />
              Pensuma
            </div>
            <code className="block font-mono text-[0.72rem] text-foreground">
              Hallo Sam
            </code>
            <p className="mt-1.5 text-muted-foreground">
              Goed: alleen echte uitvoer telt.
            </p>
          </div>
        </div>
      ) : null}
    </figure>
  );
}
