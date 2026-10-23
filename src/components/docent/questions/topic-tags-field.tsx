"use client";

import { Plus, Tag, X } from "lucide-react";
import { useId, useState } from "react";
import { useAnnounce } from "@/components/a11y/live-announcer";
import {
  MAX_TAGS_PER_QUESTION,
  normalizeTag,
  normalizeTags,
  SUGGESTED_TAGS,
} from "@/lib/questions/tags";
import { cn } from "@/lib/utils";

/**
 * “Onderwerpen”: topic tags for the question bank. Type a topic and press
 * Enter (or a comma), or pick a suggestion. Tags are lower-case, at most 30
 * characters and at most 10 per question.
 */
export function TopicTagsField({
  value,
  onChange,
  extraSuggestions = [],
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Tags already used in other questions (most used first). */
  extraSuggestions?: string[];
}) {
  const id = useId();
  const announce = useAnnounce();
  const [draft, setDraft] = useState("");
  const full = value.length >= MAX_TAGS_PER_QUESTION;

  /** Add one or more topics at once (one onChange, so none get lost). */
  function add(...raw: string[]) {
    setDraft("");
    const fresh = normalizeTags(raw).filter((tag) => !value.includes(tag));
    if (fresh.length === 0 || full) return;
    const next = normalizeTags([...value, ...fresh]);
    const added = next.filter((tag) => !value.includes(tag));
    if (added.length === 0) return;
    onChange(next);
    announce(
      added.length === 1
        ? `Onderwerp ${added[0]} toegevoegd.`
        : `Onderwerpen ${added.join(", ")} toegevoegd.`,
    );
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
    announce(`Onderwerp ${tag} verwijderd.`);
  }

  const term = normalizeTag(draft);
  const suggestions = [
    ...new Set([...extraSuggestions.map(normalizeTag), ...SUGGESTED_TAGS]),
  ]
    .filter((t) => t && !value.includes(t) && (!term || t.includes(term)))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={`${id}-input`}
        className="flex items-center gap-1.5 text-sm font-medium"
      >
        <Tag className="size-3.5 text-muted-foreground" aria-hidden="true" />
        Onderwerpen
      </label>
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 shadow-xs transition-[color,box-shadow]",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring",
        )}
      >
        {value.length > 0 ? (
          <ul className="contents" aria-label="Gekozen onderwerpen">
            {value.map((tag) => (
              <li
                key={tag}
                className="inline-flex h-7 items-center gap-0.5 rounded-full bg-secondary pr-0.5 pl-2.5 text-xs font-medium text-secondary-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  aria-label={`Onderwerp ${tag} verwijderen`}
                  className="grid size-6 place-items-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          id={`${id}-input`}
          value={draft}
          readOnly={full}
          maxLength={60}
          aria-describedby={`${id}-help`}
          placeholder={
            full
              ? undefined
              : value.length === 0
                ? "bijv. lijsten, for-lus"
                : "Nog een onderwerp…"
          }
          onChange={(e) => {
            const next = e.target.value;
            if (next.includes(",")) {
              const parts = next.split(",");
              add(...parts.slice(0, -1));
              setDraft(parts.at(-1) ?? "");
            } else setDraft(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (
              e.key === "Backspace" &&
              draft === "" &&
              value.length > 0
            ) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => {
            if (draft.trim()) add(draft);
          }}
          className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground read-only:cursor-default"
        />
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {full
          ? `Het maximum van ${MAX_TAGS_PER_QUESTION} onderwerpen is bereikt.`
          : "Druk op Enter om een onderwerp toe te voegen. Met onderwerpen vind je de vraag terug in de vragenbank."}
      </p>
      {!full && suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground" id={`${id}-sugg`}>
            Suggesties:
          </span>
          <ul className="contents" aria-labelledby={`${id}-sugg`}>
            {suggestions.map((tag) => (
              <li key={tag} className="contents">
                <button
                  type="button"
                  onClick={() => add(tag)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs text-muted-foreground transition-colors outline-none hover:border-solid hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-3" aria-hidden="true" />
                  {tag}
                  <span className="sr-only"> toevoegen</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
