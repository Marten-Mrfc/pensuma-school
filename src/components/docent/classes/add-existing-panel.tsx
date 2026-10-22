"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { EmptyBlock } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

export interface AddExistingPanelProps {
  classId: string;
  className: string;
  onCancel: () => void;
  onAdded: () => void;
}

/** Search existing students (not yet in this class) and add them. */
export function AddExistingPanel({ classId, className, onCancel, onAdded }: AddExistingPanelProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    ...trpc.student.list.queryOptions({
      search: debounced || undefined,
      excludeClassId: classId,
      page: 1,
      pageSize: 30,
    }),
    placeholderData: keepPreviousData,
  });

  const add = useMutation(
    trpc.class.addMembers.mutationOptions({
      onSuccess: async (res) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.class.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.student.pathKey() }),
        ]);
        toast.success(
          res.added === 1 ? `1 leerling toegevoegd aan ${className}` : `${res.added} leerlingen toegevoegd aan ${className}`,
        );
        setSelected(new Map());
        onAdded();
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    }),
  );

  function toggle(id: string, name: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });
  }

  const rows = query.data?.rows ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 sm:px-6">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op naam of leerlingnummer"
          prefixIcon={<Search className="size-4 text-muted-foreground" />}
          aria-label="Zoek een leerling"
          allowClear
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Leerlingen die al in {className} zitten worden niet getoond.
          {query.data && query.data.total > rows.length
            ? ` ${query.data.total} gevonden, de eerste ${rows.length} worden getoond. Zoek specifieker.`
            : ""}
        </p>

        {query.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyBlock
            icon={Search}
            title={debounced ? "Geen leerlingen gevonden" : "Geen andere leerlingen"}
            description={
              debounced
                ? "Controleer de spelling of zoek op leerlingnummer."
                : "Alle leerlingen zitten al in deze klas. Nieuwe leerlingen voeg je toe via Plakken of CSV."
            }
          />
        ) : (
          <ul className={cn("divide-y rounded-lg border", query.isFetching && "opacity-70")}>
            {rows.map((s) => {
              const checked = selected.has(s.id);
              return (
                <li key={s.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50",
                      checked && "bg-primary/5",
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(s.id, s.name)} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {s.name}
                        {s.banned ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">(gedeactiveerd)</span>
                        ) : null}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{s.studentNumber}</span>
                        {s.classes.length > 0 ? ` · ${s.classes.map((c) => c.name).join(", ")}` : " · geen klas"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:justify-between sm:px-6">
        <Button variant="outline" onClick={onCancel} disabled={add.isPending}>
          Annuleren
        </Button>
        <Button
          disabled={selected.size === 0 || add.isPending}
          aria-busy={add.isPending}
          onClick={() => add.mutate({ classId, userIds: [...selected.keys()] })}
        >
          {add.isPending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus aria-hidden="true" />
          )}
          {selected.size === 0
            ? "Kies leerlingen"
            : `${selected.size} ${selected.size === 1 ? "leerling" : "leerlingen"} toevoegen`}
        </Button>
      </div>
    </div>
  );
}
