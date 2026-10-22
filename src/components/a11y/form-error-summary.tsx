"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { focusElementById } from "@/lib/a11y/focus";
import { cn } from "@/lib/utils";

export interface FormErrorSummaryItem {
  /** id of the invalid control (from useId). */
  fieldId: string;
  message: string;
}

export interface FormErrorSummaryProps {
  errors: FormErrorSummaryItem[];
  /**
   * Increment on every failed submit: the summary then takes focus, so the
   * errors are read and the links are one Tab away.
   */
  focusKey?: number;
  className?: string;
}

/** "Controleer de volgende 3 velden:" plus a link to each invalid field. */
export function FormErrorSummary({
  errors,
  focusKey,
  className,
}: FormErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hasErrors = errors.length > 0;

  useEffect(() => {
    if (focusKey === undefined || !hasErrors) return;
    ref.current?.focus();
  }, [focusKey, hasErrors]);

  if (!hasErrors) return null;

  const title =
    errors.length === 1
      ? "Controleer dit veld:"
      : `Controleer de volgende ${errors.length} velden:`;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn(
        "flex gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.05] px-4 py-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <CircleAlert
        className="mt-0.5 size-4 shrink-0 text-destructive-ink"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-semibold text-destructive-ink">{title}</p>
        <ul className="ml-4 list-disc space-y-1 marker:text-destructive-ink">
          {errors.map((error) => (
            <li key={error.fieldId}>
              <a
                href={`#${error.fieldId}`}
                onClick={(event) => {
                  if (focusElementById(error.fieldId)) event.preventDefault();
                }}
                className="font-medium text-destructive-ink underline underline-offset-[3px] outline-none hover:no-underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
              >
                {error.message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
