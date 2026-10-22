import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
} from "react";
import { VisuallyHidden } from "@/components/a11y/visually-hidden";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  label: ReactNode;
  /**
   * id of the control; links the <label> and the help/error text. Without
   * it, a single child element gets a generated id.
   */
  htmlFor?: string;
  description?: ReactNode;
  /** Error text; also marks the control `aria-invalid`. */
  error?: ReactNode;
  /** Shows "*" (and "verplicht" for screen readers) and sets aria-required. */
  required?: boolean;
  className?: string;
  children: ReactNode;
}

type A11yProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
};

/**
 * Label + control + help/error text. When the child is a single element it
 * receives `id`, `aria-describedby`, `aria-invalid` and `aria-required`
 * automatically. The error is plain text (no role=alert): forms move focus
 * to the first invalid field or show a FormErrorSummary instead.
 */
export function FormField({
  label,
  htmlFor,
  description,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const autoId = useId();
  const child = isValidElement(children)
    ? (children as ReactElement<A11yProps>)
    : null;
  const controlId = htmlFor ?? child?.props.id ?? autoId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  let control = children;
  if (child) {
    const describedBy = [
      child.props["aria-describedby"],
      descriptionId,
      errorId,
    ]
      .filter(Boolean)
      .join(" ");
    control = cloneElement(child, {
      id: child.props.id ?? controlId,
      "aria-describedby": describedBy || undefined,
      "aria-invalid": error ? true : child.props["aria-invalid"],
      "aria-required": required ? true : child.props["aria-required"],
    });
  }

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-invalid={error ? "" : undefined}
    >
      <label
        htmlFor={child || htmlFor ? controlId : undefined}
        className="flex items-center gap-1 text-sm leading-none font-medium text-foreground"
      >
        {label}
        {required ? (
          <>
            <VisuallyHidden> (verplicht)</VisuallyHidden>
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          </>
        ) : null}
      </label>
      {control}
      {description ? (
        <p
          id={descriptionId}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="text-xs leading-relaxed font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
