"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

export type PickedStudent = {
  id: string;
  name: string;
  studentNumber: string;
};

export interface StudentPickerProps {
  /** id of the trigger button (label it with <FormField htmlFor>). */
  id: string;
  value: PickedStudent | null;
  onChange: (student: PickedStudent | null) => void;
  placeholder?: string;
  /** Show a clear button when a student is selected. */
  clearable?: boolean;
  className?: string;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Searchable student combobox (name or leerlingnummer), server-side search. */
export function StudentPicker({
  id,
  value,
  onChange,
  placeholder = "Zoek op naam of leerlingnummer",
  clearable = false,
  className,
}: StudentPickerProps) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim(), 200);
  const query = useQuery({
    ...trpc.student.list.queryOptions({
      search: debounced || undefined,
      pageSize: 20,
    }),
    enabled: open,
    placeholderData: (previous) => previous,
  });
  const rows = query.data?.rows ?? [];

  return (
    <div className={cn("flex w-full min-w-0 items-center gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            className="h-10 w-full min-w-0 justify-between font-normal"
          >
            <span
              className={cn(
                "flex min-w-0 items-center gap-2 truncate",
                !value && "text-muted-foreground",
              )}
            >
              <Search
                className="size-4 shrink-0 opacity-60"
                aria-hidden="true"
              />
              {value ? (
                <span className="truncate">
                  {value.name}{" "}
                  <span className="text-muted-foreground tabular-nums">
                    ({value.studentNumber})
                  </span>
                </span>
              ) : (
                <span className="truncate">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown
              className="size-4 shrink-0 opacity-60"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(26rem,calc(100vw-2rem))] p-0"
        >
          <Command shouldFilter={false} label="Leerling zoeken">
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Naam of leerlingnummer…"
              aria-label="Naam of leerlingnummer"
            />
            <CommandList>
              {query.isFetching && rows.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Zoeken…
                </div>
              ) : (
                <CommandEmpty>Geen leerlingen gevonden.</CommandEmpty>
              )}
              {rows.length > 0 ? (
                <CommandGroup heading="Leerlingen">
                  {rows.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={s.id}
                      onSelect={() => {
                        onChange({
                          id: s.id,
                          name: s.name,
                          studentNumber: s.studentNumber,
                        });
                        setOpen(false);
                      }}
                      className="flex items-center gap-2"
                    >
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          value?.id === s.id ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{s.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {s.studentNumber}
                          {s.classes.length
                            ? ` · ${s.classes.map((c) => c.name).join(", ")}`
                            : ""}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {clearable && value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Leerling wissen"
          onClick={() => onChange(null)}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
