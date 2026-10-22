import { ChevronRight } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";
import { ScrollRegion } from "./scroll-region";

export interface AccessibleChartColumn {
  key: string;
  header: string;
}

export interface AccessibleChartProps {
  /** Visible chart title (h3). */
  title: string;
  /** One sentence that states the main message of the chart. */
  summary: string;
  /** Table columns; the first column labels each row. */
  columns: AccessibleChartColumn[];
  rows: Record<string, string | number>[];
  className?: string;
  /**
   * The chart itself. Wrap it in ChartFrame with `focusable={false}` and
   * `ariaLabel={summary}` so it isn't an empty tab stop.
   */
  children: ReactNode;
}

const numberFormat = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 2,
});

function formatCell(value: string | number | undefined): string {
  if (value === undefined) return "";
  return typeof value === "number" ? numberFormat.format(value) : value;
}

/**
 * Chart with a text alternative (WCAG 1.1.1 / 1.4.1): a visible title and
 * summary, plus the same data as a table behind "Toon de gegevens als tabel".
 */
export function AccessibleChart({
  title,
  summary,
  columns,
  rows,
  className,
  children,
}: AccessibleChartProps) {
  const titleId = useId();
  const summaryId = useId();
  const [first, ...rest] = columns;

  return (
    <figure
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="text-sm font-semibold text-foreground">
          {title}
        </h3>
        <p id={summaryId} className="text-sm text-muted-foreground">
          {summary}
        </p>
      </div>
      {children}
      <details className="group rounded-lg border bg-card/50 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-foreground outline-none select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          Toon de gegevens als tabel
        </summary>
        <ScrollRegion label={title} className="max-h-96 border-t">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-muted/40">
              <tr className="border-b">
                {columns.map((col, i) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      "px-3 py-2 font-semibold whitespace-nowrap text-foreground",
                      i === 0 ? "text-left" : "text-right",
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${formatCell(first ? row[first.key] : index)}-${index}`}
                  className="border-b last:border-0"
                >
                  {first ? (
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-medium text-foreground"
                    >
                      {formatCell(row[first.key])}
                    </th>
                  ) : null}
                  {rest.map((col) => (
                    <td
                      key={col.key}
                      className="px-3 py-2 text-right tabular-nums text-foreground"
                    >
                      {formatCell(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </details>
    </figure>
  );
}
