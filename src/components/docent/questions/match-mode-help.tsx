import { Check, X } from "lucide-react";
import { MATCH_MODE_HELP } from "@/lib/grading/match-mode-help";
import {
  OUTPUT_MATCH_MODE_LABELS,
  type OutputMatchMode,
} from "@/lib/questions/schema";
import { cn } from "@/lib/utils";

export { MATCH_MODE_HELP } from "@/lib/grading/match-mode-help";

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
              {help.examples.map((example) => (
                <div
                  key={example.expected}
                  className="grid gap-2 text-xs sm:grid-cols-[auto_1fr]"
                >
                  <span className="pt-0.5 text-muted-foreground">Verwacht</span>
                  <pre className="w-fit rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[0.72rem] leading-5 whitespace-pre-wrap">
                    {example.expected}
                  </pre>
                  <span className="pt-0.5 text-muted-foreground">Uitvoer</span>
                  <div className="flex flex-col gap-1">
                    {example.good.map((g) => (
                      <Sample key={g} text={g} ok />
                    ))}
                    {example.bad.map((b) => (
                      <Sample key={b} text={b} ok={false} />
                    ))}
                  </div>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
