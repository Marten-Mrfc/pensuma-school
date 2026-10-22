"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, Search } from "lucide-react";
import { useId, useState } from "react";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { studentsSummary } from "./assignment-form-payload";

/**
 * Pick students of one class (inhaaltoets/herkansing): search, select all
 * or none, and a checkbox per student. Shows who has verlengde tijd.
 */
export function StudentPicker({
  classId,
  value,
  onChange,
  error,
  legend = "Leerlingen",
  fieldsetId,
}: {
  classId: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
  error?: string;
  legend?: string;
  /** id of the fieldset (error summary links focus it). */
  fieldsetId?: string;
}) {
  const trpc = useTRPC();
  const id = useId();
  const [query, setQuery] = useState("");
  const students = useQuery(
    trpc.assignment.classStudents.queryOptions({ classId }),
  );

  if (students.isPending) return <LoadingState variant="list" />;
  if (students.isError)
    return (
      <ErrorState error={students.error} onRetry={() => students.refetch()} />
    );

  const all = students.data;
  const q = query.trim().toLowerCase();
  const visible = q
    ? all.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.studentNumber ?? "").toLowerCase().includes(q),
      )
    : all;
  const selected = new Set(value);
  const known = new Set(all.map((s) => s.id));
  const selectedCount = value.filter((v) => known.has(v)).length;

  const setMany = (ids: string[], on: boolean) => {
    const next = new Set(value);
    for (const sid of ids) {
      if (on) next.add(sid);
      else next.delete(sid);
    }
    onChange([...next].filter((sid) => known.has(sid)));
  };

  return (
    <fieldset
      id={fieldsetId}
      className="flex min-w-0 flex-col gap-2"
      aria-describedby={`${id}-count${error ? ` ${id}-error` : ""}`}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="sm:flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op naam of leerlingnummer…"
            aria-label="Zoek een leerling"
            prefixIcon={<Search className="size-4" />}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setMany(
                visible.map((s) => s.id),
                true,
              )
            }
          >
            {q ? "Gevonden selecteren" : "Alles selecteren"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              q
                ? setMany(
                    visible.map((s) => s.id),
                    false,
                  )
                : onChange([])
            }
          >
            Niets selecteren
          </Button>
        </div>
      </div>
      <p id={`${id}-count`} className="text-xs text-muted-foreground">
        {studentsSummary(selectedCount, all.length)} geselecteerd
      </p>
      {all.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          Deze klas heeft nog geen leerlingen.
        </p>
      ) : (
        <ul
          className={cn(
            "relative grid max-h-80 gap-1 overflow-y-auto rounded-lg border bg-background p-1.5 sm:grid-cols-2",
            error && "border-destructive/60",
          )}
        >
          {visible.map((s) => {
            const itemId = `${id}-${s.id}`;
            const checked = selected.has(s.id);
            return (
              <li key={s.id}>
                <label
                  htmlFor={itemId}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50",
                    checked && "bg-primary/[0.05]",
                  )}
                >
                  <Checkbox
                    id={itemId}
                    checked={checked}
                    onCheckedChange={(v) => setMany([s.id], v === true)}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{s.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.studentNumber ?? "–"}
                    </span>
                  </span>
                  {s.extraTimePercent > 0 ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info-ink">
                      <Clock className="size-3" aria-hidden="true" />+
                      {s.extraTimePercent}%
                      <span className="sr-only"> verlengde tijd</span>
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
          {visible.length === 0 ? (
            <li className="px-2 py-3 text-sm text-muted-foreground sm:col-span-2">
              Geen leerling gevonden voor ‘{query.trim()}’.
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
