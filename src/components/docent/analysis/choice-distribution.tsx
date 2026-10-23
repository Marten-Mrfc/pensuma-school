"use client";

import { Check } from "lucide-react";
import { AccessibleChart } from "@/components/a11y/accessible-chart";
import { isPopularDistractor } from "@/lib/analytics/common-errors";
import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/trpc/react";
import { formatShare, students } from "./format";

type Choices = RouterOutputs["analysis"]["assignment"]["choices"];

/** Plain text of an option (options are markdown, e.g. "`3.5`"). */
function plain(text: string): string {
  return text.replace(/`/g, "").trim();
}

type ChoiceSummary = Pick<Choices[number]["summary"], "answered" | "options">;

/**
 * One sentence for screen readers and the data table: how many students
 * answered and which option was chosen most. Only names a "most chosen"
 * option when someone actually chose it.
 */
export function choiceSummary(summary: ChoiceSummary): string {
  const top = [...summary.options].sort((a, b) => b.count - a.count)[0];
  if (!top || top.count <= 0) return "Niemand heeft deze vraag beantwoord.";
  return `${summary.answered} ${summary.answered === 1 ? "leerling antwoordde" : "leerlingen antwoordden"}. Meest gekozen: ${plain(top.text)} (${formatShare(top.percentage)})${top.correct ? ", het juiste antwoord" : ""}.`;
}

/** How often each option of the multiple-choice questions was chosen. */
export function ChoiceDistribution({ questions }: { questions: Choices }) {
  if (!questions.length) return null;
  return (
    <ul className="grid items-start gap-4 lg:grid-cols-2">
      {questions.map((q) => {
        const summary = choiceSummary(q.summary);
        return (
          <li
            key={q.questionId}
            className="rounded-xl border bg-card p-4 shadow-xs"
          >
            <AccessibleChart
              title={`V${q.number} · ${q.title}`}
              summary={summary}
              columns={[
                { key: "optie", header: "Antwoord" },
                { key: "aantal", header: "Aantal leerlingen" },
                { key: "procent", header: "Gekozen (%)" },
                { key: "juist", header: "Juist" },
              ]}
              rows={q.summary.options.map((o) => ({
                optie: plain(o.text),
                aantal: o.count,
                procent: Math.round(o.percentage * 100),
                juist: o.correct ? "ja" : "nee",
              }))}
            >
              <ul className="flex flex-col gap-2" aria-hidden="true">
                {q.summary.options.map((o) => {
                  const popular = isPopularDistractor(o);
                  return (
                    <li key={o.id} className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                        <span className="font-mono text-xs">
                          {plain(o.text)}
                        </span>
                        {o.correct ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success-ink">
                            <Check className="size-3.5" />
                            juist
                          </span>
                        ) : null}
                        {popular ? (
                          <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-sm bg-warning/15 px-2 text-xs font-medium whitespace-nowrap text-warning-ink">
                            Populaire afleider
                          </span>
                        ) : null}
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {formatShare(o.percentage)} · {students(o.count)}
                        </span>
                      </span>
                      <span className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            o.correct
                              ? "bg-success"
                              : popular
                                ? "bg-warning"
                                : "bg-muted-foreground/50",
                          )}
                          style={{
                            width: `${Math.round(o.percentage * 100)}%`,
                          }}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </AccessibleChart>
            {q.summary.multiple ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Meerdere antwoorden mogelijk: de percentages tellen op tot meer
                dan 100%.
              </p>
            ) : null}
            {q.summary.blank ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {students(q.summary.blank)} zonder antwoord.
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
