"use client";

import { Search, Tag, X } from "lucide-react";
import { useId } from "react";
import { QUESTION_TYPE_ICONS } from "@/components/docent/questions/question-icons";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { QuestionType } from "@/lib/questions/schema";
import { cn } from "@/lib/utils";

const TYPE_FILTERS: { type: QuestionType; label: string }[] = [
  { type: "code", label: "Programmeren" },
  { type: "multiple_choice", label: "Meerkeuze" },
  { type: "open", label: "Open" },
];

export type BankFilterValue = {
  query: string;
  types: QuestionType[];
  tags: string[];
  includeArchived: boolean;
};

export const EMPTY_BANK_FILTERS: BankFilterValue = {
  query: "",
  types: [],
  tags: [],
  includeArchived: false,
};

/** Search field, question type toggles and topic chips of the question bank. */
export function BankFilters({
  value,
  onChange,
  availableTags,
}: {
  value: BankFilterValue;
  onChange: (value: BankFilterValue) => void;
  /** Tags in use, most used first. */
  availableTags: { tag: string; count: number }[];
}) {
  const id = useId();
  const set = (patch: Partial<BankFilterValue>) =>
    onChange({ ...value, ...patch });
  const toggleTag = (tag: string) =>
    set({
      tags: value.tags.includes(tag)
        ? value.tags.filter((t) => t !== tag)
        : [...value.tags, tag],
    });
  // Selected tags first, then the most used ones (a short row).
  const shownTags = [
    ...value.tags.map((tag) => ({
      tag,
      count: availableTags.find((t) => t.tag === tag)?.count ?? 0,
    })),
    ...availableTags.filter((t) => !value.tags.includes(t.tag)),
  ].slice(0, Math.max(14, value.tags.length));
  const active =
    value.query.trim() !== "" ||
    value.types.length > 0 ||
    value.tags.length > 0 ||
    value.includeArchived;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          prefixIcon={
            <Search
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          }
          placeholder="Zoek op titel of opdracht"
          aria-label="Zoek op titel of opdracht"
          value={value.query}
          maxLength={200}
          onChange={(e) => set({ query: e.target.value })}
          className="sm:flex-1"
        />
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          aria-label="Vraagtype"
          value={value.types}
          onValueChange={(types) => set({ types: types as QuestionType[] })}
          className="w-full sm:w-fit"
        >
          {TYPE_FILTERS.map(({ type, label }) => {
            const Icon = QUESTION_TYPE_ICONS[type];
            return (
              <ToggleGroupItem
                key={type}
                value={type}
                className="min-w-0 flex-1 px-2 sm:flex-none sm:px-2.5"
              >
                <Icon aria-hidden="true" className="hidden sm:block" />
                {label}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {shownTags.length > 0 ? (
            <span
              id={`${id}-tags`}
              className="mr-1 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground"
            >
              <Tag className="size-3.5" aria-hidden="true" />
              Onderwerpen
            </span>
          ) : null}
          <ul
            aria-labelledby={shownTags.length > 0 ? `${id}-tags` : undefined}
            className="contents"
          >
            {shownTags.map(({ tag, count }) => {
              const on = value.tags.includes(tag);
              return (
                <li key={tag} className="contents">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-background text-foreground hover:bg-accent",
                    )}
                  >
                    {tag}
                    {count > 0 ? (
                      <span
                        className={cn(
                          "tabular-nums",
                          on ? "opacity-80" : "text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex items-center justify-between gap-3 sm:ml-auto sm:justify-end">
          <label
            htmlFor={`${id}-archived`}
            className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
          >
            <Switch
              id={`${id}-archived`}
              checked={value.includeArchived}
              onCheckedChange={(includeArchived) => set({ includeArchived })}
            />
            Ook gearchiveerde toetsen
          </label>
          {active ? (
            <button
              type="button"
              onClick={() => onChange(EMPTY_BANK_FILTERS)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden="true" />
              Wis filters
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
