import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "./visually-hidden";

export interface FormFieldsetProps {
  /** Group label, e.g. "Bewegingen" for a radio group. */
  legend: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * <fieldset> + <legend> for radio groups, checkbox groups and other grouped
 * controls (WCAG 1.3.1 / 3.3.2). A <label htmlFor> does nothing for a group.
 * The error is plain text (no role=alert): forms focus the first invalid
 * field or show a FormErrorSummary.
 */
export function FormFieldset({
  legend,
  description,
  error,
  required,
  className,
  children,
}: FormFieldsetProps) {
  const descriptionId = useId();
  const errorId = useId();
  const describedBy =
    [description ? descriptionId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <fieldset
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      data-invalid={error ? "" : undefined}
      className={cn("flex min-w-0 flex-col gap-2.5", className)}
    >
      <legend className="mb-0.5 flex items-center gap-1 text-sm leading-none font-medium text-foreground">
        {legend}
        {required ? (
          <>
            <VisuallyHidden> (verplicht)</VisuallyHidden>
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          </>
        ) : null}
      </legend>
      {description ? (
        <p
          id={descriptionId}
          className="-mt-1 text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
      ) : null}
      {children}
      {error ? (
        <p
          id={errorId}
          className="text-xs leading-relaxed font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
