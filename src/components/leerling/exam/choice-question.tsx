"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { Markdown } from "@/components/app/markdown";
import { cn } from "@/lib/utils";
import type { ChoiceData } from "./types";

export interface ChoiceQuestionProps {
  data: ChoiceData;
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Big selectable option cards (radio or checkbox behaviour). */
export function ChoiceQuestion({ data, selected, onChange, disabled }: ChoiceQuestionProps) {
  const name = useId();
  const chosen = new Set(selected);

  const toggle = (id: string) => {
    if (data.multiple) {
      const next = new Set(chosen);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange(data.options.map((o) => o.id).filter((o) => next.has(o)));
    } else {
      onChange([id]);
    }
  };

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-3 text-sm text-muted-foreground">
        {data.multiple ? "Kies alle goede antwoorden." : "Kies één antwoord."}
      </legend>
      {data.options.map((option, index) => {
        const isChosen = chosen.has(option.id);
        return (
          <label
            key={option.id}
            className={cn(
              "group relative flex cursor-pointer items-start gap-4 rounded-xl border-2 bg-card p-4 shadow-xs transition-[border-color,background-color,box-shadow] select-none has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40 sm:p-5",
              isChosen
                ? "border-primary bg-primary/[0.06] shadow-sm"
                : "border-border hover:border-primary/40 hover:bg-accent/40",
              disabled && "cursor-not-allowed opacity-70",
            )}
          >
            <input
              type={data.multiple ? "checkbox" : "radio"}
              name={name}
              value={option.id}
              checked={isChosen}
              onChange={() => toggle(option.id)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                "grid size-8 shrink-0 place-items-center border-2 text-sm font-bold transition-colors",
                data.multiple ? "rounded-lg" : "rounded-full",
                isChosen
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground group-hover:border-primary/50",
              )}
            >
              {isChosen ? <Check className="size-4" strokeWidth={3} /> : LETTERS[index]}
            </span>
            <div className="min-w-0 flex-1 pt-1 text-[0.95rem] [&_p]:my-0 [&_pre]:my-2">
              <Markdown>{option.text || "_(leeg)_"}</Markdown>
            </div>
          </label>
        );
      })}
    </fieldset>
  );
}
