"use client";

import { Search } from "lucide-react";
import { useId, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ClassOption = {
  id: string;
  name: string;
  schoolYear?: string | null;
  studentCount: number;
};

/**
 * Choose one or more classes: checkboxes with student counts and a search
 * field (shown from 6 classes). A fieldset with a legend, so screen readers
 * announce the group.
 */
export function ClassMultiSelect({
  classes,
  value,
  onChange,
  legend = "Klassen",
  description,
  error,
  markId,
  markLabel = "(deze klas)",
  max = 20,
  fieldsetId,
}: {
  classes: readonly ClassOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  legend?: string;
  /** id of the fieldset (error summary links focus it). */
  fieldsetId?: string;
  description?: string;
  error?: string;
  /** Class to mark, e.g. the current class in the duplicate dialog. */
  markId?: string;
  markLabel?: string;
  max?: number;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q
    ? classes.filter((c) => c.name.toLowerCase().includes(q))
    : classes;
  const selected = new Set(value);
  const toggle = (classId: string, on: boolean) => {
    if (on) {
      if (selected.has(classId) || value.length >= max) return;
      onChange([...value, classId]);
    } else {
      onChange(value.filter((v) => v !== classId));
    }
  };
  const describedBy =
    [description ? `${id}-desc` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <fieldset
      id={fieldsetId}
      className="flex min-w-0 flex-col gap-2"
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {description ? (
        <p id={`${id}-desc`} className="-mt-1 text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {classes.length >= 6 ? (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek een klas…"
          aria-label="Zoek een klas"
          prefixIcon={<Search className="size-4" />}
        />
      ) : null}
      {classes.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          Er zijn nog geen klassen.
        </p>
      ) : (
        <ul
          className={cn(
            "relative grid max-h-72 gap-1.5 overflow-y-auto rounded-lg sm:grid-cols-2",
            error && "rounded-lg ring-1 ring-destructive/50",
          )}
        >
          {visible.map((c) => {
            const checked = selected.has(c.id);
            const itemId = `${id}-${c.id}`;
            return (
              <li key={c.id}>
                <label
                  htmlFor={itemId}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-2.5 transition-colors hover:bg-accent/40",
                    checked && "border-primary/40 bg-primary/[0.04]",
                  )}
                >
                  <Checkbox
                    id={itemId}
                    checked={checked}
                    onCheckedChange={(v) => toggle(c.id, v === true)}
                    disabled={!checked && value.length >= max}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {c.name}
                      {markId === c.id ? (
                        <span className="ml-1 font-normal text-muted-foreground">
                          {markLabel}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {c.studentCount}{" "}
                      {c.studentCount === 1 ? "leerling" : "leerlingen"}
                      {c.schoolYear ? ` · ${c.schoolYear}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          {visible.length === 0 ? (
            <li className="px-1 py-2 text-sm text-muted-foreground sm:col-span-2">
              Geen klas gevonden voor ‘{query.trim()}’.
            </li>
          ) : null}
        </ul>
      )}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
