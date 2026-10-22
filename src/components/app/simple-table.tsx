"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { type Key, type ReactNode, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface SimpleTableColumn<T> {
  /** Unique column id. */
  key: string;
  header: ReactNode;
  /** Cell content. Default: `row[key]` as text. */
  cell?: (row: T, index: number) => ReactNode;
  /** Enables click-to-sort on this column. */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  align?: "left" | "center" | "right";
  /** Hide below this breakpoint to keep phones readable. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
  headerClassName?: string;
}

export interface SimpleTableProps<T> {
  columns: SimpleTableColumn<T>[];
  rows: T[] | undefined;
  /** Stable key per row. Default: `row.id`, else the index. */
  getRowKey?: (row: T, index: number) => Key;
  /** Makes rows clickable (and keyboard-activatable with Enter). */
  onRowClick?: (row: T) => void;
  /** Shown when `rows` is empty. Default "Nog niets om te tonen." */
  emptyText?: ReactNode;
  /** Shows skeleton rows. */
  loading?: boolean;
  /** Accessible table caption (visually hidden). */
  caption?: string;
  className?: string;
}

const ALIGN = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;
const HIDE = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

function compare(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "nl", {
    numeric: true,
    sensitivity: "base",
  });
}

/** Lightweight, good-looking table for list pages (Dutch, responsive, optional sorting). */
export function SimpleTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  emptyText = "Nog niets om te tonen.",
  loading = false,
  caption,
  className,
}: SimpleTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    null,
  );

  let data = rows ?? [];
  if (sort) {
    const column = columns.find((c) => c.key === sort.key);
    if (column?.sortValue) {
      const get = column.sortValue;
      data = [...data].sort(
        (a, b) => compare(get(a), get(b)) * (sort.dir === "asc" ? 1 : -1),
      );
    }
  }

  function toggleSort(key: string) {
    setSort((prev) =>
      prev?.key !== key
        ? { key, dir: "asc" }
        : prev.dir === "asc"
          ? { key, dir: "desc" }
          : null,
    );
  }

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border bg-card shadow-xs",
        className,
      )}
    >
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b bg-muted/40">
              {columns.map((col) => {
                const active = sort?.key === col.key;
                const SortIcon = !active
                  ? ChevronsUpDown
                  : sort.dir === "asc"
                    ? ArrowUp
                    : ArrowDown;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={cn(
                      "h-10 px-4 text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase",
                      ALIGN[col.align ?? "left"],
                      col.hideBelow && HIDE[col.hideBelow],
                      col.headerClassName,
                    )}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          "-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                          active && "text-foreground",
                        )}
                      >
                        {col.header}
                        <SortIcon
                          className={cn("size-3.5", !active && "opacity-50")}
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? [0, 1, 2, 3].map((i) => (
                  <tr key={i} className="border-b last:border-0">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 py-3.5",
                          col.hideBelow && HIDE[col.hideBelow],
                        )}
                      >
                        <Skeleton className="h-4 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : data.map((row, index) => {
                  const key =
                    getRowKey?.(row, index) ??
                    ((row as { id?: Key } | null)?.id !== undefined
                      ? (row as { id: Key }).id
                      : index);
                  return (
                    <tr
                      key={key}
                      tabIndex={onRowClick ? 0 : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (
                                e.key === "Enter" &&
                                e.target === e.currentTarget
                              )
                                onRowClick(row);
                            }
                          : undefined
                      }
                      className={cn(
                        "border-b transition-colors last:border-0",
                        onRowClick &&
                          "cursor-pointer outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
                      )}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cn(
                            "px-4 py-3 align-middle",
                            ALIGN[col.align ?? "left"],
                            col.hideBelow && HIDE[col.hideBelow],
                            col.className,
                          )}
                        >
                          {col.cell
                            ? col.cell(row, index)
                            : String(
                                (row as Record<string, unknown>)[col.key] ?? "",
                              )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            {!loading && data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  {emptyText}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
