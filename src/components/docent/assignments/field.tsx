import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** id of a field's hint text (derived from the control's id). */
export const fieldHintId = (htmlFor: string) => `${htmlFor}-hint`;
/** id of a field's error text (derived from the control's id). */
export const fieldErrorId = (htmlFor: string) => `${htmlFor}-error`;

/**
 * `aria-describedby` for the control of a `Field`: its error first, then
 * its hint, then any extra ids. Undefined when there is nothing to link.
 */
export function fieldDescribedBy(
  htmlFor: string,
  {
    hint,
    error,
    extra = [],
  }: {
    hint?: boolean;
    error?: boolean;
    extra?: readonly (string | false | null | undefined)[];
  },
): string | undefined {
  const ids = [
    error ? fieldErrorId(htmlFor) : null,
    hint ? fieldHintId(htmlFor) : null,
    ...extra,
  ].filter((id): id is string => Boolean(id));
  return ids.length ? ids.join(" ") : undefined;
}

/**
 * Label + control + error + hint of the "Afname plannen" form. The hint
 * stays visible while there is an error, so the instruction is not lost.
 * Pass `fieldDescribedBy(htmlFor, …)` to the control itself (for a
 * composite child, the inner input), so screen readers read both texts
 * (WCAG 1.3.1, 3.3.2).
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={fieldErrorId(htmlFor)}
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={fieldHintId(htmlFor)} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
