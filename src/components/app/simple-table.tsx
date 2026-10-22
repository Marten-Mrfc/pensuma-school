"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { type Key, type ReactNode, useEffect, useState } from "react";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ScrollRegion } from "@/components/a11y/scroll-region";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface SimpleTableColumn<T> {
  /** Unique column id. */
  key: string;
  header: ReactNode;
  /** Plain-text name for announcements when `header` isn't a string. */
  label?: string;
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
  /**
   * Makes each row a real link: the cell of `rowLinkColumn` (default: the
   * first column) renders a <Link> whose click area covers the whole row.
   * Preferred over onRowClick. Other buttons in such a row need
   * `relative z-10` to stay clickable above the link area.
   */
  getRowHref?: (row: T) => string | null | undefined;
  /** Column whose cell holds the row link (with getRowHref). */
  rowLinkColumn?: string;
  /**
   * Makes rows clickable (and keyboard-activatable with Enter). Prefer
   * getRowHref for navigation; with only onRowClick the row becomes
   * role="link" named by getRowLabel.
   */
  onRowClick?: (row: T) => void;
  /** Accessible name of a clickable row, e.g. the student's name. */
  getRowLabel?: (row: T, index: number) => string;
  /** Shown when `rows` is empty. Default "Nog niets om te tonen." */
  emptyText?: ReactNode;
  /** Shows skeleton rows. */
  loading?: boolean;
  /** Accessible table caption (visually hidden); also names the scroll area. */
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

function columnName<T>(col: SimpleTableColumn<T>): string {
  if (col.label) return col.label;
  return typeof col.header === "string" ? col.header : col.key;
}

/** Lightweight, good-looking table for list pages (Dutch, responsive, optional sorting). */
export function SimpleTable<T>({
  columns,
  rows,
  getRowKey,
  getRowHref,
  rowLinkColumn,
  onRowClick,
  getRowLabel,
  emptyText = "Nog niets om te tonen.",
  loading = false,
  caption,
  className,
}: SimpleTableProps<T>) {
  const announce = useAnnounce();
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    null,
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && !caption) {
      console.warn(
        "SimpleTable: geef een `caption` mee, zodat schermlezers weten waar de tabel over gaat.",
      );
    }
  }, [caption]);

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

  function toggleSort(col: SimpleTableColumn<T>) {
    const next: { key: string; dir: "asc" | "desc" } | null =
      sort?.key !== col.key
        ? { key: col.key, dir: "asc" }
        : sort.dir === "asc"
          ? { key: col.key, dir: "desc" }
          : null;
    setSort(next);
    announce(
      next
        ? `Gesorteerd op ${columnName(col)}, ${next.dir === "asc" ? "oplopend" : "aflopend"}.`
        : "Niet meer gesorteerd.",
    );
  }

  const linkColumn = getRowHref ? (rowLinkColumn ?? columns[0]?.key) : null;

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border bg-card shadow-xs",
        className,
      )}
    >
      <ScrollRegion label={caption ?? "Tabel"} className="w-full">
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
                        onClick={() => toggleSort(col)}
                        className={cn(
                          "-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
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
          <tbody aria-busy={loading || undefined}>
            {loading
              ? [0, 1, 2, 3].map((i) => (
                  <tr key={i} className="border-b last:border-0">
                    {columns.map((col, c) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 py-3.5",
                          col.hideBelow && HIDE[col.hideBelow],
                        )}
                      >
                        {i === 0 && c === 0 ? (
                          <span className="sr-only">Laden…</span>
                        ) : null}
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
                  const href = getRowHref?.(row) ?? null;
                  const clickable = !href && Boolean(onRowClick);
                  return (
                    <tr
                      key={key}
                      role={clickable ? "link" : undefined}
                      aria-label={
                        clickable
                          ? (getRowLabel?.(row, index) ??
                            `Rij ${index + 1} openen`)
                          : undefined
                      }
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => onRowClick?.(row) : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (
                                e.key === "Enter" &&
                                e.target === e.currentTarget
                              )
                                onRowClick?.(row);
                            }
                          : undefined
                      }
                      className={cn(
                        "border-b transition-colors last:border-0",
                        href &&
                          "relative hover:bg-muted/50 focus-within:bg-muted/60",
                        clickable &&
                          "cursor-pointer outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      )}
                    >
                      {columns.map((col) => {
                        const content = col.cell
                          ? col.cell(row, index)
                          : String(
                              (row as Record<string, unknown>)[col.key] ?? "",
                            );
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              "px-4 py-3 align-middle",
                              ALIGN[col.align ?? "left"],
                              col.hideBelow && HIDE[col.hideBelow],
                              col.className,
                            )}
                          >
                            {href && col.key === linkColumn ? (
                              <Link
                                href={href}
                                className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                              >
                                {content}
                              </Link>
                            ) : (
                              content
                            )}
                          </td>
                        );
                      })}
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
      </ScrollRegion>
    </div>
  );
}
